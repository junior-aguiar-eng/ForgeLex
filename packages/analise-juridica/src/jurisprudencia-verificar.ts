import type {
  PrecedenteRef,
  PrecedenteVerificado,
} from './contratos.js';

/**
 * Verificação ao vivo de precedentes em fontes oficiais. Módulo totalmente
 * independente do índice jurisprudencial do produto atual: não mantém base
 * própria, não importa tool nem repositório existente e trata todos os
 * tribunais pela mesma via.
 */

export interface ResultadoBusca {
  url: string;
  titulo?: string;
  trecho?: string;
}

export interface BuscadorWeb {
  /** Busca restrita aos domínios informados (ex.: via `site:`). Lança se indisponível. */
  buscar(consulta: string, dominios: readonly string[], sinal: AbortSignal): Promise<ResultadoBusca[]>;
  /** Obtém o texto de uma página já filtrada por domínio. */
  obterTexto(url: string, sinal: AbortSignal): Promise<string>;
}

interface Tribunal {
  sigla: string;
  /** Domínios oficiais, em ordem de prioridade (site do tribunal, depois portais oficiais). */
  dominios: readonly string[];
}

const TRIBUNAIS_SUPERIORES: Tribunal[] = [
  { sigla: 'STF', dominios: ['stf.jus.br', 'portal.stf.jus.br'] },
  { sigla: 'STJ', dominios: ['stj.jus.br', 'scon.stj.jus.br'] },
  { sigla: 'TST', dominios: ['tst.jus.br', 'jurisprudencia.tst.jus.br'] },
  { sigla: 'TSE', dominios: ['tse.jus.br'] },
  { sigla: 'STM', dominios: ['stm.jus.br'] },
];

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export function identificarTribunal(sigla: string | undefined): Tribunal | undefined {
  const normalizada = sigla?.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalizada) return undefined;
  const superior = TRIBUNAIS_SUPERIORES.find((tribunal) => tribunal.sigla === normalizada);
  if (superior) return superior;
  const trf = /^TRF([1-6])$/.exec(normalizada);
  if (trf) return { sigla: normalizada, dominios: [`trf${trf[1]}.jus.br`, 'cjf.jus.br'] };
  const trt = /^TRT(\d{1,2})$/.exec(normalizada);
  if (trt && Number(trt[1]) >= 1 && Number(trt[1]) <= 24) return { sigla: normalizada, dominios: [`trt${Number(trt[1])}.jus.br`] };
  const tj = /^TJ([A-Z]{2})$/.exec(normalizada);
  if (tj && UFS.includes(tj[1]!)) return { sigla: normalizada, dominios: [`tj${tj[1]!.toLowerCase()}.jus.br`] };
  return undefined;
}

/** Deduz o tribunal a partir de sigla explícita ou do texto do número (ex.: "REsp ...", "RE ...", CNJ J.TR). */
export function tribunalDaReferencia(ref: PrecedenteRef): Tribunal | undefined {
  const explicito = identificarTribunal(ref.tribunal);
  if (explicito) return explicito;
  const texto = `${ref.numero ?? ''} ${ref.descricao_tese ?? ''}`;
  const sigla = /\b(STF|STJ|TST|TSE|STM|TRF[1-6]|TRT\d{1,2}|TJ[A-Z]{2})\b/i.exec(texto);
  if (sigla) return identificarTribunal(sigla[1]);
  const cnj = /\b\d{7}-?\d{2}\.?\d{4}\.?(\d)\.?(\d{2})\.?\d{4}\b/.exec(texto);
  if (cnj) {
    const [, segmento, tr] = cnj;
    if (segmento === '5' && tr) return identificarTribunal(`TRT${Number(tr)}`);
    if (segmento === '4' && tr) return identificarTribunal(`TRF${Number(tr)}`);
  }
  return undefined;
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function soDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com',
  'que', 'se', 'ao', 'aos', 'um', 'uma', 'ou', 'sobre', 'sua', 'seu',
]);

function termosDistintivos(texto: string): string[] {
  return [...new Set(semAcento(texto).split(/[^a-z0-9]+/).filter((termo) => termo.length > 3 && !STOPWORDS.has(termo)))];
}

/** Critério de confirmação: o identificador do precedente (ou os termos da tese) aparece no texto oficial. */
export function textoConfirmaReferencia(ref: PrecedenteRef, textoOficial: string): boolean {
  const digitosTexto = soDigitos(textoOficial);
  if (ref.numero) {
    const digitosRef = soDigitos(ref.numero);
    // Números curtos (ex.: Súmula 331) geram falso positivo em texto de dígitos concatenados.
    if (digitosRef.length >= 6) return digitosTexto.includes(digitosRef);
    const alvo = semAcento(ref.numero).replace(/\s+/g, ' ').trim();
    const texto = semAcento(textoOficial).replace(/\s+/g, ' ');
    return texto.includes(alvo);
  }
  if (!ref.descricao_tese) return false;
  const termos = termosDistintivos(ref.descricao_tese);
  if (termos.length < 3) return false;
  const texto = semAcento(textoOficial);
  const presentes = termos.filter((termo) => texto.includes(termo)).length;
  return presentes / termos.length >= 0.8;
}

function hostOficial(url: string, dominios: readonly string[]): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return undefined;
    const host = parsed.hostname.toLowerCase();
    return dominios.some((dominio) => host === dominio || host.endsWith(`.${dominio}`)) ? host : undefined;
  } catch {
    return undefined;
  }
}

function naoVerificado(
  ref: PrecedenteRef,
  tribunal: string | null,
  motivo: 'busca_indisponivel' | 'precedente_nao_encontrado' | 'tribunal_nao_identificavel',
): PrecedenteVerificado {
  const alertas = {
    busca_indisponivel: 'Busca em fonte oficial indisponível: precedente NÃO verificado. Não cite como confirmado.',
    precedente_nao_encontrado: 'Precedente não localizado em fonte oficial: não cite sem confirmação manual.',
    tribunal_nao_identificavel: 'Tribunal não identificável a partir da citação: informe a sigla do tribunal para verificar.',
  } as const;
  return {
    referencia: ref,
    tribunal,
    status_verificacao: 'nao_verificado',
    fonte: null,
    motivo,
    alerta: alertas[motivo],
  };
}

export interface OpcoesVerificador {
  buscador?: BuscadorWeb;
  /** Limite de resultados oficiais abertos por precedente. */
  maxPaginas?: number;
  timeoutMs?: number;
  agora?: () => Date;
}

export class JurisprudenciaVerificador {
  private readonly buscador?: BuscadorWeb;
  private readonly maxPaginas: number;
  private readonly timeoutMs: number;
  private readonly agora: () => Date;

  public constructor(opcoes: OpcoesVerificador = {}) {
    this.buscador = opcoes.buscador;
    this.maxPaginas = opcoes.maxPaginas ?? 3;
    this.timeoutMs = opcoes.timeoutMs ?? 12_000;
    this.agora = opcoes.agora ?? (() => new Date());
  }

  public async verificar(ref: PrecedenteRef, sinalExterno?: AbortSignal): Promise<PrecedenteVerificado> {
    const tribunal = tribunalDaReferencia(ref);
    if (!tribunal) return naoVerificado(ref, null, 'tribunal_nao_identificavel');
    if (!this.buscador) return naoVerificado(ref, tribunal.sigla, 'busca_indisponivel');

    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), this.timeoutMs);
    const repassar = () => controlador.abort();
    sinalExterno?.addEventListener('abort', repassar, { once: true });
    try {
      const consulta = [tribunal.sigla, ref.numero, ref.descricao_tese].filter(Boolean).join(' ');
      let achados: ResultadoBusca[];
      try {
        achados = await this.buscador.buscar(consulta, tribunal.dominios, controlador.signal);
      } catch {
        return naoVerificado(ref, tribunal.sigla, 'busca_indisponivel');
      }
      // Ordem de prioridade: domínios do tribunal primeiro; agregadores nunca entram.
      const oficiais = achados
        .map((item) => ({ item, host: hostOficial(item.url, tribunal.dominios) }))
        .filter((par): par is { item: ResultadoBusca; host: string } => par.host !== undefined)
        .sort((a, b) => prioridade(a.host, tribunal) - prioridade(b.host, tribunal))
        .slice(0, this.maxPaginas);

      let algumaFalhaDeAcesso = false;
      for (const { item, host } of oficiais) {
        let texto = `${item.titulo ?? ''} ${item.trecho ?? ''}`;
        if (!textoConfirmaReferencia(ref, texto)) {
          try {
            texto = await this.buscador.obterTexto(item.url, controlador.signal);
          } catch {
            algumaFalhaDeAcesso = true;
            continue;
          }
        }
        if (textoConfirmaReferencia(ref, texto)) {
          return {
            referencia: ref,
            tribunal: tribunal.sigla,
            status_verificacao: 'confirmado_busca_externa',
            fonte: { url: item.url, host, consultado_em: this.agora().toISOString() },
            motivo: null,
            alerta: null,
          };
        }
      }
      return naoVerificado(ref, tribunal.sigla, algumaFalhaDeAcesso && oficiais.length > 0 ? 'busca_indisponivel' : 'precedente_nao_encontrado');
    } finally {
      clearTimeout(timer);
      sinalExterno?.removeEventListener('abort', repassar);
    }
  }

  public async verificarTodos(refs: readonly PrecedenteRef[], sinal?: AbortSignal): Promise<PrecedenteVerificado[]> {
    const resultados: PrecedenteVerificado[] = [];
    for (const ref of refs) resultados.push(await this.verificar(ref, sinal));
    return resultados;
  }
}

function prioridade(host: string, tribunal: Tribunal): number {
  const indice = tribunal.dominios.findIndex((dominio) => host === dominio || host.endsWith(`.${dominio}`));
  return indice < 0 ? Number.MAX_SAFE_INTEGER : indice;
}

/** Buscador baseado em fetch: endpoint de busca configurável (JSON) + leitura de páginas oficiais. */
export function criarBuscadorHttp(config: {
  endpointBusca: string;
  tokenBusca?: string;
  fetchImpl?: typeof fetch;
  maxBytesPagina?: number;
}): BuscadorWeb {
  const executar = config.fetchImpl ?? fetch;
  const maxBytes = config.maxBytesPagina ?? 1_500_000;
  return {
    async buscar(consulta, dominios, sinal) {
      const consultaRestrita = `${consulta} (${dominios.map((dominio) => `site:${dominio}`).join(' OR ')})`;
      const url = new URL(config.endpointBusca);
      url.searchParams.set('q', consultaRestrita);
      const resposta = await executar(url, {
        signal: sinal,
        headers: { accept: 'application/json', ...(config.tokenBusca ? { authorization: `Bearer ${config.tokenBusca}` } : {}) },
      });
      if (!resposta.ok) throw new Error(`BUSCA_HTTP_${resposta.status}`);
      const corpo = (await resposta.json()) as { results?: ResultadoBusca[] };
      return Array.isArray(corpo.results)
        ? corpo.results.filter((item) => typeof item?.url === 'string').slice(0, 10)
        : [];
    },
    async obterTexto(url, sinal) {
      const resposta = await executar(url, { signal: sinal, redirect: 'error', headers: { accept: 'text/html,application/xhtml+xml,text/plain' } });
      if (!resposta.ok) throw new Error(`PAGINA_HTTP_${resposta.status}`);
      const texto = (await resposta.text()).slice(0, maxBytes);
      return texto.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
    },
  };
}
