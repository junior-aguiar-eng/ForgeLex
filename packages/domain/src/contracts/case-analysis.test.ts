import { describe, it, expect } from 'vitest';
import * as domain from '../index.js';
import { randomUUID } from 'node:crypto';

describe('Contrato de análise recebida', () => {
  it('exige versão, âncora e trechos para cada proposição documental', () => {
    const schema = domain.CaseAnalysisInputSchema;
    expect(schema, 'contrato de análise deve existir').toBeDefined();
    const ref = {
      documentId: randomUUID(),
      versionId: randomUUID(),
      anchorId: randomUUID(),
      quote: 'Texto original',
      relation: 'CONTEXT',
    };
    const input = {
      matterId: randomUUID(),
      expectedGrantRevision: 1,
      idempotencyKey: 'analysis-test-key',
      objective: 'Confrontar contrato',
      items: [
        { id: 'f1', kind: 'FACT', text: 'A parte alega inadimplemento', classification: 'ALLEGATION', sources: [ref] },
      ],
    };
    expect(schema.safeParse(input).success).toBe(true);
    for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(schema.safeParse({ ...input, items: [{ ...input.items[0], id }] }).success).toBe(false);
    }
    expect(
      schema.safeParse({ ...input, items: [{ ...input.items[0], sources: [{ ...ref, versionId: undefined }] }] })
        .success,
    ).toBe(false);
    expect(schema.safeParse({ ...input, items: [input.items[0], input.items[0]] }).success).toBe(false);
    expect(schema.safeParse({ ...input, items: [{ ...input.items[0], classification: 'PROVEN' }] }).success).toBe(
      false,
    );
  });
});
