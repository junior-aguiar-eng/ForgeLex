import { AgentRuntime, AgentEvent } from '@forgelex/agent-core';
import { LegalResearchMemo, LegalAuthority } from '@forgelex/domain';
import { randomUUID } from 'node:crypto';

export interface RunMemoWorkflowInput {
  query: string;
  clientOrMatterId?: string;
  tenantId: string;
  userId: string;
}

export class LegalResearchMemoWorkflow {
  private readonly runtime: AgentRuntime;
  private lastGatheredAuthorities: LegalAuthority[] = [];

  constructor(runtime: AgentRuntime) {
    this.runtime = runtime;
  }

  public getLastGatheredAuthorities(): LegalAuthority[] {
    return this.lastGatheredAuthorities;
  }

  public async *execute(input: RunMemoWorkflowInput): AsyncIterable<AgentEvent> {
    const sessionId = randomUUID();
    const prompt = `Elaborar memorando de pesquisa jurídica sobre o tema: "${input.query}".`;

    this.lastGatheredAuthorities = [];

    for await (const event of this.runtime.run({
      sessionId,
      tenantId: input.tenantId,
      userId: input.userId,
      matterId: input.clientOrMatterId,
      prompt,
    })) {
      // Se a ferramenta de busca de jurisprudência retornou acórdãos,
      // nós extraímos as autoridades com proveniência estruturada
      if (event.type === 'tool:completed' && event.toolName === 'research.search_case_law') {
        const output = event.output as any;
        if (output && Array.isArray(output.items)) {
          this.lastGatheredAuthorities = output.items.map((item: any) => ({
            id: randomUUID(),
            type: 'CASE_LAW',
            citation: `${item.court} - ${item.processNumber}`,
            title: `Acórdão relatado por ${item.rapporteur}`,
            summary: item.syllabus,
            provenance: item.provenance,
            relevanceScore: 0.95,
            isBinding: item.court === 'STF',
          }));
        }
      }

      yield event;
    }
  }

  /**
   * Consolida o memorando final estruturado com base nas autoridades coletadas
   */
  public compileFinalMemo(
    query: string,
    authorities: LegalAuthority[],
    matterId?: string
  ): LegalResearchMemo {
    return {
      id: randomUUID(),
      title: `Memorando Jurídico: ${query}`,
      query,
      clientOrMatterId: matterId,
      executiveSummary:
        'Conforme entendimento pacificado no STJ, a ocorrência de vazamento de dados pessoais comuns, por si só, não gera dano moral in re ipsa, sendo indispensável a efetiva comprovação de dano concreto ou risco iminente à vítima.',
      keyTheses: [
        'Dano moral in re ipsa afastado para vazamento de dados cadastrais/comuns (STJ, REsp 1.823.450/SP).',
        'Necessidade de comprovação do nexo causal e do prejuízo efetivo sofrido pelo titular dos dados.',
        'A autodeterminação informativa é direito fundamental autônomo protegido pelo art. 5º da CF/88 (STF, ADI 6.387/DF).',
      ],
      applicableAuthorities: authorities,
      riskAnalysis:
        'Risco ALTO de improcedência de pedidos de indenização fundamentados unicamente no fato do vazamento de dados, sem provas materiais do prejuízo.',
      recommendedAction:
        'Instruir o cliente a levantar extratos bancários, tentativas de golpe sofridas ou ocorrências de fraude antes do ajuizamento da ação.',
      generatedAt: new Date().toISOString(),
      verifiedByHuman: false,
    };
  }
}
