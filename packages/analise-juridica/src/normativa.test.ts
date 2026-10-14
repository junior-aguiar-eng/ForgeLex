import { describe, expect, it } from 'vitest';
import { verificarDispositivos } from './tools/comum.js';

describe('proveniência normativa', () => {
  it.each([
    undefined,
    'fonte verbal',
    'https://exemplo.com/lei',
    'https://planalto.gov.br.evil.com/lei',
    'http://www.planalto.gov.br/lei',
    'https://user:pass@www.planalto.gov.br/lei',
  ])('não aceita declaração sem URL oficial segura: %s', (fonte) => {
    const [norma] = verificarDispositivos([{ dispositivo: 'Lei fictícia', verificado_em_fonte_oficial: true, fonte }]);
    expect(norma!.status_vigencia).toBe('nao_verificado');
    expect(norma!.fonte).toBeNull();
    expect(norma!.alerta).toBeTruthy();
  });

  it.each(['https://www.planalto.gov.br/ccivil_03/leis/l10406compilada.htm', 'https://www.stj.jus.br/lei'])(
    'identifica declaração do cliente sem fabricar auditoria de vigência: %s',
    (fonte) => {
      const [norma] = verificarDispositivos([
        { dispositivo: 'Código Civil, art. 389', verificado_em_fonte_oficial: true, fonte },
      ]);
      expect(norma!.status_vigencia).toBe('declarado_pelo_cliente');
      expect(norma!.fonte).toBe(fonte);
      expect(norma!.alerta).toMatch(/servidor.*não|não.*servidor/i);
    },
  );

  it('URL oficial sem declaração não comprova vigência', () => {
    const [norma] = verificarDispositivos([
      { dispositivo: 'Código Civil', verificado_em_fonte_oficial: false, fonte: 'https://www.planalto.gov.br/lei' },
    ]);
    expect(norma!.status_vigencia).toBe('nao_verificado');
  });
});
