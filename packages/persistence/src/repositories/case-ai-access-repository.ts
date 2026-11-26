import { withMatterWrite } from './matter-write-guard.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  CaseAiSelectionSchema,
  DraftReceivePermissionSchema,
  AnalysisPermissionSchema,
  type AnalysisPermission,
  type DraftReceivePermission,
  CaseAiGrantSchema,
  type CaseAiGrant,
  type CaseAiOwner,
  type CaseAiReader,
  type CaseAiSelection,
  type CaseAiPreview,
  type CaseItemKind,
} from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';
import { MatterRepository } from './matter-repository.js';
import { caseBinding, casePosition, boundedItems, shortText } from './case-ai-pagination.js';
export interface SelectedCaseRecord {
  kind: CaseItemKind;
  id: string;
  title: string;
  versionNumber?: number;
  fields: { field: string; text: string; documentId?: string; versionId?: string; anchorId?: string }[];
}
function grant(row: typeof s.caseAiAccessGrants.$inferSelect): CaseAiGrant {
  const { selectionJson, receivePermissionJson, analysisPermissionJson, ...rest } = row;
  return CaseAiGrantSchema.parse({
    ...rest,
    selection: JSON.parse(selectionJson),
    receivePermission: JSON.parse(receivePermissionJson),
    analysisPermission: JSON.parse(analysisPermissionJson),
    revokedAt: row.revokedAt ?? undefined,
  });
}
export class CaseAiAccessRepository {
  constructor(public readonly db: ForgeLexDatabase) {}
  private scope(o: CaseAiOwner, matterId: string) {
    return and(
      eq(s.caseAiAccessGrants.tenantId, o.tenantId),
      eq(s.caseAiAccessGrants.userId, o.userId),
      eq(s.caseAiAccessGrants.matterId, matterId),
    );
  }
  async listForOwner(o: CaseAiOwner, matterId: string): Promise<CaseAiGrant[]> {
    if (!(await new MatterRepository(this.db).getMatter(o.tenantId, matterId))) throw new Error('MATTER_NOT_FOUND');
    return (await this.db.select().from(s.caseAiAccessGrants).where(this.scope(o, matterId))).map(grant);
  }
  async listForReader(r: CaseAiReader): Promise<CaseAiGrant[]> {
    return (
      await this.db
        .select()
        .from(s.caseAiAccessGrants)
        .where(
          and(
            eq(s.caseAiAccessGrants.tenantId, r.tenantId),
            eq(s.caseAiAccessGrants.userId, r.userId),
            eq(s.caseAiAccessGrants.oauthClientId, r.oauthConnection.clientId),
            eq(s.caseAiAccessGrants.oauthGrantedAt, r.oauthConnection.grantedAt),
            eq(s.caseAiAccessGrants.status, 'ACTIVE'),
            sql`EXISTS (SELECT 1 FROM matters WHERE matters.id = ${s.caseAiAccessGrants.matterId} AND matters.tenant_id = ${s.caseAiAccessGrants.tenantId} AND matters.lifecycle_state = 'ACTIVE')`,
          ),
        )
        .orderBy(s.caseAiAccessGrants.id)
    ).map(grant);
  }
  async assertActive(r: CaseAiReader, matterId: string): Promise<CaseAiGrant> {
    if (!r.oauthConnection?.clientId || !r.oauthConnection.grantedAt) throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
    const rows = await this.db
      .select()
      .from(s.caseAiAccessGrants)
      .where(
        and(
          this.scope(r, matterId),
          eq(s.caseAiAccessGrants.oauthClientId, r.oauthConnection.clientId),
          eq(s.caseAiAccessGrants.oauthGrantedAt, r.oauthConnection.grantedAt),
          eq(s.caseAiAccessGrants.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!rows[0] || (await new MatterRepository(this.db).getMatter(r.tenantId, matterId))?.lifecycleState !== 'ACTIVE')
      throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
    return grant(rows[0]);
  }
  /** Serialize grant revocation and authorized effects on the same matter row. */
  async withActive<T>(
    reader: CaseAiReader,
    matterId: string,
    operation: (tx: ForgeLexDatabase) => Promise<T>,
  ): Promise<T> {
    return withMatterWrite(this.db, { tenantId: reader.tenantId, matterId }, async (tx) => {
      await new CaseAiAccessRepository(tx).assertActive(reader, matterId);
      return operation(tx);
    });
  }
  async loadSelection(o: CaseAiOwner, matterId: string, selection: CaseAiSelection): Promise<SelectedCaseRecord[]> {
    const matters = new MatterRepository(this.db);
    if ((await matters.getMatter(o.tenantId, matterId))?.lifecycleState !== 'ACTIVE')
      throw new Error('CASE_SELECTION_INVALID');
    const result: SelectedCaseRecord[] = [];
    for (const ref of selection.documents) {
      const d = await matters.getSpecificDocumentVersion(o.tenantId, matterId, ref.documentId, ref.versionId);
      if (!d || d.document.lifecycleState !== 'ACTIVE') throw new Error('CASE_SELECTION_INVALID');
      result.push({
        kind: 'DOCUMENT',
        id: d.document.id,
        title: d.document.title,
        versionNumber: d.version.versionNumber,
        fields: [
          { field: 'content', text: d.version.content, documentId: d.document.id, versionId: d.version.id },
          ...d.anchors.map((a) => ({
            field: 'anchor',
            text: a.text,
            documentId: d.document.id,
            versionId: d.version.id,
            anchorId: a.id,
          })),
        ],
      });
    }
    const definitions = [
      { kind: 'FACT' as const, ids: selection.factIds, table: s.facts },
      { kind: 'EVIDENCE' as const, ids: selection.evidenceIds, table: s.evidenceItems },
      { kind: 'THESIS' as const, ids: selection.thesisIds, table: s.legalTheses },
      { kind: 'AUTHORITY' as const, ids: selection.authorityIds, table: s.matterAuthorities },
    ];
    for (const def of definitions) {
      if (!def.ids.length) continue;
      const rows = await this.db
        .select()
        .from(def.table)
        .where(
          and(eq(def.table.tenantId, o.tenantId), eq(def.table.matterId, matterId), inArray(def.table.id, def.ids)),
        );
      if (rows.length !== def.ids.length) throw new Error('CASE_SELECTION_INVALID');
      for (const raw of rows) {
        const row = raw as Record<string, unknown>;
        const saved = def.kind === 'AUTHORITY' ? JSON.parse(String(row.authorityJson)) : row;
        const values =
          def.kind === 'AUTHORITY'
            ? {
                ...saved,
                title: `${saved.court ?? 'Fonte'} ${saved.processNumber ?? ''}`.trim(),
                sourceUrl: saved.fullTextUrl ?? saved.provenance?.source?.sourceUrl,
              }
            : saved;
        const fields =
          def.kind === 'FACT'
            ? ['statement', 'category', 'status']
            : def.kind === 'EVIDENCE'
              ? ['title', 'description', 'evidenceType', 'status']
              : def.kind === 'THESIS'
                ? ['title', 'statement', 'rationale', 'status']
                : [
                    'title',
                    'syllabus',
                    'court',
                    'processNumber',
                    'rapporteur',
                    'chamber',
                    'judgmentDate',
                    'publicationDate',
                    'sourceUrl',
                  ];
        result.push({
          kind: def.kind,
          id: String(row.id),
          title: String(values.title ?? values.statement ?? values.citation ?? 'Fonte do caso'),
          fields: fields
            .filter((key) => typeof values[key] === 'string')
            .map((field) => ({ field, text: values[field] as string })),
        });
      }
    }
    return result.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  }
  async preview(
    o: CaseAiOwner,
    matterId: string,
    raw: CaseAiSelection,
    page: { cursor?: string; limit?: number } = {},
  ): Promise<CaseAiPreview> {
    const selection = CaseAiSelectionSchema.parse(raw);
    const records = await this.loadSelection(o, matterId, selection);
    const matter = await new MatterRepository(this.db).getMatter(o.tenantId, matterId);
    const base = {
      matter: { id: matterId, title: shortText(matter!.title) },
      counts: {
        DOCUMENT: selection.documents.length,
        FACT: selection.factIds.length,
        EVIDENCE: selection.evidenceIds.length,
        THESIS: selection.thesisIds.length,
        AUTHORITY: selection.authorityIds.length,
      },
    };
    const binding = caseBinding([o, matterId, selection]);
    const items = records.map((r) => ({
      kind: r.kind,
      id: r.id,
      title: shortText(r.title),
      preview: shortText(r.fields[0]?.text ?? ''),
      ...(r.kind === 'DOCUMENT'
        ? {
            versionId: selection.documents.find((d) => d.documentId === r.id)!.versionId,
            versionNumber: r.versionNumber,
          }
        : {}),
    }));
    return { ...base, ...boundedItems(items, casePosition(page.cursor, binding), page.limit ?? 20, base, binding) };
  }
  async catalog(o: CaseAiOwner, matterId: string, kind: CaseItemKind, page: { cursor?: string; limit?: number } = {}) {
    if (!(await new MatterRepository(this.db).getMatterForWork(o.tenantId, matterId)))
      throw new Error('MATTER_NOT_FOUND');
    let items: { kind: CaseItemKind; id: string; title: string; versionId?: string; versionNumber?: number }[];
    if (kind === 'DOCUMENT') {
      const rows = await this.db
        .select({
          id: s.legalDocuments.id,
          title: s.legalDocuments.title,
          versionId: s.documentVersions.id,
          versionNumber: s.documentVersions.versionNumber,
        })
        .from(s.legalDocuments)
        .innerJoin(
          s.documentVersions,
          and(
            eq(s.documentVersions.documentId, s.legalDocuments.id),
            sql`${s.documentVersions.versionNumber} = (select max(v.version_number) from document_versions v where v.document_id = ${s.legalDocuments.id})`,
          ),
        )
        .where(
          and(
            eq(s.legalDocuments.tenantId, o.tenantId),
            eq(s.legalDocuments.matterId, matterId),
            eq(s.legalDocuments.lifecycleState, 'ACTIVE'),
          ),
        );
      items = rows.map((r) => ({ ...r, kind, title: shortText(r.title) }));
    } else {
      const table =
        kind === 'FACT'
          ? s.facts
          : kind === 'EVIDENCE'
            ? s.evidenceItems
            : kind === 'THESIS'
              ? s.legalTheses
              : s.matterAuthorities;
      const title =
        kind === 'FACT'
          ? s.facts.statement
          : kind === 'EVIDENCE'
            ? s.evidenceItems.title
            : kind === 'THESIS'
              ? s.legalTheses.title
              : s.matterAuthorities.authorityJson;
      const rows = await this.db
        .select({ id: table.id, title })
        .from(table)
        .where(and(eq(table.tenantId, o.tenantId), eq(table.matterId, matterId)));
      items = rows.map((r) => {
        const a = kind === 'AUTHORITY' ? JSON.parse(r.title) : undefined;
        return {
          kind,
          id: r.id,
          title: shortText(a ? `${a.court ?? 'Fonte'} ${a.processNumber ?? ''}`.trim() : r.title),
        };
      });
    }
    items.sort((a, b) => a.id.localeCompare(b.id));
    const binding = caseBinding([o, matterId, kind, items]);
    return boundedItems(items, casePosition(page.cursor, binding), page.limit ?? 20, {}, binding);
  }
  async relatedItems(
    o: CaseAiOwner,
    matterId: string,
    kind: CaseItemKind,
    id: string,
  ): Promise<{ kind: CaseItemKind; itemId: string; relation: string; anchorId?: string }[]> {
    const out: { kind: CaseItemKind; itemId: string; relation: string; anchorId?: string }[] = [];
    if (kind === 'FACT' || kind === 'EVIDENCE') {
      const links = await this.db
        .select()
        .from(s.evidenceLinks)
        .where(
          and(
            eq(s.evidenceLinks.tenantId, o.tenantId),
            eq(s.evidenceLinks.matterId, matterId),
            kind === 'FACT' ? eq(s.evidenceLinks.factId, id) : eq(s.evidenceLinks.evidenceItemId, id),
          ),
        );
      out.push(
        ...links.map((l) => ({
          kind: kind === 'FACT' ? ('EVIDENCE' as const) : ('FACT' as const),
          itemId: kind === 'FACT' ? l.evidenceItemId : l.factId,
          relation: l.relation,
        })),
      );
      const sources =
        kind === 'FACT'
          ? await this.db
              .select()
              .from(s.factSourceLinks)
              .where(
                and(
                  eq(s.factSourceLinks.tenantId, o.tenantId),
                  eq(s.factSourceLinks.matterId, matterId),
                  eq(s.factSourceLinks.factId, id),
                ),
              )
          : await this.db
              .select()
              .from(s.evidenceSourceLinks)
              .where(
                and(
                  eq(s.evidenceSourceLinks.tenantId, o.tenantId),
                  eq(s.evidenceSourceLinks.matterId, matterId),
                  eq(s.evidenceSourceLinks.evidenceItemId, id),
                ),
              );
      out.push(
        ...sources.map((l) => ({
          kind: 'DOCUMENT' as const,
          itemId: '',
          relation: l.relation,
          anchorId: l.documentAnchorId,
        })),
      );
    }
    if (kind === 'THESIS') {
      const rows = await this.db
        .select()
        .from(s.legalTheses)
        .where(
          and(eq(s.legalTheses.tenantId, o.tenantId), eq(s.legalTheses.matterId, matterId), eq(s.legalTheses.id, id)),
        );
      if (rows[0])
        for (const [k, raw] of [
          ['FACT', rows[0].factIds],
          ['EVIDENCE', rows[0].evidenceIds],
          ['AUTHORITY', rows[0].authorityIds],
        ] as const) {
          const values: unknown = JSON.parse(raw);
          if (Array.isArray(values))
            for (const itemId of values)
              if (typeof itemId === 'string') out.push({ kind: k, itemId, relation: 'LINKED' });
        }
    }
    return out;
  }
  async replace(
    o: CaseAiOwner,
    matterId: string,
    input: {
      oauthClientId: string;
      oauthGrantedAt: string;
      expectedRevision: number;
      selection: CaseAiSelection;
      receivePermission?: DraftReceivePermission;
      analysisPermission?: AnalysisPermission;
    },
  ): Promise<CaseAiGrant> {
    const selection = CaseAiSelectionSchema.parse(input.selection);
    const receivePermission = DraftReceivePermissionSchema.parse(input.receivePermission ?? { enabled: false });
    const analysisPermission = AnalysisPermissionSchema.parse(input.analysisPermission ?? { enabled: false });
    if (analysisPermission.enabled && !selection.documents.length) throw new Error('CASE_SELECTION_INVALID');
    return this.db.transaction(async (tx) => {
      const repo = new CaseAiAccessRepository(tx as unknown as ForgeLexDatabase);
      await tx
        .update(s.matters)
        .set({ updatedAt: sql`${s.matters.updatedAt}` })
        .where(and(eq(s.matters.id, matterId), eq(s.matters.tenantId, o.tenantId)));
      await repo.loadSelection(o, matterId, selection);
      if (receivePermission.enabled && receivePermission.destination.mode === 'EXISTING') {
        const target = await tx
          .select({ id: s.drafts.id })
          .from(s.drafts)
          .where(
            and(
              eq(s.drafts.id, receivePermission.destination.draftId),
              eq(s.drafts.tenantId, o.tenantId),
              eq(s.drafts.matterId, matterId),
            ),
          )
          .limit(1);
        if (!target[0]) throw new Error('DRAFT_DESTINATION_INVALID');
      }
      const current = (await repo.listForOwner(o, matterId)).find((g) => g.oauthClientId === input.oauthClientId);
      if ((current?.revision ?? 0) !== input.expectedRevision) throw new Error('CASE_ACCESS_CONFLICT');
      const now = new Date().toISOString();
      const next = CaseAiGrantSchema.parse({
        id: current?.id ?? randomUUID(),
        ...o,
        matterId,
        oauthClientId: input.oauthClientId,
        oauthGrantedAt: input.oauthGrantedAt,
        revision: input.expectedRevision + 1,
        status: 'ACTIVE',
        selection,
        receivePermission,
        analysisPermission,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      });
      const { selection: _, receivePermission: _permission, analysisPermission: _analysis, ...persisted } = next;
      const values = {
        ...persisted,
        selectionJson: JSON.stringify(selection),
        receivePermissionJson: JSON.stringify(receivePermission),
        analysisPermissionJson: JSON.stringify(analysisPermission),
        revokedAt: null,
      };
      if (current)
        await tx
          .update(s.caseAiAccessGrants)
          .set(values)
          .where(
            and(eq(s.caseAiAccessGrants.id, current.id), eq(s.caseAiAccessGrants.revision, input.expectedRevision)),
          );
      else await tx.insert(s.caseAiAccessGrants).values(values);
      return next;
    });
  }
  /**
   * Regra do mínimo (decisão de Boni, 26/11/2026): a conexão que o usuário aprovou no login da IA dele vale para os
   * casos ativos da conta, sem painel. Para cada caso ativo, garante uma permissão desta conexão com todo o material
   * atual do caso e com o envio de peças novas ao editor. Uma revogação feita nesta mesma conexão é respeitada; para
   * cortar o acesso, o usuário desconecta a IA (a conexão nova tem outra data e começa do zero). Melhor esforço: um caso
   * que não pode ser atualizado agora fica como está.
   */
  async syncAutomatic(r: CaseAiReader): Promise<void> {
    const { clientId, grantedAt } = r.oauthConnection ?? {};
    if (!clientId || !grantedAt) return;
    const owner = { tenantId: r.tenantId, userId: r.userId };
    const active = await this.db
      .select({ id: s.matters.id })
      .from(s.matters)
      .where(and(eq(s.matters.tenantId, r.tenantId), eq(s.matters.lifecycleState, 'ACTIVE')))
      .limit(100);
    for (const { id: matterId } of active) {
      try {
        const current = (await this.listForOwner(owner, matterId)).find((g) => g.oauthClientId === clientId);
        if (current?.status === 'REVOKED' && current.oauthGrantedAt === grantedAt) continue;
        const selection = CaseAiSelectionSchema.parse(await this.fullSelection(owner, matterId));
        const same = current?.status === 'ACTIVE' && current.oauthGrantedAt === grantedAt;
        if (
          same &&
          current.receivePermission.enabled &&
          JSON.stringify(current.selection) === JSON.stringify(selection)
        )
          continue;
        // Mantém o que o usuário já tinha dado nesta conexão (destino de peças e recebimento de análises).
        await this.replace(owner, matterId, {
          oauthClientId: clientId,
          oauthGrantedAt: grantedAt,
          expectedRevision: current?.revision ?? 0,
          selection,
          receivePermission:
            same && current.receivePermission.enabled
              ? current.receivePermission
              : { enabled: true, destination: { mode: 'NEW' } },
          ...(same && current.analysisPermission.enabled && selection.documents.length
            ? { analysisPermission: current.analysisPermission }
            : {}),
        });
      } catch {
        /* Conflito de revisão ou material mudando agora: a próxima chamada da IA tenta de novo. */
      }
    }
  }
  /** Todo o material atual de um caso: a versão mais recente de cada documento ativo, fatos, provas, teses e fontes. */
  private async fullSelection(o: CaseAiOwner, matterId: string): Promise<CaseAiSelection> {
    const all = async (kind: CaseItemKind) => {
      const items: { id: string; versionId?: string }[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.catalog(o, matterId, kind, { ...(cursor ? { cursor } : {}), limit: 100 });
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && items.length < 100);
      return items.slice(0, 100);
    };
    return {
      documents: (await all('DOCUMENT')).map((d) => ({ documentId: d.id, versionId: d.versionId! })),
      factIds: (await all('FACT')).map((i) => i.id),
      evidenceIds: (await all('EVIDENCE')).map((i) => i.id),
      thesisIds: (await all('THESIS')).map((i) => i.id),
      authorityIds: (await all('AUTHORITY')).map((i) => i.id),
    };
  }
  async revoke(o: CaseAiOwner, matterId: string, id: string, revision: number): Promise<CaseAiGrant> {
    return this.db.transaction(async (tx) => {
      await tx
        .update(s.matters)
        .set({ updatedAt: sql`${s.matters.updatedAt}` })
        .where(and(eq(s.matters.id, matterId), eq(s.matters.tenantId, o.tenantId)));
      const now = new Date().toISOString();
      const rows = await tx
        .update(s.caseAiAccessGrants)
        .set({ status: 'REVOKED', revision: revision + 1, updatedAt: now, revokedAt: now })
        .where(
          and(this.scope(o, matterId), eq(s.caseAiAccessGrants.id, id), eq(s.caseAiAccessGrants.revision, revision)),
        )
        .returning();
      if (!rows[0]) throw new Error('CASE_ACCESS_CONFLICT');
      return grant(rows[0]);
    });
  }
}
