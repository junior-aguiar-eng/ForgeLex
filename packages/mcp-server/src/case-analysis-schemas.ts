import { toolJsonSchema } from '@forgelex/agent-core';
import {
  AnalysisPermissionSchema,
  CaseAnalysisInputSchema,
  AnalysisDecisionInputSchema,
  AnalysisReceiptSchema,
} from '@forgelex/domain';
function schema(value: unknown): Record<string, unknown> {
  return toolJsonSchema(value);
}
export const CASE_ANALYSIS_JSON_SCHEMAS = {
  AnalysisPermission: schema(AnalysisPermissionSchema),
  CaseAnalysisInput: schema(CaseAnalysisInputSchema),
  AnalysisDecisions: schema(AnalysisDecisionInputSchema),
  AnalysisReceipt: schema(AnalysisReceiptSchema),
};
