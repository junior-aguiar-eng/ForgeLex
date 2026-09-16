import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export function convertZodToToolJsonSchema(schema: z.ZodType<any, any, any>): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, { target: 'jsonSchema7' });
  // Remove $schema se presente para evitar rejeição pela Anthropic/OpenAI
  if (typeof jsonSchema === 'object' && jsonSchema !== null) {
    const { $schema, ...rest } = jsonSchema as any;
    return rest;
  }
  return { type: 'object' };
}
