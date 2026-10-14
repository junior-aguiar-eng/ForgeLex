import { describe, expect, it } from 'vitest';
import { montarApresentacao } from './apresentacao.js';
import { NOMES_TOOLS } from './contratos.js';

const confirmado = {
  status_verificacao: 'confirmado_busca_externa',
  fonte: { url: 'https://www.stj.jus.br/precedente', host: 'www.stj.jus.br', consultado_em: '2026-10-14' },
};

describe('apresentação da análise', () => {
  it('não declara fundamentação sem referências', () => {
    const resultado = montarApresentacao(NOMES_TOOLS.pecaAnalisar, {});
    expect(resultado.fundamentado).toBe(false);
    expect(resultado.resumo).not.toMatch(/Concluído e fundamentado/);
  });
  it('declaração do cliente continua pendente mesmo sem contador', () => {
    const resultado = montarApresentacao(NOMES_TOOLS.mapearTeses, {
      precedentes: [{ ...confirmado, status_verificacao: 'confirmado_pelo_cliente' }],
    });
    expect(resultado.fundamentado).toBe(false);
    expect(resultado.resumo).toMatch(/conferir na fonte/);
  });
  it('não omite precedente não verificado se contador não vier', () => {
    const resultado = montarApresentacao(NOMES_TOOLS.mapearTeses, {
      precedentes: [{ status_verificacao: 'nao_verificado' }],
    });
    expect(resultado.fundamentado).toBe(false);
    expect(resultado.resumo).toMatch(/sem confirmação/);
  });
  it.each([
    ['trechos_nao_localizados', [{ campo: 'fatos', trecho: 'não está no documento' }], /trecho.*não localizado/i],
    ['lacunas_probatorias', [{ fato: 'pagamento', motivo: 'sem documento' }], /lacuna.*probatória/i],
    ['riscos_preclusao_altos', ['prova documental'], /risco.*preclusão/i],
    ['triagem', { divergencias: ['fase difere'] }, /divergência.*triagem/i],
    ['verificacao_normativa', [{ status_vigencia: 'nao_verificado', alerta: null }], /vigência a confirmar/],
  ])('exibe ponto concreto %s mesmo com precedente confirmado', (campo, valor, texto) => {
    const resultado = montarApresentacao(NOMES_TOOLS.estrategiaDefinir, { precedentes: [confirmado], [campo]: valor });
    expect(resultado.fundamentado).toBe(false);
    expect(resultado.resumo).toMatch(texto as RegExp);
  });
  it('fundamentação positiva exige evidência servidor e ausência de pendências', () => {
    expect(montarApresentacao(NOMES_TOOLS.mapearTeses, { precedentes: [confirmado] }).fundamentado).toBe(true);
    expect(
      montarApresentacao(NOMES_TOOLS.mapearTeses, {
        precedentes: [{ status_verificacao: 'confirmado_busca_externa', fonte: null }],
      }).fundamentado,
    ).toBe(false);
  });
  it('sempre preserva aviso de revisão da redação com pendências', () => {
    const resultado = montarApresentacao(NOMES_TOOLS.pecaRedigir, { elementos_ausentes: [{}] });
    expect(resultado.resumo).toMatch(/revisão.*advogado habilitado/i);
  });
  it('preserva ressalva de vigência do panorama probatório mesmo sem lista de dispositivos', () => {
    const resultado = montarApresentacao(NOMES_TOOLS.avaliarProva, {
      precedentes: [confirmado],
      regime_onus_area: {
        alerta: 'Panorama de referência, sem verificação de vigência: confirme os dispositivos em fonte oficial.',
      },
    });
    expect(resultado.fundamentado).toBe(false);
    expect(resultado.resumo).toMatch(/panorama.*vigência.*confirmar/i);
  });
  it('preserva ressalva do verificador que só localizou identidade sem auditar a tese', () => {
    const resultado = montarApresentacao(NOMES_TOOLS.mapearTeses, {
      precedentes: [{ ...confirmado, alerta: 'A localização do identificador não verifica o suporte à tese.' }],
    });
    expect(resultado.fundamentado).toBe(false);
    expect(resultado.resumo).toMatch(/precedente.*ressalva.*tese/i);
  });
});
