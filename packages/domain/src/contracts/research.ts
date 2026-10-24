import { z } from 'zod';
import { LegalResearchMemoSchema } from './legal-objects.js';

export const LegalIssueStatusSchema = z.enum(['OPEN', 'ADDRESSED', 'DISMISSED']);
export type LegalIssueStatus = z.infer<typeof LegalIssueStatusSchema>;

export const LegalIssueSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().min(1),
  matterId: z.string().guid(),
  statement: z.string().min(3),
  status: LegalIssueStatusSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LegalIssue = z.infer<typeof LegalIssueSchema>;

export const ResearchMemoStatusSchema = z.enum(['PENDING_HUMAN_REVIEW', 'APPROVED', 'REJECTED']);
export type ResearchMemoStatus = z.infer<typeof ResearchMemoStatusSchema>;

export const ResearchMemoRecordSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().min(1),
  matterId: z.string().guid(),
  query: z.string().min(3),
  issueIds: z.array(z.string().guid()),
  workflowId: z.literal('legal-research-memo'),
  workflowVersion: z.string().min(1),
  memo: LegalResearchMemoSchema,
  status: ResearchMemoStatusSchema,
  idempotencyKey: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reviewedBy: z.string().min(1).optional(),
  reviewedAt: z.string().datetime().optional(),
  reviewReason: z.string().max(2000).optional(),
});
export type ResearchMemoRecord = z.infer<typeof ResearchMemoRecordSchema>;
