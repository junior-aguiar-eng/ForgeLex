import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toolJsonSchema, toolSchemaVariantsNote } from './tool-json-schema.js';

const modeA = z
  .object({ id: z.string(), modo: z.literal('a'), texto: z.string(), nota: z.string().optional() })
  .strict();
const modeB = z.object({ id: z.string(), modo: z.literal('b'), instrucoes: z.string() }).strict();

describe('toolJsonSchema: objeto no topo, sempre', () => {
  it('um objeto simples sai como sempre saiu', () => {
    const schema = toolJsonSchema(z.object({ query: z.string() }).strict()) as Record<string, any>;
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['query']);
    expect(schema.oneOf).toBeUndefined();
  });

  it('uma união discriminada vira UM objeto: propriedades unidas, required pela interseção, discriminador em enum', () => {
    const schema = toolJsonSchema(z.discriminatedUnion('modo', [modeA, modeB])) as Record<string, any>;
    expect(schema.type).toBe('object');
    expect(schema.oneOf).toBeUndefined();
    expect(schema.anyOf).toBeUndefined();
    expect(Object.keys(schema.properties)).toEqual(['id', 'modo', 'texto', 'nota', 'instrucoes']);
    expect(schema.properties.modo).toEqual({ type: 'string', enum: ['a', 'b'] });
    expect(schema.required).toEqual(['id', 'modo']);
    expect(schema.additionalProperties).toBe(false);
  });

  it('uma união simples de objetos também é achatada', () => {
    const schema = toolJsonSchema(z.union([modeA, modeB])) as Record<string, any>;
    expect(schema.type).toBe('object');
    expect(schema.properties.modo.enum).toEqual(['a', 'b']);
  });

  it('propriedade com definições diferentes nos ramos vira anyOf; iguais ficam como estão', () => {
    const one = z.object({ valor: z.string(), comum: z.number() }).strict();
    const two = z.object({ valor: z.number(), comum: z.number() }).strict();
    const schema = toolJsonSchema(z.union([one, two])) as Record<string, any>;
    expect(schema.properties.comum).toEqual({ type: 'number' });
    expect(schema.properties.valor.anyOf).toEqual([{ type: 'string' }, { type: 'number' }]);
  });

  it('se algum ramo permite campos extras, o objeto achatado também permite', () => {
    const open = z.object({ a: z.string() }).catchall(z.unknown());
    const closed = z.object({ b: z.string() }).strict();
    expect((toolJsonSchema(z.union([open, closed])) as Record<string, any>).additionalProperties).toBe(true);
  });

  it('não mexe em união que não seja só de objetos (o chamador decide o que fazer)', () => {
    const schema = toolJsonSchema(z.union([z.string(), z.number()])) as Record<string, any>;
    expect(schema.type).not.toBe('object');
    expect(JSON.stringify(schema)).toContain('string');
    expect(JSON.stringify(schema)).toContain('number');
  });

  it('o schema Zod original segue sendo o que valida: o achatado é só o que se anuncia', () => {
    const original = z.discriminatedUnion('modo', [modeA, modeB]);
    expect(original.safeParse({ id: '1', modo: 'b' }).success).toBe(false);
    expect(original.safeParse({ id: '1', modo: 'b', instrucoes: 'x' }).success).toBe(true);
  });
});

describe('toolSchemaVariantsNote', () => {
  it('lista os conjuntos de parâmetros de cada ramo da união', () => {
    expect(toolSchemaVariantsNote(z.discriminatedUnion('modo', [modeA, modeB]))).toBe(
      'Informe os parâmetros de exatamente um destes conjuntos: (id, modo, texto, nota) ou (id, modo, instrucoes).',
    );
  });

  it('fica vazia quando o schema não é uma união de objetos', () => {
    expect(toolSchemaVariantsNote(z.object({ q: z.string() }))).toBe('');
    expect(toolSchemaVariantsNote(z.union([z.string(), z.number()]))).toBe('');
    expect(toolSchemaVariantsNote('não é zod')).toBe('');
  });
});
