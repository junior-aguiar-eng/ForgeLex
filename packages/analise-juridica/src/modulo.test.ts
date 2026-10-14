import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { LedgerService } from '@forgelex/billing-ledger';
import { McpHandler } from '@forgelex/mcp-server';
import { createDatabase } from '@forgelex/persistence';
import {
  AVISO_OBRIGATORIO,
  AVISO_VIGENCIA_NAO_VERIFICADA,
  COMBOS,
  ModuloAnalise,
  NOMES_TOOLS,
  PRECO_TOOL_CENTS,
  PRECO_TRIAGEM_CENTS,
  precoComboCents,
  type BuscadorWeb,
} from './index.js';

const TEXTO = 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ. Fulano propõe AÇÃO DE COBRANÇA contra Beltrano. Os fatos: o réu deixou de pagar o contrato firmado em 2024. Fundamentos: art. 389 do Código Civil. Pede a condenação ao pagamento.';

const buscadorFake: BuscadorWeb = {
  async buscar(consulta) {
    if (consulta.includes('1234567')) {
      return [
        { url: 'https://agregador.com.br/resp-1234567', trecho: 'REsp 1234567' },
        { url: 'https://scon.stj.jus.br/SCON/x', titulo: 'REsp 1.234.567/SP', trecho: 'REsp 1234567' },
      ];
    }
    return [];
  },
  async obterTexto() {
    return '';
  },
};

const analisar = (extra: Record<string, unknown> = {}) => ({
  sessao_analitica_id: 'nova',
  area_direito: 'civil',
  fase_processual: 'postulatoria',
  texto_documento: TEXTO,
  estrutura: {
    qualificacao: 'Fulano x Beltrano',
    fatos: [{ descricao: 'Inadimplemento', trecho: 'o réu deixou de pagar o contrato firmado em 2024' }],
    fundamentos: [{ descricao: 'Responsabilidade contratual', trecho: 'art. 389 do Código Civil', dispositivos: ['CC art. 389'] }],
    pedidos_dispositivo: [],
  },
  ...extra,
});

describe('módulo de análise jurídica (via McpHandler)', () => {
  let client: Awaited<ReturnType<typeof createDatabase>>['client'];
  let ledger: LedgerService;
  let handler: McpHandler;
  let n = 0;
  const ctx = { tenantId: 'tenant_a', userId: 'user_a' };

  async function chamar(name: string, args: Record<string, unknown>, contexto = ctx) {
    const resposta = await handler.handleRequest(
      { jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: { idempotencyKey: `k${n}`, ...args } } },
      contexto,
    );
    return resposta;
  }
  const dados = (resposta: any) => resposta.result.structuredContent;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    client = connection.client;
    ledger = new LedgerService(connection.db);
    await ledger.bootstrapTables();
    await ledger.provisionAccount('tenant_a', { paidBalanceCents: 10_000, promotionalBalanceCents: 0 });
    await ledger.provisionAccount('tenant_b', { paidBalanceCents: 10_000, promotionalBalanceCents: 0 });
    const registry = new ToolRegistry();
    const modulo = await ModuloAnalise.criar({ client, ledger, registry, buscador: buscadorFake });
    handler = new McpHandler(registry, ledger, undefined, {
      exposedToolNames: ModuloAnalise.toolsExpostas,
      toolModules: [modulo],
    });
  });

  afterEach(async () => {
    // O banco em memória é compartilhado entre os casos: zera tudo, inclusive o registro de migrations.
    await client.execute('PRAGMA foreign_keys = OFF');
    const { rows } = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    for (const row of rows) await client.execute(`DROP TABLE IF EXISTS "${String(row.name)}"`);
    client.close();
  });

  it('não expõe a verificação de jurisprudência como tool do cliente', async () => {
    const lista = await handler.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const nomes = lista.result.tools.map((tool: { name: string }) => tool.name);
    expect(nomes).toEqual([...ModuloAnalise.toolsExpostas]);
    expect(nomes).not.toContain(NOMES_TOOLS.jurisprudenciaVerificar);
    const redigir = lista.result.tools.find((tool: { name: string }) => tool.name === NOMES_TOOLS.pecaRedigir);
    expect(redigir.description).toContain('aviso obrigatório');
    expect(redigir.description).toContain(AVISO_VIGENCIA_NAO_VERIFICADA);
  });

  it('encadeia as etapas pelo sessao_analitica_id e registra o histórico', async () => {
    const a = await chamar(NOMES_TOOLS.pecaAnalisar, analisar());
    const id = dados(a).sessao_analitica_id as string;
    expect(id).toMatch(/^sa_/);
    expect(dados(a).proxima_etapa_sugerida).toBe(NOMES_TOOLS.mapearTeses);
    expect(dados(a).elementos_ausentes.map((e: any) => e.elemento)).toEqual(['pedidos']);

    const m = await chamar(NOMES_TOOLS.mapearTeses, {
      sessao_analitica_id: id,
      area_direito: 'civil',
      teses_sustentadas: [{ tese: 'Inadimplemento contratual', viabilidade: 'alta', justificativa_viabilidade: 'Contrato e mora comprovados.' }],
      precedentes: [{ referencia: { tribunal: 'STJ', numero: 'REsp 1234567' } }, { referencia: { tribunal: 'STJ', numero: 'REsp 7654321' } }],
      dispositivos_citados: [{ dispositivo: 'CC art. 389', verificado_em_fonte_oficial: false }],
    });
    expect(dados(m).precedentes.map((p: any) => p.status_verificacao)).toEqual(['confirmado_busca_externa', 'nao_verificado']);
    expect(dados(m).precedentes[0].fonte.host).toBe('scon.stj.jus.br');
    expect(dados(m).precedentes[1].motivo).toBe('precedente_nao_encontrado');
    expect(dados(m).precedentes_nao_verificados).toBe(1);
    expect(dados(m).verificacao_normativa[0].alerta).toBe(AVISO_VIGENCIA_NAO_VERIFICADA);
    expect(dados(m).proxima_etapa_sugerida).toBe(NOMES_TOOLS.avaliarProva);

    const p = await chamar(NOMES_TOOLS.avaliarProva, {
      sessao_analitica_id: id,
      area_direito: 'civil',
      fatos_controvertidos: [{ fato: 'Existência do contrato', onus: 'autor', fundamento_onus: 'CPC art. 373, I', risco_preclusao: 'medio', meios_de_prova_cabiveis: ['documental'] }],
    });
    expect(dados(p).lacunas_probatorias).toHaveLength(1);
    expect(dados(p).regime_onus_area.area_direito).toBe('civil');

    const e = await chamar(NOMES_TOOLS.estrategiaDefinir, {
      sessao_analitica_id: id,
      area_direito: 'civil',
      recomendacao: 'produzir_prova_especifica',
      opcoes: [
        { movimento: 'produzir_prova_especifica', justificativa_juridica: 'Suprir lacuna documental.', custo: 'baixo', tempo: 'medio', risco: 'baixo', ponderacao: 'Barato e reduz o risco.', precedentes: [{ tribunal: 'STJ', numero: 'REsp 1234567' }] },
        { movimento: 'acordar', justificativa_juridica: 'Encerrar o litígio.', custo: 'baixo', tempo: 'baixo', risco: 'medio', ponderacao: 'Perde parte do valor.' },
      ],
    });
    expect(dados(e).avaliacao_prova_considerada).toBe(true);
    expect(dados(e).opcoes[0].precedentes[0].status_verificacao).toBe('confirmado_busca_externa');
    expect(dados(e).proxima_etapa_sugerida).toBe(NOMES_TOOLS.pecaRedigir);

    const r = await chamar(NOMES_TOOLS.pecaRedigir, {
      sessao_analitica_id: id,
      area_direito: 'civil',
      modo: 'redacao_integral',
      instrucoes: 'Redija a manifestação sobre provas.',
      texto_peca: `${TEXTO} Conforme a Súmula 331 e o REsp 1234567, requer-se a produção de prova documental complementar para comprovar o ajuste firmado.`,
    });
    expect(dados(r).aviso_obrigatorio).toBe(AVISO_OBRIGATORIO);
    expect(dados(r).proxima_etapa_sugerida).toBeNull();
    const detectados = dados(r).precedentes.filter((x: any) => x.origem === 'detectado_no_texto');
    expect(detectados.length).toBeGreaterThanOrEqual(2);
    for (const precedente of dados(r).precedentes) expect(['confirmado_busca_externa', 'nao_verificado']).toContain(precedente.status_verificacao);
    const sumula = detectados.find((x: any) => x.referencia.numero.startsWith('Súmula'));
    expect(sumula.motivo).toBe('tribunal_nao_identificavel');

    const { rows } = await client.execute({ sql: 'SELECT tipo_analise FROM analise_achados WHERE sessao_analitica_id = ? ORDER BY ordem', args: [id] });
    expect(rows.map((row) => row.tipo_analise)).toEqual(['triagem', 'analisar', 'mapear_teses', 'avaliar_prova', 'estrategia', 'redigir']);
  });

  it('recusa entradas incompletas ou fora de ordem', async () => {
    const semApontamentos = await chamar(NOMES_TOOLS.pecaRedigir, {
      sessao_analitica_id: 'nova', area_direito: 'civil', fase_processual: 'recursal', modo: 'correcao_dirigida', texto_original: TEXTO, apontamentos: [],
    });
    expect(semApontamentos.error?.code).toBe(-32602);

    const modosCombinados = await chamar(NOMES_TOOLS.pecaRedigir, {
      sessao_analitica_id: 'nova', area_direito: 'civil', fase_processual: 'recursal', modo: 'correcao_dirigida', texto_original: TEXTO,
      apontamentos: [{ trecho_original: 'Fulano', substituicao: 'Sicrano', motivo: 'Erro de nome' }], instrucoes: 'redigir tudo de novo',
    });
    expect(modosCombinados.error?.code).toBe(-32602);

    const semFase = await chamar(NOMES_TOOLS.pecaAnalisar, analisar({ fase_processual: undefined }));
    expect(semFase.error?.data.orientacao).toContain('fase processual');

    const a = await chamar(NOMES_TOOLS.pecaAnalisar, analisar());
    const foraDeOrdem = await chamar(NOMES_TOOLS.avaliarProva, {
      sessao_analitica_id: dados(a).sessao_analitica_id, area_direito: 'civil',
      fatos_controvertidos: [{ fato: 'Existência do contrato', onus: 'indefinido', risco_preclusao: 'baixo' }],
    });
    expect(foraDeOrdem.error?.data.orientacao).toContain('etapa anterior');

    const apontamentoInexistente = await chamar(NOMES_TOOLS.pecaRedigir, {
      sessao_analitica_id: dados(a).sessao_analitica_id, area_direito: 'civil', modo: 'correcao_dirigida', texto_original: TEXTO,
      apontamentos: [{ trecho_original: 'trecho que não existe', substituicao: 'x', motivo: 'Teste' }],
    });
    expect(apontamentoInexistente.error?.data.orientacao).toContain('Nada foi alterado');
  });

  it('correção dirigida preserva o texto fora dos apontamentos e traz o aviso obrigatório', async () => {
    const a = await chamar(NOMES_TOOLS.pecaAnalisar, analisar());
    const r = await chamar(NOMES_TOOLS.pecaRedigir, {
      sessao_analitica_id: dados(a).sessao_analitica_id, area_direito: 'civil', modo: 'correcao_dirigida', texto_original: TEXTO,
      apontamentos: [{ trecho_original: 'Beltrano', substituicao: 'Beltrano Silva', motivo: 'Qualificação completa do réu' }],
    });
    expect(dados(r).texto_final).toBe(TEXTO.replace('Beltrano', 'Beltrano Silva'));
    expect(dados(r).aviso_obrigatorio).toBe(AVISO_OBRIGATORIO);
    expect(JSON.parse(r.result.content[0].text).aviso_obrigatorio).toBe(AVISO_OBRIGATORIO);
  });

  it('não deixa um usuário usar a sessão de outro', async () => {
    const a = await chamar(NOMES_TOOLS.pecaAnalisar, analisar());
    const invasor = await chamar(
      NOMES_TOOLS.mapearTeses,
      { sessao_analitica_id: dados(a).sessao_analitica_id, area_direito: 'civil', teses_sustentadas: [{ tese: 'Tese qualquer', viabilidade: 'baixa', justificativa_viabilidade: 'Sem base.' }] },
      { tenantId: 'tenant_b', userId: 'user_b' },
    );
    expect(invasor.error?.data.orientacao).toContain('Não localizei');
  });

  it('não expõe códigos, nomes de ferramentas nem ids ao usuário final', async () => {
    const lista = await handler.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    for (const tool of lista.result.tools) expect(tool.description).toContain('APRESENTAÇÃO AO USUÁRIO');

    const a = await chamar(NOMES_TOOLS.pecaAnalisar, analisar());
    expect(dados(a).apresentacao).toMatchObject({ etapa: 'Analisando a peça', situacao: 'concluida' });
    expect(dados(a).apresentacao.resumo).not.toMatch(/analise\.|sa_|ANALISE_|status_/);

    const erro = await chamar(NOMES_TOOLS.mapearTeses, {
      sessao_analitica_id: dados(a).sessao_analitica_id, area_direito: 'civil',
      teses_sustentadas: [{ tese: 'Tese qualquer', viabilidade: 'baixa', justificativa_viabilidade: 'Sem base.' }],
    });
    expect(erro.result).toBeDefined();

    const falha = await chamar(NOMES_TOOLS.avaliarProva, {
      sessao_analitica_id: 'nova', area_direito: 'civil', fase_processual: 'postulatoria',
      fatos_controvertidos: [{ fato: 'Existência do contrato', onus: 'indefinido', risco_preclusao: 'baixo' }],
    });
    const texto = JSON.stringify(falha.error);
    expect(texto).not.toMatch(/ANALISE_|INVALID_|UNAUTHORIZED|BILLING_|IDEMPOTENCY|analise\./);
    expect(falha.error?.data).not.toHaveProperty('code');
  });

  it('exige usuário autenticado', async () => {
    const resposta = await chamar(NOMES_TOOLS.pecaAnalisar, analisar(), {} as typeof ctx);
    expect(resposta.error?.data.orientacao).toContain('autenticado');
  });

  it('cobra preço da tool + triagem, sem cobrar de novo em repetição', async () => {
    const antes = await ledger.getAvailableBalanceCents('tenant_a');
    const args = { idempotencyKey: 'chave-fixa', ...analisar() };
    const primeira = await handler.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: NOMES_TOOLS.pecaAnalisar, arguments: args } }, ctx);
    expect(primeira.result.billing.chargedCents).toBe(PRECO_TOOL_CENTS[NOMES_TOOLS.pecaAnalisar] + PRECO_TRIAGEM_CENTS);
    const repetida = await handler.handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: NOMES_TOOLS.pecaAnalisar, arguments: args } }, ctx);
    expect(repetida.result.billing).toMatchObject({ chargedCents: 0, isReplay: true });
    expect(dados(repetida).sessao_analitica_id).toBe(dados(primeira).sessao_analitica_id);
    expect(await ledger.getAvailableBalanceCents('tenant_a')).toBe(antes - primeira.result.billing.chargedCents);
  });

  it('combo: cobra o pacote uma vez e desconta as chamadas cobertas', async () => {
    const a = await chamar(NOMES_TOOLS.pecaAnalisar, analisar());
    const id = dados(a).sessao_analitica_id;
    const antes = await ledger.getAvailableBalanceCents('tenant_a');
    const combo = await chamar(NOMES_TOOLS.comboAtivar, { sessao_analitica_id: id, combo: 'decisao' });
    expect(combo.result.billing.chargedCents).toBe(precoComboCents('decisao'));
    expect(dados(combo).tools_incluidas).toEqual([...COMBOS.decisao.tools]);

    const duplicado = await chamar(NOMES_TOOLS.comboAtivar, { sessao_analitica_id: id, combo: 'decisao' });
    expect(duplicado.error?.data.orientacao).toContain('já está ativo');

    const m = await chamar(NOMES_TOOLS.mapearTeses, {
      sessao_analitica_id: id, area_direito: 'civil',
      teses_sustentadas: [{ tese: 'Inadimplemento contratual', viabilidade: 'alta', justificativa_viabilidade: 'Mora comprovada.' }],
    });
    expect(m.result.billing).toMatchObject({ mode: 'COMBO', chargedCents: 0 });
    expect(m.result.billing.combo.tools_restantes).toEqual([NOMES_TOOLS.pecaAnalisar, NOMES_TOOLS.estrategiaDefinir]);
    expect(await ledger.getAvailableBalanceCents('tenant_a')).toBe(antes - precoComboCents('decisao'));

    // avaliar_prova não está no combo "decisao": preço cheio.
    const p = await chamar(NOMES_TOOLS.avaliarProva, {
      sessao_analitica_id: id, area_direito: 'civil',
      fatos_controvertidos: [{ fato: 'Existência do contrato', onus: 'autor', fundamento_onus: 'CPC art. 373, I', risco_preclusao: 'baixo' }],
    });
    expect(p.result.billing.mode).toBe('METERED');
  });

  it('recusa quando o saldo é insuficiente, sem registrar achado', async () => {
    await ledger.provisionAccount('tenant_pobre', { paidBalanceCents: 10, promotionalBalanceCents: 0 });
    const resposta = await chamar(NOMES_TOOLS.pecaAnalisar, analisar(), { tenantId: 'tenant_pobre', userId: 'user_p' });
    expect(resposta.error?.data.orientacao).toContain('Saldo insuficiente');
    const { rows } = await client.execute('SELECT COUNT(*) AS total FROM analise_achados');
    expect(Number(rows[0]?.total)).toBe(0);
  });
});
