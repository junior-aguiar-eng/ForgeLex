import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  AnalysisPermissionSchema,
  CaseAnalysisInputSchema,
  AnalysisDecisionInputSchema,
  AnalysisReceiptSchema,
} from '@forgelex/domain';
function schema(value: Parameters<typeof zodToJsonSchema>[0]) {
  const { $schema: _, ...result } = zodToJsonSchema(value, { target: 'jsonSchema7' });
  return result;
}
export const CASE_ANALYSIS_JSON_SCHEMAS = {
  AnalysisPermission: schema(AnalysisPermissionSchema),
  CaseAnalysisInput: schema(CaseAnalysisInputSchema),
  AnalysisDecisions: schema(AnalysisDecisionInputSchema),
  AnalysisReceipt: schema(AnalysisReceiptSchema),
};
