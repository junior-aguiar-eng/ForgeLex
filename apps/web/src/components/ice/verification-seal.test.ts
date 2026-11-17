import { describe, expect, it } from 'vitest';
import { verificationSeal } from './verification-seal';

describe('selo de verificação da decisão', () => {
  it('só a conferência na fonte oficial é "Verificada", em tom de sucesso', () => {
    expect(verificationSeal('VERIFIED_OFFICIAL')).toEqual({
      label: 'Verificada',
      detail: 'Número, data e órgão conferidos na fonte oficial.',
      tone: 'ok',
    });
  });

  it('conferência só no fornecedor não vira "Verificada"', () => {
    const seal = verificationSeal('VERIFIED_PROVIDER');
    expect(seal.label).not.toBe('Verificada');
    expect(seal.label).toBe('Conferida no fornecedor');
    expect(seal.tone).toBe('warn');
  });

  it('decisão ainda não conferida pede conferência, sem tom de sucesso', () => {
    expect(verificationSeal('UNVERIFIED')).toMatchObject({ label: 'A conferir na fonte', tone: 'neutral' });
  });

  it('metadados divergentes e decisão não localizada são avisos, não sucesso', () => {
    expect(verificationSeal('CONFLICTING_METADATA')).toMatchObject({ label: 'Metadados divergentes', tone: 'warn' });
    expect(verificationSeal('NOT_FOUND')).toMatchObject({ label: 'Sem correspondência', tone: 'danger' });
  });

  it('sem estado conhecido trata como a conferir, nunca como verificada', () => {
    expect(verificationSeal(undefined).label).toBe('A conferir na fonte');
    expect(verificationSeal('QUALQUER' as never).label).toBe('A conferir na fonte');
  });

  it('o aviso de ausência não afirma que a decisão não existe', () => {
    expect(verificationSeal('NOT_FOUND').detail).toMatch(/não prova que não exista/i);
  });
});
