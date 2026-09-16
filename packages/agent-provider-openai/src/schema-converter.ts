import { zodToJsonSchema } from 'zod-to-json-schema';

export function convertZodToOpenAIToolSchema(schema: unknown): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema as any, { target: 'jsonSchema7' });
  if (typeof jsonSchema === 'object' && jsonSchema !== null) {
    const { $schema, ...rest } = jsonSchema as any;
    return rest;
  }
  return { type: 'object' };
}
