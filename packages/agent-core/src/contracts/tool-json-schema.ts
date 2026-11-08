import { z } from 'zod';
import type { JSONSchema } from 'zod/v4/core';

type JsonObjectSchema = Record<string, any>;

/**
 * O MCP (e as APIs de modelos) exigem que o schema de entrada de uma ferramenta seja um objeto no topo
 * (`type: "object"`). Uniões como `z.discriminatedUnion` saem do Zod como `{ oneOf: [...] }`, sem `type`. Um cliente
 * rigoroso valida a lista de ferramentas inteira de uma vez: uma única ferramenta assim faz TODAS sumirem (visto em
 * produção em 18/10/2026, quando `analise.peca_redigir` entrou). Aqui a união de objetos vira um objeto só, que é
 * apenas o que se anuncia: a validação real da chamada continua sendo a do schema Zod original.
 */
function isObjectBranch(branch: unknown): branch is JsonObjectSchema {
  return typeof branch === 'object' && branch !== null && (branch as JsonObjectSchema).type === 'object';
}

function unionBranches(schema: JsonObjectSchema): JsonObjectSchema[] | undefined {
  const branches = schema.oneOf ?? schema.anyOf;
  if (schema.type !== undefined || !Array.isArray(branches) || branches.length === 0) return undefined;
  return branches.every(isObjectBranch) ? (branches as JsonObjectSchema[]) : undefined;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Une as definições de uma mesma propriedade nos ramos: iguais ficam; discriminadores `const` viram `enum`. */
function mergeProperty(definitions: JsonObjectSchema[]): JsonObjectSchema {
  const distinct: JsonObjectSchema[] = [];
  for (const definition of definitions)
    if (!distinct.some((known) => sameJson(known, definition))) distinct.push(definition);
  if (distinct.length === 1) return distinct[0]!;
  const allConst = distinct.every((definition) => 'const' in definition);
  if (allConst) {
    const { const: _first, ...base } = distinct[0]!;
    const sameBase = distinct.every((definition) => {
      const { const: _value, ...rest } = definition;
      return sameJson(rest, base);
    });
    if (sameBase) return { ...base, enum: distinct.map((definition) => definition.const) };
  }
  return { anyOf: distinct };
}

function flattenObjectUnion(schema: JsonObjectSchema, branches: JsonObjectSchema[]): JsonObjectSchema {
  const { oneOf: _oneOf, anyOf: _anyOf, ...rest } = schema;
  const keys: string[] = [];
  for (const branch of branches)
    for (const key of Object.keys(branch.properties ?? {})) if (!keys.includes(key)) keys.push(key);
  const properties: JsonObjectSchema = { ...(rest.properties ?? {}) };
  for (const key of keys) {
    properties[key] = mergeProperty(
      branches
        .filter((branch) => branch.properties && key in branch.properties)
        .map((branch) => branch.properties[key]),
    );
  }
  const required = keys.filter((key) => branches.every((branch) => (branch.required ?? []).includes(key)));
  return {
    ...rest,
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: branches.every((branch) => branch.additionalProperties === false) ? false : true,
  };
}

/**
 * Texto que descreve, para quem lê a ferramenta, os conjuntos de parâmetros que a união original aceitava, já que o
 * schema achatado não os expressa. Vazio quando o schema não era uma união de objetos.
 */
export function toolSchemaVariantsNote(schema: unknown): string {
  if (!(schema instanceof z.ZodType)) return '';
  const { $schema, ...result } = z.toJSONSchema(schema, { target: 'draft-07', io: 'input' }) as JsonObjectSchema;
  const branches = unionBranches(result);
  if (!branches || branches.length < 2) return '';
  const sets = branches.map((branch) => `(${Object.keys(branch.properties ?? {}).join(', ')})`);
  return `Informe os parâmetros de exatamente um destes conjuntos: ${sets.join(' ou ')}.`;
}

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
      } else if (
        context.zodSchema instanceof z.ZodObject &&
        (context.zodSchema.def.catchall instanceof z.ZodUnknown || context.zodSchema.def.catchall instanceof z.ZodAny)
      ) {
        context.jsonSchema.additionalProperties = true;
      }
    },
  });
  const branches = unionBranches(result as JsonObjectSchema);
  return (branches ? flattenObjectUnion(result as JsonObjectSchema, branches) : result) as JSONSchema.BaseSchema;
}
