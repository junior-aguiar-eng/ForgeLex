import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export function convertZodToOpenAIToolSchema(schema: z.ZodType<any, any, any>): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, { target: 'jsonSchema7' });
  if (typeof jsonSchema === 'object' && jsonSchema !== null) {
    const { $schema, ...rest } = jsonSchema as any;
    return rest;
  }
  return { type: 'object' };
}
