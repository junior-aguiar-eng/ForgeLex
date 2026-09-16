import { z } from 'zod';

export const SourceLocatorSchema = z.object({
  provider: z.string().min(1, 'O provedor de dados é obrigatório'),
  court: z.string().optional(),
  collection: z.string().optional(),
  documentId: z.string().min(1, 'ID do documento na fonte é obrigatório'),
  dedupeKey: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  pageNumber: z.number().int().positive().optional(),
  paragraphNumber: z.number().int().positive().optional(),
  contentHash: z.string().min(8, 'Hash de integridade deve ter no mínimo 8 caracteres').optional(),
  capturedAt: z.string().datetime().optional(),
});

export type SourceLocator = z.infer<typeof SourceLocatorSchema>;

export const ProvenanceMetadataSchema = z.object({
  id: z.string().uuid(),
  source: SourceLocatorSchema,
  verified: z.boolean(),
  verificationMethod: z.enum(['OFFICIAL_SOURCE_HASH', 'CROSS_CHECK', 'MANUAL_VALIDATION', 'SYNTHETIC_CANONICAL']),
  verifiedAt: z.string().datetime(),
  snippet: z.string().min(1, 'Trecho ancorado é obrigatório para proveniência'),
  confidence: z.number().min(0).max(1),
});

export type ProvenanceMetadata = z.infer<typeof ProvenanceMetadataSchema>;

/**
 * Validador estrito de integridade de proveniência.
 * Lança erro caso a proveniência não atenda aos requisitos mínimos de confiabilidade.
 */
export function validateProvenance(provenance: ProvenanceMetadata): boolean {
  if (!provenance.verified) {
    return false;
  }
  if (!provenance.snippet || provenance.snippet.trim().length === 0) {
    return false;
  }
  return true;
}
