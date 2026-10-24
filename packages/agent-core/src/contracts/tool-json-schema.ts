import { z } from 'zod';
import type { JSONSchema } from 'zod/v4/core';

/** Convert the accepted input contract, including defaults and refinements. */
export function toolJsonSchema(schema: unknown): JSONSchema.BaseSchema {
  if (!(schema instanceof z.ZodType)) {
    throw new TypeError('TOOL_SCHEMA_UNSUPPORTED');
  }
  const { $schema, ...result } = z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input',
    override(context) {
      // Zod strips undeclared fields, while our advertised tool contract has
      // always excluded them. Keep passthrough and record schemas unchanged.
      if (context.zodSchema instanceof z.ZodObject && !context.zodSchema.def.catchall) {
        context.jsonSchema.additionalProperties = false;
      } else if (context.zodSchema instanceof z.ZodObject &&
        (context.zodSchema.def.catchall instanceof z.ZodUnknown || context.zodSchema.def.catchall instanceof z.ZodAny)) {
        context.jsonSchema.additionalProperties = true;
      }
    },
  });
  return result;
}
