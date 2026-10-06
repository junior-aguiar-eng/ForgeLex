import { describe, expect, it } from 'vitest';
import { DraftSaveFromAiInputSchema, DraftReceivePermissionSchema } from './draft-ai-receipt.js';

const id = '10000000-0000-4000-8000-000000000001';
const valid = {
  matterId: id,
  expectedGrantRevision: 1,
  idempotencyKey: 'abcdefghijklmnop',
  title: 'Peça inicial',
  sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto' }],
};
describe('Recebimento de texto externo', () => {
  it('permite referências vazias e exige destino explícito quando habilitado', () => {
    expect(DraftSaveFromAiInputSchema.parse(valid).references).toEqual([]);
    expect(DraftReceivePermissionSchema.safeParse({ enabled: true }).success).toBe(false);
    expect(DraftReceivePermissionSchema.safeParse({ enabled: false, destination: { mode: 'NEW' } }).success).toBe(
      false,
    );
  });
  it('recusa identidade, destino, aprovação e campos extras', () => {
    for (const key of ['draftId', 'userId', 'tenantId', 'verified', 'approval', 'destination']) {
      expect(DraftSaveFromAiInputSchema.safeParse({ ...valid, [key]: id }).success).toBe(false);
    }
  });
  it('recusa texto vazio, seções duplicadas e referências sem seção', () => {
    expect(
      DraftSaveFromAiInputSchema.safeParse({ ...valid, sections: [{ ...valid.sections[0], content: ' \n\t' }] })
        .success,
    ).toBe(false);
    expect(
      DraftSaveFromAiInputSchema.safeParse({ ...valid, sections: [...valid.sections, ...valid.sections] }).success,
    ).toBe(false);
    expect(
      DraftSaveFromAiInputSchema.safeParse({ ...valid, references: [{ sectionOrdinal: 1, kind: 'FACT', itemId: id }] })
        .success,
    ).toBe(false);
  });
  it('limita seções, referências, títulos, notas e chave', () => {
    const sections = Array.from({ length: 100 }, (_, ordinal) => ({ ...valid.sections[0], ordinal }));
    expect(DraftSaveFromAiInputSchema.safeParse({ ...valid, sections }).success).toBe(true);
    expect(
      DraftSaveFromAiInputSchema.safeParse({ ...valid, sections: [...sections, { ...sections[0], ordinal: 100 }] })
        .success,
    ).toBe(false);
    const references = Array.from({ length: 500 }, () => ({ sectionOrdinal: 0, kind: 'FACT', itemId: id }));
    expect(DraftSaveFromAiInputSchema.safeParse({ ...valid, references }).success).toBe(true);
    expect(DraftSaveFromAiInputSchema.safeParse({ ...valid, references: [...references, references[0]] }).success).toBe(
      false,
    );
    for (const length of [16, 128])
      expect(DraftSaveFromAiInputSchema.safeParse({ ...valid, idempotencyKey: 'a'.repeat(length) }).success).toBe(true);
    for (const length of [15, 129])
      expect(DraftSaveFromAiInputSchema.safeParse({ ...valid, idempotencyKey: 'a'.repeat(length) }).success).toBe(
        false,
      );
    for (const title of [' a ', 'a'.repeat(201)])
      expect(DraftSaveFromAiInputSchema.safeParse({ ...valid, title }).success).toBe(false);
    expect(DraftSaveFromAiInputSchema.safeParse({ ...valid, notes: 'a'.repeat(2001) }).success).toBe(false);
  });
  it('documento exige versão fixa; outros tipos recusam versão e âncora', () => {
    const reference = { sectionOrdinal: 0, kind: 'DOCUMENT', itemId: id };
    expect(DraftSaveFromAiInputSchema.safeParse({ ...valid, references: [reference] }).success).toBe(false);
    expect(
      DraftSaveFromAiInputSchema.safeParse({
        ...valid,
        references: [{ ...reference, documentVersionId: id, anchorId: id }],
      }).success,
    ).toBe(true);
    expect(
      DraftSaveFromAiInputSchema.safeParse({
        ...valid,
        references: [{ ...reference, kind: 'FACT', documentVersionId: id }],
      }).success,
    ).toBe(false);
  });
  it('mede o limite em bytes UTF-8 sem truncar conteúdo', () => {
    const input = { ...valid, references: [], sections: [{ ...valid.sections[0], content: '' }] };
    const overhead = new TextEncoder().encode(JSON.stringify(input)).length;
    input.sections[0].content = 'á'.repeat(Math.floor((512 * 1024 - overhead) / 2));
    expect(DraftSaveFromAiInputSchema.safeParse(input).success).toBe(true);
    input.sections[0].content += 'á';
    expect(DraftSaveFromAiInputSchema.safeParse(input).success).toBe(false);
  });
});
