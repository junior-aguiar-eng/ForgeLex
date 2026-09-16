import { describe, it, expect } from 'vitest';
import { CourtCatalog } from './court-catalog.js';

describe('CourtCatalog (Catálogo Canônico de Tribunais)', () => {
  const catalog = new CourtCatalog();

  it('deve identificar tribunais superiores e verificar precedentes vinculantes', () => {
    const stf = catalog.getCourt('STF');
    const stj = catalog.getCourt('stj'); // Case-insensitive

    expect(stf).toBeDefined();
    expect(stf?.hasBindingPrecedents).toBe(true);
    expect(stf?.type).toBe('SUPERIOR');

    expect(stj).toBeDefined();
    expect(stj?.name).toBe('Superior Tribunal de Justiça');
  });

  it('deve listar tribunais por tipo', () => {
    const superiores = catalog.getCourtsByType('SUPERIOR');
    expect(superiores.length).toBeGreaterThanOrEqual(2);

    const estaduais = catalog.getCourtsByType('ESTADUAL');
    expect(estaduais.some((c) => c.code === 'TJSP')).toBe(true);
  });

  it('deve validar se um tribunal é suportado pelo catálogo', () => {
    expect(catalog.isCourtSupported('STJ')).toBe(true);
    expect(catalog.isCourtSupported('tjsp')).toBe(true);
    expect(catalog.isCourtSupported('TRIBUNAL_INEXISTENTE')).toBe(false);
  });
});
