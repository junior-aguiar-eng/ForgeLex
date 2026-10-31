import { randomUUID } from 'node:crypto';
import { DomainError } from '@forgelex/domain';
import type { Client } from '@forgelex/persistence';
import {
  AreaDireitoSchema,
  FaseProcessualSchema,
  ID_SESSAO_NOVA,
  TipoAnaliseSchema,
  type AreaDireito,
  type FaseProcessual,
  type ResumoAchado,
  type TipoAnalise,
} from './contratos.js';

export interface Achado {
  ordem: number;
  tipo_analise: TipoAnalise;
  timestamp: string;
  resumo: ResumoAchado;
}

export interface ResumoSessao {
  sessao_analitica_id: string;
  numero_processo: string | null;
  fase_processual: FaseProcessual | null;
  area_direito: AreaDireito | null;
  historico_achados: Achado[];
}

export interface DonoSessao {
  tenantId: string;
  usuarioId: string;
}

const MAX_RESUMO_BYTES = 8 * 1024;

function erroSessao(message: string): DomainError {
  return new DomainError('TENANT_VIOLATION', message, { code: 'ANALISE_SESSAO_INDISPONIVEL' });
}

function linhaParaResumo(row: Record<string, unknown>, achados: Achado[]): ResumoSessao {
  const fase = FaseProcessualSchema.safeParse(row.fase_processual);
  const area = AreaDireitoSchema.safeParse(row.area_direito);
  return {
    sessao_analitica_id: String(row.sessao_analitica_id),
    numero_processo: row.numero_processo == null ? null : String(row.numero_processo),
    fase_processual: fase.success ? fase.data : null,
    area_direito: area.success ? area.data : null,
    historico_achados: achados,
  };
}

/**
 * Estado persistente da sessão analítica. Isolado do produto atual: só usa as
 * tabelas `analise_*` e o mesmo vínculo de identidade (tenant + usuário).
 */
export class EstadoAnalitico {
  public constructor(private readonly client: Client) {}

  /** Abre sessão nova (id gerado) ou valida que a existente pertence ao usuário. */
  public async abrirSessao(idInformado: string, dono: DonoSessao, numeroProcesso?: string): Promise<string> {
    if (idInformado !== ID_SESSAO_NOVA) {
      await this.exigirDono(idInformado, dono);
      if (numeroProcesso) {
        await this.client.execute({
          sql: 'UPDATE analise_sessoes SET numero_processo = COALESCE(numero_processo, ?), atualizada_em = ? WHERE sessao_analitica_id = ?',
          args: [numeroProcesso, new Date().toISOString(), idInformado],
        });
      }
      return idInformado;
    }
    const id = `sa_${randomUUID()}`;
    const agora = new Date().toISOString();
    await this.client.execute({
      sql: `INSERT INTO analise_sessoes (sessao_analitica_id, tenant_id, usuario_id, numero_processo, criada_em, atualizada_em)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, dono.tenantId, dono.usuarioId, numeroProcesso ?? null, agora, agora],
    });
    return id;
  }

  public async exigirDono(id: string, dono: DonoSessao): Promise<void> {
    const rows = await this.client.execute({
      sql: 'SELECT tenant_id, usuario_id FROM analise_sessoes WHERE sessao_analitica_id = ?',
      args: [id],
    });
    const row = rows.rows[0];
    // Mesma mensagem para inexistente e de outro dono: não revela a existência de sessões alheias.
    if (!row || String(row.tenant_id) !== dono.tenantId || String(row.usuario_id) !== dono.usuarioId) {
      throw erroSessao('Sessão analítica não encontrada para este usuário.');
    }
  }

  /** `estado_recuperar`: resumo da sessão, com histórico incremental de achados. */
  public async estadoRecuperar(id: string, dono: DonoSessao): Promise<ResumoSessao> {
    await this.exigirDono(id, dono);
    const sessao = await this.client.execute({
      sql: 'SELECT * FROM analise_sessoes WHERE sessao_analitica_id = ?',
      args: [id],
    });
    const achados = await this.client.execute({
      sql: 'SELECT ordem, tipo_analise, resumo, registrado_em FROM analise_achados WHERE sessao_analitica_id = ? ORDER BY ordem ASC',
      args: [id],
    });
    const lista: Achado[] = achados.rows.map((row) => ({
      ordem: Number(row.ordem),
      tipo_analise: TipoAnaliseSchema.parse(row.tipo_analise),
      timestamp: String(row.registrado_em),
      resumo: JSON.parse(String(row.resumo)) as ResumoAchado,
    }));
    return linhaParaResumo(sessao.rows[0] as Record<string, unknown>, lista);
  }

  /** `estado_registrar`: acrescenta um achado ao histórico (resumo curto, não o JSON completo). */
  public async estadoRegistrar(
    id: string,
    dono: DonoSessao,
    tipoAnalise: TipoAnalise,
    resumo: ResumoAchado,
  ): Promise<Achado> {
    await this.exigirDono(id, dono);
    const serializado = JSON.stringify(resumo);
    if (Buffer.byteLength(serializado, 'utf8') > MAX_RESUMO_BYTES) {
      throw new DomainError(
        'INVALID_CANONICAL_STATE',
        'O resumo do achado excede o limite; registre só os campos-chave.',
        {
          code: 'ANALISE_RESUMO_GRANDE',
        },
      );
    }
    const agora = new Date().toISOString();
    // A ordem é calculada e inserida em um único comando; UNIQUE(sessao, ordem) barra corridas.
    await this.client.execute({
      sql: `INSERT INTO analise_achados (id, sessao_analitica_id, ordem, tipo_analise, resumo, registrado_em)
            VALUES (?, ?, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM analise_achados WHERE sessao_analitica_id = ?), ?, ?, ?)`,
      args: [randomUUID(), id, id, tipoAnalise, serializado, agora],
    });
    await this.client.execute({
      sql: 'UPDATE analise_sessoes SET atualizada_em = ? WHERE sessao_analitica_id = ?',
      args: [agora, id],
    });
    const ultimo = await this.client.execute({
      sql: 'SELECT ordem FROM analise_achados WHERE sessao_analitica_id = ? ORDER BY ordem DESC LIMIT 1',
      args: [id],
    });
    return { ordem: Number(ultimo.rows[0]?.ordem ?? 0), tipo_analise: tipoAnalise, timestamp: agora, resumo };
  }

  public async atualizarClassificacao(
    id: string,
    dono: DonoSessao,
    classificacao: { fase_processual?: FaseProcessual; area_direito?: AreaDireito },
  ): Promise<void> {
    await this.exigirDono(id, dono);
    await this.client.execute({
      sql: `UPDATE analise_sessoes
            SET fase_processual = COALESCE(?, fase_processual), area_direito = COALESCE(?, area_direito), atualizada_em = ?
            WHERE sessao_analitica_id = ?`,
      args: [classificacao.fase_processual ?? null, classificacao.area_direito ?? null, new Date().toISOString(), id],
    });
  }
}

export function ultimoAchado(resumo: ResumoSessao, tipo: TipoAnalise): Achado | undefined {
  return [...resumo.historico_achados].reverse().find((achado) => achado.tipo_analise === tipo);
}
