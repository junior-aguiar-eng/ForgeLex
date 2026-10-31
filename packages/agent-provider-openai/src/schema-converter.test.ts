import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { searchCaseLawTool } from '@forgelex/legal-tools';
import { convertZodToOpenAIToolSchema } from './schema-converter.js';

describe('openai native Zod 4 JSON Schema contract', () => {
  it('preserves defaults as optional input and nullable fields as required', () => {
    const converted = convertZodToOpenAIToolSchema(
      z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(20).default(10),
        court: z.string().nullable(),
        cursor: z.string().optional(),
      }),
    );
    expect(converted).toMatchObject({
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
        court: { type: ['string', 'null'] },
        cursor: { type: 'string' },
      },
      additionalProperties: false,
    });
    expect(converted.required).toEqual(['query', 'court']);
    expect(converted).not.toHaveProperty('$schema');
  });

  it('preserves plain, strict and passthrough object transport contracts', () => {
    const shape = { query: z.string() };
    expect(convertZodToOpenAIToolSchema(z.object(shape))).toMatchObject({
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    });
    expect(convertZodToOpenAIToolSchema(z.object(shape).strict())).toMatchObject({
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    });
    expect(convertZodToOpenAIToolSchema(z.object(shape).passthrough())).toMatchObject({
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: true,
    });
  });

  it('preserves string-key record values instead of treating records as closed objects', () => {
    expect(
      convertZodToOpenAIToolSchema(
        z.object({
          labels: z.record(z.string(), z.string().max(80)),
        }),
      ),
    ).toMatchObject({
      type: 'object',
      properties: { labels: { type: 'object', additionalProperties: { type: 'string', maxLength: 80 } } },
      required: ['labels'],
    });
  });

  it('describes refined inputs with their limits and descriptions', () => {
    const input = z
      .object({
        query: z.string().min(2).max(200).describe('Termos da pesquisa'),
        year: z.number().int().min(1989).max(2100).optional(),
      })
      .refine((value) => value.query.trim().length > 0, 'Informe uma consulta.');
    expect(convertZodToOpenAIToolSchema(input)).toMatchObject({
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 200, description: 'Termos da pesquisa' },
        year: { type: 'integer', minimum: 1989, maximum: 2100 },
      },
      required: ['query'],
      additionalProperties: false,
    });
  });

  it('converts the actual ForgeLex search tool contract', () => {
    const converted = convertZodToOpenAIToolSchema(searchCaseLawTool.inputSchema);
    expect(converted).toMatchObject({
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, description: expect.stringContaining('OR') },
        judgmentYear: { type: 'integer', minimum: 1989, description: expect.stringContaining('julgamento') },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
      },
      required: ['query'],
      additionalProperties: false,
    });
    expect(converted).not.toHaveProperty('$schema');
    expect(searchCaseLawTool.inputSchema.parse({ query: 'dano moral' })).toMatchObject({ limit: 10 });
  });
});
