import { z } from 'zod';
import { ProvenanceMetadataSchema } from './provenance.js';

export const CaseLawSchema = z.object({
  id: z.string().uuid(),
  court: z.string().min(2, 'Sigla do tribunal é obrigatória (ex: STJ, STF, TJSP)'),
  processNumber: z.string().min(5, 'Número de processo é obrigatório'),
  rapporteur: z.string().min(1, 'Nome do relator é obrigatório'),
  chamber: z.string().min(2).optional(),
  judgmentDate: z.string(),
  publicationDate: z.string(),
  syllabus: z.string().min(10, 'Ementa do acórdão deve conter conteúdo substantivo'),
  fullTextUrl: z.string().url().optional(),
  dedupeKey: z.string().min(8),
  provenance: ProvenanceMetadataSchema,
});

export type CaseLaw = z.infer<typeof CaseLawSchema>;

export const LegalAuthoritySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['PRECEDENT_BINDING', 'CASE_LAW', 'STATUTE', 'CONSTITUTIONAL_PROVISION', 'LEGAL_DOCTRINE']),
  citation: z.string().min(3, 'Citação jurídica é obrigatória (ex: Súmula 331 do TST)'),
  title: z.string(),
  summary: z.string(),
  provenance: ProvenanceMetadataSchema,
  relevanceScore: z.number().min(0).max(1),
  isBinding: z.boolean(),
});

export type LegalAuthority = z.infer<typeof LegalAuthoritySchema>;

export const LegalResearchMemoSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(3),
  query: z.string().min(3),
  clientOrMatterId: z.string().optional(),
  executiveSummary: z.string().min(20),
  keyTheses: z.array(z.string().min(5)),
  applicableAuthorities: z.array(LegalAuthoritySchema),
  riskAnalysis: z.string(),
  recommendedAction: z.string(),
  generatedAt: z.string().datetime(),
  verifiedByHuman: z.boolean().default(false),
});

export type LegalResearchMemo = z.infer<typeof LegalResearchMemoSchema>;
