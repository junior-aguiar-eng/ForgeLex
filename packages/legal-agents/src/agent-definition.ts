import type { z } from 'zod';
export interface LegalAgentDefinition<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  readonly id: string;
  readonly version: string;
  readonly role: string;
  readonly objective: string;
  readonly scope: 'STJ' | 'SUPPLIED_CONTEXT';
  readonly instructionId: string;
  readonly instructionVersion: string;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly allowedTools: readonly string[];
  readonly inputSchema: I;
  readonly outputSchema: O;
  readonly forbiddenBehaviors: readonly string[];
  readonly handoff: readonly string[];
  readonly escalation: readonly string[];
  readonly qualityChecks: readonly string[];
  readonly executionEnabled: false;
}
