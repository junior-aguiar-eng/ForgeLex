import { describe, it, expect } from 'vitest';
import { emptySelection, toggleMaterial, selectionCount, initialInstruction, accessError } from './case-ai-model';
describe('seleção do caso para IA', () => {
  it('começa vazia e fixa a versão documental', () => {
    const s = emptySelection();
    expect(selectionCount(s)).toBe(0);
    const item = { kind: 'DOCUMENT' as const, id: 'd', versionId: 'v', title: 'Documento' };
    const selected = toggleMaterial(s, item, true);
    expect(toggleMaterial(selected, item, true).documents).toEqual([{ documentId: 'd', versionId: 'v' }]);
    expect(selectionCount(toggleMaterial(selected, item, false))).toBe(0);
  });
  it('copia só a referência do caso e conserva escolhas após conflito', () => {
    const text = initialInstruction('Contrato', 'https://forgelex.test/app/casos?caso=x');
    expect(text).toContain('material autorizado');
    expect(text).toContain('https://forgelex.test/app/casos?caso=x');
    expect(text).not.toMatch(/token|case\.read_item|conteúdo privado/);
    expect(accessError('CASE_ACCESS_CONFLICT')).toContain('escolha foi mantida');
  });
});
