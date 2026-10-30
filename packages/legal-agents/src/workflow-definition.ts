import type { z } from 'zod';
export interface LegalWorkflowDefinition {
  readonly action: 'analyze_documents' | 'research_question' | 'create_document' | 'review_text';
  readonly id: string;
  readonly version: string;
  readonly instructionId: string;
  readonly instructionVersion: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly roles: readonly string[];
  readonly dependencies: readonly string[];
  readonly requiredSources: readonly string[];
  readonly completionCriteria: readonly string[];
  readonly inputSchema: z.ZodType;
  readonly outputSchema: z.ZodType;
  readonly allowedTools: readonly string[];
  readonly playbook: { readonly id: string; readonly version: string; readonly steps: readonly string[] };
  readonly documentTemplate: null;
  readonly executionEnabled: false;
}
