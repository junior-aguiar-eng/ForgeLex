import { isMatterWriteTransaction, withMatterWrite } from './matter-write-guard.js';
import { and, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import {
  DocumentAnchor,
  DocumentAnchorSchema,
  DocumentVersion,
  DocumentVersionSchema,
  IngestTextDocumentInput,
  IngestedTextDocument,
  LegalDocument,
  LegalDocumentSchema,
  Matter,
  MatterSchema,
} from '@forgelex/domain';
import { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';

function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function splitIntoParagraphs(content: string): Array<{ text: string; startOffset: number; endOffset: number }> {
  const paragraphs: Array<{ text: string; startOffset: number; endOffset: number }> = [];
  const paragraphPattern = /[^\r\n]+(?:\r?\n|$)/g;
  for (const match of content.matchAll(paragraphPattern)) {
    const text = match[0].replace(/\r?\n$/, '').trim();
    if (!text) continue;
    const rawStart = match.index ?? 0;
    const leadingWhitespace = match[0].search(/\S/);
    const startOffset = rawStart + Math.max(leadingWhitespace, 0);
    paragraphs.push({
      text,
      startOffset,
      endOffset: startOffset + text.length,
    });
  }
  return paragraphs;
}

function lifecycleFields(row: typeof schema.matters.$inferSelect | typeof schema.legalDocuments.$inferSelect) {
  return Object.fromEntries(['lifecycleState', 'lifecycleRevision', 'previousLifecycleState', 'archivedAt', 'archivedBy', 'trashedAt', 'trashedBy', 'restoredAt', 'restoredBy', 'purgedAt', 'purgedBy'].map(key => [key, row[key as keyof typeof row] ?? undefined]));
}

function toMatter(row: typeof schema.matters.$inferSelect): Matter {
  return MatterSchema.parse({
    ...lifecycleFields(row),
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    practiceArea: row.practiceArea ?? undefined,
    jurisdiction: row.jurisdiction ?? undefined,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toDocument(row: typeof schema.legalDocuments.$inferSelect): LegalDocument {
  return LegalDocumentSchema.parse({
    ...lifecycleFields(row),
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    title: row.title,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    contentHash: row.contentHash,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toVersion(row: typeof schema.documentVersions.$inferSelect): DocumentVersion {
  return DocumentVersionSchema.parse({
    id: row.id,
    documentId: row.documentId,
    versionNumber: row.versionNumber,
    contentHash: row.contentHash,
    content: row.content,
    createdAt: row.createdAt,
  });
}

function toAnchor(row: typeof schema.documentAnchors.$inferSelect): DocumentAnchor {
  return DocumentAnchorSchema.parse({
    id: row.id,
    documentVersionId: row.documentVersionId,
    anchorKey: row.anchorKey,
    anchorType: row.anchorType,
    ordinal: row.ordinal,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    text: row.text,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
  });
}

export class MatterRepository {
  public constructor(private readonly db: ForgeLexDatabase) {}

  public async captureWorkRevision(tenantId: string, matterId: string): Promise<number> {
    const matter = await this.getMatter(tenantId, matterId);
    if (!matter || matter.lifecycleState === 'PURGED') throw new Error('MATTER_NOT_FOUND');
    if (matter.lifecycleState !== 'ACTIVE') throw new Error('MATTER_NOT_ACTIVE');
    return matter.lifecycleRevision;
  }

  public async createMatter(input: {
    tenantId: string;
    createdBy: string;
    title: string;
    clientId?: string;
    description?: string;
    practiceArea?: string;
    jurisdiction?: string;
  }): Promise<Matter> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const matter = MatterSchema.parse({
      id,
      tenantId: input.tenantId,
      clientId: input.clientId,
      title: input.title,
      description: input.description,
      practiceArea: input.practiceArea,
      jurisdiction: input.jurisdiction,
      status: 'OPEN',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await this.db.insert(schema.matters).values({
      ...matter,
      clientId: matter.clientId,
    });
    return matter;
  }

  public async getMatter(tenantId: string, matterId: string): Promise<Matter | undefined> {
    const rows = await this.db
      .select()
      .from(schema.matters)
      .where(and(eq(schema.matters.id, matterId), eq(schema.matters.tenantId, tenantId)))
      .limit(1);
    return rows[0] ? toMatter(rows[0]) : undefined;
  }

  public async listMatters(tenantId: string): Promise<Matter[]> {
    const rows = await this.db
      .select()
      .from(schema.matters)
      .where(eq(schema.matters.tenantId, tenantId))
      .orderBy(desc(schema.matters.updatedAt));
    return rows.map(toMatter);
  }

  public async listDocuments(tenantId: string, matterId: string): Promise<LegalDocument[]> {
    const rows = await this.db
      .select()
      .from(schema.legalDocuments)
      .where(and(eq(schema.legalDocuments.tenantId, tenantId), eq(schema.legalDocuments.matterId, matterId)))
      .orderBy(desc(schema.legalDocuments.createdAt));
    return rows.map(toDocument);
  }

  public async ingestTextDocument(input: IngestTextDocumentInput): Promise<IngestedTextDocument> {
    if (!isMatterWriteTransaction(this.db)) return withMatterWrite(this.db, input, tx => new MatterRepository(tx).ingestTextDocument(input));

    const matter = await this.getMatter(input.tenantId, input.matterId);
    if (!matter) {
      throw new Error('MATTER_NOT_FOUND: matter não pertence ao tenant informado ou não existe.');
    }
    if (input.content.trim().length === 0) {
      throw new Error('DOCUMENT_CONTENT_REQUIRED: o documento precisa conter texto.');
    }

    const documentId = randomUUID();
    const versionId = randomUUID();
    const now = new Date().toISOString();
    const hash = contentHash(input.content);
    const paragraphs = splitIntoParagraphs(input.content);
    const document = LegalDocumentSchema.parse({
      id: documentId,
      tenantId: input.tenantId,
      matterId: input.matterId,
      title: input.title,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      byteSize: Buffer.byteLength(input.content, 'utf8'),
      contentHash: hash,
      status: 'INDEXED',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    const version = DocumentVersionSchema.parse({
      id: versionId,
      documentId,
      versionNumber: 1,
      contentHash: hash,
      content: input.content,
      createdAt: now,
    });
    const anchors = paragraphs.map((paragraph, ordinal) =>
      DocumentAnchorSchema.parse({
        id: randomUUID(),
        documentVersionId: versionId,
        anchorKey: `p${ordinal + 1}`,
        anchorType: 'PARAGRAPH',
        ordinal,
        startOffset: paragraph.startOffset,
        endOffset: paragraph.endOffset,
        text: paragraph.text,
        contentHash: contentHash(paragraph.text),
        createdAt: now,
      })
    );

    await this.db.transaction(async (tx) => {
      await tx.insert(schema.legalDocuments).values({
        ...document,
      });
      await tx.insert(schema.documentVersions).values({
        ...version,
      });
      if (anchors.length > 0) {
        await tx.insert(schema.documentAnchors).values(
          anchors.map((anchor) => ({ ...anchor }))
        );
      }
    });

    const documentRow = await this.db.select().from(schema.legalDocuments).where(eq(schema.legalDocuments.id, documentId)).limit(1);
    const versionRow = await this.db.select().from(schema.documentVersions).where(eq(schema.documentVersions.id, versionId)).limit(1);
    const anchorRows = await this.db
      .select()
      .from(schema.documentAnchors)
      .where(eq(schema.documentAnchors.documentVersionId, versionId))
      .orderBy(schema.documentAnchors.ordinal);

    if (!documentRow[0] || !versionRow[0]) {
      throw new Error('DOCUMENT_PERSISTENCE_FAILED: documento ingerido não pôde ser recuperado.');
    }

    return {
      document: toDocument(documentRow[0]),
      version: toVersion(versionRow[0]),
      anchors: anchorRows.map(toAnchor),
    };
  }

  public async getDocumentVersion(tenantId: string, documentId: string): Promise<{ document: LegalDocument; version: DocumentVersion; anchors: DocumentAnchor[] } | undefined> {
    const documentRows = await this.db
      .select()
      .from(schema.legalDocuments)
      .where(and(eq(schema.legalDocuments.id, documentId), eq(schema.legalDocuments.tenantId, tenantId)))
      .limit(1);
    const document = documentRows[0] ? toDocument(documentRows[0]) : undefined;
    if (!document) return undefined;

    const versionRows = await this.db
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, documentId))
      .orderBy(desc(schema.documentVersions.versionNumber))
      .limit(1);
    const version = versionRows[0] ? toVersion(versionRows[0]) : undefined;
    if (!version) return undefined;

    const anchorRows = await this.db
      .select()
      .from(schema.documentAnchors)
      .where(eq(schema.documentAnchors.documentVersionId, version.id))
      .orderBy(schema.documentAnchors.ordinal);
    return { document, version, anchors: anchorRows.map(toAnchor) };
  }

  public async getSpecificDocumentVersion(tenantId:string,matterId:string,documentId:string,versionId:string):Promise<{document:LegalDocument;version:DocumentVersion;anchors:DocumentAnchor[]}|undefined> {
    const documents=await this.db.select().from(schema.legalDocuments).where(and(eq(schema.legalDocuments.tenantId,tenantId),eq(schema.legalDocuments.matterId,matterId),eq(schema.legalDocuments.id,documentId))).limit(1);
    if(!documents[0]) return undefined;
    const versions=await this.db.select().from(schema.documentVersions).where(and(eq(schema.documentVersions.documentId,documentId),eq(schema.documentVersions.id,versionId))).limit(1);
    if(!versions[0]) return undefined;
    const anchors=await this.db.select().from(schema.documentAnchors).where(eq(schema.documentAnchors.documentVersionId,versionId)).orderBy(schema.documentAnchors.ordinal);
    return {document:toDocument(documents[0]),version:toVersion(versions[0]),anchors:anchors.map(toAnchor)};
  }
}
