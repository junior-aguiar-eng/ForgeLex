import { describe, expect, it } from 'vitest';
import { createResearchDeskModel } from './research-desk-model';

describe('createResearchDeskModel', () => {
  it('exibe apenas tribunais pesquisáveis e descreve resultado vazio faturável', () => {
    const model = createResearchDeskModel({
      tribunals: [{ code: 'STJ', searchable: true }, { code: 'STF', searchable: false }],
      search: { state: 'ready', chargedCents: 20, resultCount: 0, isReplay: false },
    });
    expect(model.courts.map((court) => court.code)).toEqual(['STJ']);
    expect(model.verificationActionLabel).toBe('Verificar gratuitamente');
    expect(model.emptyMessage).toContain('operação concluída');
    expect(model.billingMessage).toContain('R$ 0,20');
  });

  it('não afirma débito quando a fonte está indisponível e distingue replay', () => {
    expect(createResearchDeskModel({ tribunals: [], search: { state: 'unavailable' } }).billingMessage).toBeUndefined();
    expect(createResearchDeskModel({ tribunals: [{ code: 'STJ', searchable: true }], search: { state: 'ready', chargedCents: 0, resultCount: 1, isReplay: true } }).billingMessage).toContain('replay');
  });

  it.each(['VERIFIED_OFFICIAL', 'VERIFIED_PROVIDER', 'UNVERIFIED', 'CONFLICTING_METADATA', 'NOT_FOUND'] as const)('mapeia o status de verificação %s', (status) => {
    expect(createResearchDeskModel({ tribunals: [], search: { state: 'idle' }, verificationStatus: status }).verificationStatusLabel).toBeTruthy();
  });
});
