import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyDeskEdit, createDeskEditSnapshot, type DeskEditProposal } from './desk-edit.js';

function fixture() {
  const sectionId = randomUUID(),
    versionId = randomUUID(),
    draftId = randomUUID();
  const content = '  início\r\n😀 e\u0301; preservar  \r\n';
  const start = content.indexOf('😀'),
    end = content.indexOf(';');
  const selection = { versionId, sectionId, start, end, before: content.slice(start, end) };
  const base = {
    draftId,
    versionId,
    versionHash: 'a'.repeat(64),
    title: 'Título',
    sections: [
      { id: sectionId, title: 'Texto', content },
      { id: randomUUID(), title: 'Outro', content: '  intacto  ' },
    ],
  };
  const snapshot = createDeskEditSnapshot(base, selection);
  const patch = { ...snapshot.scope, id: 'p', after: '' };
  return { base, selection, snapshot, patch };
}
describe('edição delimitada', () => {
  it('exclui só o trecho escolhido sem normalizar CRLF, espaços ou outras seções', () => {
    const { base, snapshot, patch } = fixture();
    expect(applyDeskEdit(snapshot, { target: snapshot.target, changes: [patch] })).toEqual([
      { ...base.sections[0], content: '  início\r\n; preservar  \r\n' },
      base.sections[1],
    ]);
    expect(base.sections[0].content).toBe('  início\r\n😀 e\u0301; preservar  \r\n');
  });

  it.each([
    ['fora do escopo', { start: 0 }, 'DESK_EDIT_OUT_OF_SCOPE'],
    ['hash divergente', { sectionHash: 'f'.repeat(64) }, 'DESK_EDIT_ANCHOR_INVALID'],
    ['Unicode normalizado', { before: '😀 é' }, 'DESK_EDIT_ANCHOR_INVALID'],
    ['sem alteração', { after: '😀 e\u0301' }, 'DESK_EDIT_PATCH_INVALID'],
    ['Unicode malformado', { after: '\ud800' }, 'DESK_EDIT_UNICODE_INVALID'],
  ])('recusa %s', (_name, overrides, error) => {
    const { snapshot, patch } = fixture();
    expect(() => applyDeskEdit(snapshot, { target: snapshot.target, changes: [{ ...patch, ...overrides }] })).toThrow(
      error,
    );
  });
  it('recusa alvo de outra versão, sobreposição e par substituto cortado', () => {
    const { snapshot, patch, base, selection } = fixture();
    const proposal: DeskEditProposal = { target: snapshot.target, changes: [patch] };
    expect(() =>
      applyDeskEdit(snapshot, { ...proposal, target: { ...proposal.target, versionId: randomUUID() } }),
    ).toThrow('DESK_EDIT_TARGET_INVALID');
    expect(() => applyDeskEdit(snapshot, { ...proposal, changes: [patch, { ...patch, id: 'p2' }] })).toThrow(
      'DESK_EDIT_PATCH_INVALID',
    );
    expect(() => createDeskEditSnapshot(base, { ...selection, end: selection.start + 1, before: '\ud83d' })).toThrow(
      'DESK_EDIT_UNICODE_INVALID',
    );
  });
});
