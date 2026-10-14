import { describe, expect, it } from 'vitest';
import { JurisprudenciaVerificador, identificarTribunal, textoConfirmaReferencia, tribunalDaReferencia, type BuscadorWeb } from './jurisprudencia-verificar.js';

function buscador(resultados: Array<{ url: string; titulo?: string; trecho?: string }>, paginas: Record<string, string> = {}): BuscadorWeb {
  return {
    buscar: async () => resultados,
    obterTexto: async (url) => {
      if (paginas[url] === undefined) throw new Error('falha');
      return paginas[url]!;
    },
  };
}

describe('JurisprudenciaVerificador', () => {
  it('sem buscador, nunca confirma', async () => {
    const resultado = await new JurisprudenciaVerificador().verificar({ tribunal: 'STJ', numero: 'REsp 1234567' });
    expect(resultado).toMatchObject({ status_verificacao: 'nao_verificado', motivo: 'busca_indisponivel', fonte: null });
  });

  it('confirma lendo a página oficial e ignora agregadores e domínios parecidos', async () => {
    const verificador = new JurisprudenciaVerificador({
      buscador: buscador(
        [{ url: 'https://stj.jus.br.falso.com/x' }, { url: 'http://scon.stj.jus.br/inseguro' }, { url: 'https://scon.stj.jus.br/ok' }],
        { 'https://scon.stj.jus.br/ok': 'Acórdão do REsp 1.234.567 - SP' },
      ),
    });
    const resultado = await verificador.verificar({ tribunal: 'STJ', numero: 'REsp 1234567' });
    expect(resultado.status_verificacao).toBe('confirmado_busca_externa');
    expect(resultado.fonte?.url).toBe('https://scon.stj.jus.br/ok');
  });

  it('reporta busca indisponível quando a busca falha e não encontrado quando a página não confirma', async () => {
    const falha: BuscadorWeb = { buscar: async () => { throw new Error('x'); }, obterTexto: async () => '' };
    expect((await new JurisprudenciaVerificador({ buscador: falha }).verificar({ tribunal: 'TST', numero: 'RR 123456' })).motivo).toBe('busca_indisponivel');
    const naoAchou = buscador([{ url: 'https://tst.jus.br/a' }], { 'https://tst.jus.br/a': 'outro processo 999999' });
    expect((await new JurisprudenciaVerificador({ buscador: naoAchou }).verificar({ tribunal: 'TST', numero: 'RR 123456' })).motivo).toBe('precedente_nao_encontrado');
  });

  it('confirma pela url_fonte oficial, sem serviço de busca, e rejeita url de domínio não oficial', async () => {
    const leitor: BuscadorWeb = {
      obterTexto: async (url) => (url === 'https://scon.stj.jus.br/ok' ? 'Súmula 297 - O Código de Defesa do Consumidor é aplicável às instituições financeiras.' : ''),
    };
    const verificador = new JurisprudenciaVerificador({ buscador: leitor });
    const ok = await verificador.verificar({ numero: 'Súmula 297', url_fonte: 'https://scon.stj.jus.br/ok' });
    expect(ok).toMatchObject({ status_verificacao: 'confirmado_busca_externa', tribunal: 'STJ' });
    const falso = await verificador.verificar({ tribunal: 'STJ', numero: 'Súmula 297', url_fonte: 'https://blog-juridico.com.br/sumula-297' });
    expect(falso).toMatchObject({ status_verificacao: 'nao_verificado', motivo: 'busca_indisponivel' });
    const outraPagina = await verificador.verificar({ tribunal: 'STJ', numero: 'Súmula 999', url_fonte: 'https://scon.stj.jus.br/ok' });
    expect(outraPagina.motivo).toBe('precedente_nao_encontrado');
  });

  it('sem conseguir ler a página, aceita o trecho do cliente só como confirmado_pelo_cliente', async () => {
    const bloqueado: BuscadorWeb = { obterTexto: async () => { throw new Error('PAGINA_HTTP_403'); } };
    const verificador = new JurisprudenciaVerificador({ buscador: bloqueado });
    const trecho = 'SÚMULA 297 - O Código de Defesa do Consumidor é aplicável às instituições financeiras.';
    const ok = await verificador.verificar({ numero: 'Súmula 297', url_fonte: 'https://scon.stj.jus.br/x', trecho_fonte: trecho });
    expect(ok).toMatchObject({ status_verificacao: 'confirmado_pelo_cliente', tribunal: 'STJ' });
    expect(ok.alerta).toContain('Conferir na fonte');
    // sem trecho, trecho sem o número ou URL não oficial: continua não verificado
    expect((await verificador.verificar({ numero: 'Súmula 297', url_fonte: 'https://scon.stj.jus.br/x' })).status_verificacao).toBe('nao_verificado');
    expect((await verificador.verificar({ numero: 'Súmula 297', url_fonte: 'https://scon.stj.jus.br/x', trecho_fonte: 'Texto qualquer sem relação com o tema pesquisado aqui.' })).status_verificacao).toBe('nao_verificado');
    expect((await verificador.verificar({ tribunal: 'STJ', numero: 'Súmula 297', url_fonte: 'https://blog.com.br/x', trecho_fonte: trecho })).status_verificacao).toBe('nao_verificado');
    // se o servidor leu a página e o precedente não consta, o trecho do cliente não prevalece
    const leitor: BuscadorWeb = { obterTexto: async () => 'Página oficial sem o precedente procurado.' };
    const contradito = await new JurisprudenciaVerificador({ buscador: leitor }).verificar({ numero: 'Súmula 297', url_fonte: 'https://scon.stj.jus.br/x', trecho_fonte: trecho });
    expect(contradito).toMatchObject({ status_verificacao: 'nao_verificado', motivo: 'precedente_nao_encontrado' });
  });

  it('não identifica tribunal quando a citação não permite', async () => {
    const resultado = await new JurisprudenciaVerificador({ buscador: buscador([]) }).verificar({ numero: 'Súmula 331' });
    expect(resultado.motivo).toBe('tribunal_nao_identificavel');
  });

  it('trata todos os tribunais pela mesma via', () => {
    expect(identificarTribunal('TRF3')?.dominios).toContain('trf3.jus.br');
    expect(identificarTribunal('TRT15')?.dominios).toContain('trt15.jus.br');
    expect(identificarTribunal('TJSP')?.dominios).toContain('tjsp.jus.br');
    expect(identificarTribunal('TJXX')).toBeUndefined();
    expect(tribunalDaReferencia({ numero: '0001234-56.2023.5.15.0001' })?.sigla).toBe('TRT15');
  });

  it('número curto exige correspondência textual, não só de dígitos', () => {
    expect(textoConfirmaReferencia({ numero: 'Súmula 331' }, 'processo 1331 de 2020')).toBe(false);
    expect(textoConfirmaReferencia({ numero: 'Súmula 331' }, 'SÚMULA 331 - CONTRATO DE PRESTAÇÃO')).toBe(true);
  });
});
