import { DomainError } from '@forgelex/domain';
import type { AreaDireito, FaseProcessual } from './contratos.js';
import { EstadoAnalitico, type DonoSessao, type ResumoSessao } from './estado.js';

export interface EntradaTriagem {
  area_direito: AreaDireito;
  fase_processual?: FaseProcessual;
}

export interface ResultadoTriagem {
  fase_processual: FaseProcessual;
  area_direito: AreaDireito;
  /** `true` quando a sessão já tinha fase/área e a triagem só confirmou (caminho barato). */
  confirmada_do_estado: boolean;
  /** Divergência entre o informado agora e o registrado: avisa, não sobrescreve em silêncio. */
  divergencias: string[];
}

/**
 * Triagem executada de forma transparente no início de toda tool analítica.
 * A classificação é feita pelo LLM do cliente (o servidor não infere): aqui ela
 * é validada, reconciliada com o estado e registrada. Sem fase informada nem
 * registrada, recusa em vez de adivinhar.
 */
export async function executarTriagem(
  estado: EstadoAnalitico,
  sessaoId: string,
  dono: DonoSessao,
  entrada: EntradaTriagem,
  sessaoAtual: ResumoSessao,
): Promise<ResultadoTriagem> {
  const divergencias: string[] = [];
  const faseRegistrada = sessaoAtual.fase_processual;
  const areaRegistrada = sessaoAtual.area_direito;

  if (faseRegistrada && areaRegistrada) {
    if (entrada.area_direito !== areaRegistrada) {
      divergencias.push(
        `area_direito informada (${entrada.area_direito}) difere da registrada na sessão (${areaRegistrada}); mantida a registrada.`,
      );
    }
    if (entrada.fase_processual && entrada.fase_processual !== faseRegistrada) {
      divergencias.push(
        `fase_processual informada (${entrada.fase_processual}) difere da registrada na sessão (${faseRegistrada}); mantida a registrada.`,
      );
    }
    return { fase_processual: faseRegistrada, area_direito: areaRegistrada, confirmada_do_estado: true, divergencias };
  }

  const fase = faseRegistrada ?? entrada.fase_processual;
  if (!fase) {
    throw new DomainError(
      'INVALID_CANONICAL_STATE',
      'Triagem sem fase_processual: informe a fase (postulatoria, saneamento_instrucao, decisoria, recursal ou cumprimento_execucao). O servidor não infere fase ausente.',
      { code: 'ANALISE_FASE_AUSENTE' },
    );
  }
  const area = areaRegistrada ?? entrada.area_direito;
  await estado.atualizarClassificacao(sessaoId, dono, { fase_processual: fase, area_direito: area });
  await estado.estadoRegistrar(sessaoId, dono, 'triagem', { fase_processual: fase, area_direito: area });
  return { fase_processual: fase, area_direito: area, confirmada_do_estado: false, divergencias };
}
