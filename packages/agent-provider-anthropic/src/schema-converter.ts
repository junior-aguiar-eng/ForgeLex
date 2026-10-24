import { toolJsonSchema } from '@forgelex/agent-core';

export function convertZodToToolJsonSchema(schema: unknown): Record<string, unknown> {
  return toolJsonSchema(schema);
}
