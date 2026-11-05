import { AgenticTaskActionSchema, TaskEvidenceAnalysisSchema } from '@forgelex/domain';
import type { z } from 'zod';
import { TaskPlanSchema, type CaseTaskRole } from './agentic-case-contracts.js';
import {
  ADAPTIVE_CASE_TASK_POLICY,
  AdaptiveTaskSpecialistResultSchema,
  adaptiveCaseTaskProfile,
} from './agentic-case-graph.js';

export const EvidenceTaskPlanSchema = TaskPlanSchema.extend({
  action: AgenticTaskActionSchema.extract(['analyze_evidence']),
});
export type EvidenceTaskPlan = z.infer<typeof TaskPlanSchema> | z.infer<typeof EvidenceTaskPlanSchema>;
export const EvidenceTaskResultSchema = AdaptiveTaskSpecialistResultSchema.extend({
  evidenceAnalysis: TaskEvidenceAnalysisSchema.optional(),
});
export const EVIDENCE_TASK_POLICY = { ...ADAPTIVE_CASE_TASK_POLICY, version: '1.4.0' } as const;
export function evidenceTaskProfile(role: CaseTaskRole) {
  const prior = adaptiveCaseTaskProfile(role);
  return {
    ...prior,
    version: '1.4.0',
    policyVersion: '1.4.0',
    instructions:
      prior.instructions +
      ' A ação analyze_evidence examina fatos e provas do material selecionado. Não decidir admissibilidade, ônus ou verdade dos fatos; relações probatórias são propostas, não confirmação. Não adotar fatos, provas ou eventos no caso.' +
      (role === 'matter-analyst'
        ? ' Emitir evidenceAnalysis: rows vinculadas às issues e claims, references com sourceId, quote literal, start como índice UTF-16 a partir de zero e relation SUPPORTS/CONTRADICTS/CONTEXT; gaps explícitas. Cobrir cada claim e questão material. Usar apenas DOCUMENT, USER_TEXT e ANSWER; relatos não são prova documental. chronology com claimIds, description, dateText literal ou null e reference. Nunca inferir data; contradictions com claimIds distintos e explanation. Não inventar fatos para preencher matriz vazia.'
        : role === 'adversarial-reviewer'
          ? ' Conferir a evidenceAnalysis ativa do analista: origem, trechos, relações propostas, datas, lacunas e contradições. Emitir findings concretos com fontes; não reemitir ou substituir a matriz, não considerar ocorrência literal como prova de verdade. Novas afirmações sem linha correspondente permanecem sem cobertura probatória.'
          : ''),
  };
}
/** Native task only; historical OAuth workflow contracts remain unchanged. */
export const EVIDENCE_TASK_ACTION = {
  id: 'analyze_evidence' as const,
  label: 'Analisar fatos e provas',
  dialogue: [
    {
      prompt: 'Qual questão os fatos e documentos precisam esclarecer?',
      options: ['Organizar alegações e documentos', 'Examinar contradições', 'Construir a cronologia', 'Ainda não sei'],
    },
  ],
};
