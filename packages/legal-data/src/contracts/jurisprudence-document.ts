import { z } from 'zod';
import { ProvenanceMetadataSchema } from '@forgelex/domain';
import { createHash } from 'node:crypto';

export const JurisprudenceDocumentSchema = z.object({
  id: z.string().uuid(),
  court: z.string().min(2),
  processNumber: z.string().min(5),
  rapporteur: z.string().min(2),
  judgmentDate: z.string(),
  publicationDate: z.string(),
  syllabus: z.string().min(10),
  fullText: z.string().optional(),
  dedupeKey: z.string().min(8),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  snapshot: z.object({
    contentHash: z.string().length(64),
    capturedAt: z.string().datetime(),
    provider: z.string(),
  }),
  provenance: ProvenanceMetadataSchema,
});

export type JurisprudenceDocument = z.infer<typeof JurisprudenceDocumentSchema>;

/**
 * Gera chave estável e determinística para deduplicação no pipeline de dados jurídicos.
 * Conforme observado na arquitetura de referência (Exordial/V2), previne duplicatas
 * geradas por diferentes scrapers ou relatórios do mesmo tribunal.
 */
export function generateDedupeKey(court: string, processNumber: string, judgmentDate: string): string {
  const cleanCourt = court.trim().toLowerCase();
  const cleanNumber = processNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const cleanDate = judgmentDate.replace(/[^0-9]/g, '');
  return `${cleanCourt}_${cleanNumber}_${cleanDate}`;
}

/**
 * Calcula o hash de integridade SHA-256 de um acórdão ou documento jurídico.
 */
export function generateContentHash(content: string): string {
  return createHash('sha256').update(content.trim()).digest('hex');
}
