import { toolJsonSchema } from '@forgelex/agent-core';

export function convertZodToOpenAIToolSchema(schema: unknown): Record<string, unknown> {
  return toolJsonSchema(schema);
}
