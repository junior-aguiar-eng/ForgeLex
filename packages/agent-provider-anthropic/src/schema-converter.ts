import { zodToJsonSchema } from 'zod-to-json-schema';

export function convertZodToToolJsonSchema(schema: unknown): Record<string, unknown> {
  // AgentTool é compartilhado com o agent-core, que permanece em Zod 3;
  // zod-to-json-schema aceita ambas as versões em runtime.
  const jsonSchema = zodToJsonSchema(schema as any, { target: 'jsonSchema7' });
  // Remove $schema se presente para evitar rejeição pela Anthropic/OpenAI
  if (typeof jsonSchema === 'object' && jsonSchema !== null) {
    const { $schema, ...rest } = jsonSchema as any;
    return rest;
  }
  return { type: 'object' };
}
