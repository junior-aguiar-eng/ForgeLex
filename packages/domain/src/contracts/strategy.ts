import { z } from 'zod';

export const LegalThesisStatusSchema = z.enum(['PROPOSED', 'REVIEWED', 'REJECTED']);
export type LegalThesisStatus = z.infer<typeof LegalThesisStatusSchema>;

/**
 * Tese jurídica é uma hipótese de solução explicitamente ligada à questão,
 * aos fatos, às provas e às autoridades que a sustentam ou desafiam.
 */
export const LegalThesisSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().uuid(),
  title: z.string().min(3),
  statement: z.string().min(10),
  rationale: z.string().max(4000).optional(),
  issueIds: z.array(z.string().uuid()),
  factIds: z.array(z.string().uuid()),
  evidenceIds: z.array(z.string().uuid()),
  authorityIds: z.array(z.string().uuid()),
  status: LegalThesisStatusSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LegalThesis = z.infer<typeof LegalThesisSchema>;

export const ThesisMapSchema = z.object({
  matterId: z.string().uuid(),
  issues: z.array(z.unknown()),
  theses: z.array(LegalThesisSchema),
  generatedAt: z.string().datetime(),
});
export type ThesisMap = z.infer<typeof ThesisMapSchema>;
