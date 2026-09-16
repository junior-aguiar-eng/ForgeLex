import { z } from 'zod';

export const MatterStatusSchema = z.enum(['OPEN', 'CLOSED', 'ARCHIVED']);
export type MatterStatus = z.infer<typeof MatterStatusSchema>;

export const MatterSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  clientId: z.string().min(1).optional(),
  title: z.string().min(3, 'Título do matter deve conter pelo menos 3 caracteres'),
  description: z.string().optional(),
  practiceArea: z.string().min(2).optional(),
  jurisdiction: z.string().min(2).optional(),
  status: MatterStatusSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Matter = z.infer<typeof MatterSchema>;

export const LegalDocumentStatusSchema = z.enum(['INDEXED', 'FAILED']);
export type LegalDocumentStatus = z.infer<typeof LegalDocumentStatusSchema>;

export const LegalDocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().uuid(),
  title: z.string().min(1),
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  contentHash: z.string().length(64),
  status: LegalDocumentStatusSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type LegalDocument = z.infer<typeof LegalDocumentSchema>;

export const DocumentVersionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  contentHash: z.string().length(64),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;

export const DocumentAnchorSchema = z
  .object({
    id: z.string().uuid(),
    documentVersionId: z.string().uuid(),
    anchorKey: z.string().min(1),
    anchorType: z.literal('PARAGRAPH'),
    ordinal: z.number().int().nonnegative(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    text: z.string().min(1),
    contentHash: z.string().length(64),
    createdAt: z.string().datetime(),
  })
  .refine((value) => value.endOffset > value.startOffset, {
    message: 'O fim da âncora deve estar depois do início.',
    path: ['endOffset'],
  });

export type DocumentAnchor = z.infer<typeof DocumentAnchorSchema>;

export interface IngestTextDocumentInput {
  tenantId: string;
  matterId: string;
  createdBy: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  content: string;
}

export interface IngestedTextDocument {
  document: LegalDocument;
  version: DocumentVersion;
  anchors: DocumentAnchor[];
}
