import { z } from 'zod';
import {
  AgenticTaskActionSchema,
  TaskClaimSchema,
  TaskDocumentSchema,
  TaskFindingSchema,
  TaskIssueSchema,
  TaskRequirementSchema,
} from '@forgelex/domain';
import { LEGAL_AGENT_CATALOG } from './agent-catalog.js';
import { LEGAL_WORK_INSTRUCTIONS, LEGAL_WORK_POLICY } from './instructions/legal-work.js';
import { RESEARCH_AUTHORITY_INSTRUCTIONS } from './instructions/research-authority.js';
import { AUTHORITY_VERIFIER_INSTRUCTIONS } from './instructions/authority-verifier.js';
const id = z.string().trim().min(1).max(80),
  text = z.string().trim().min(1).max(4000);
export const TaskPlanSchema = z.strictObject({
  action: AgenticTaskActionSchema,
  requiresCaseLaw: z.boolean(),
  requiresNorms: z.boolean(),
  requiresProcedure: z.boolean(),
  documentType: text.optional(),
  issues: z.array(TaskIssueSchema).max(100),
  gaps: z
    .array(
      z.strictObject({
        key: id,
        kind: z.enum(['MISSING', 'CONFLICT']),
        material: z.boolean(),
        prompt: text,
        reason: text,
        sourceIds: z.array(z.string().min(1).max(200)).max(100),
        options: z.array(z.strictObject({ id, label: text })).max(10),
        selection: z.enum(['single', 'multiple']).optional(),
      }),
    )
    .max(10),
});
export const TaskSpecialistResultSchema = z.strictObject({
  coveredIssueIds: z.array(z.string().min(1).max(200)).max(100),
  claims: z.array(TaskClaimSchema).max(100),
  requirements: z.array(TaskRequirementSchema).max(100),
  findings: z.array(TaskFindingSchema).max(100),
  supportChecks: z
    .array(
      z.strictObject({
        claimId: id,
        sourceId: z.string().min(1).max(200),
        quote: text,
        assessment: z.enum(['SUPPORTED', 'PARTIAL', 'NONE', 'UNDETERMINED']),
      }),
    )
    .max(100),
  document: TaskDocumentSchema.optional(),
});
export type TaskPlan = z.infer<typeof TaskPlanSchema>;
export type TaskSpecialistResult = z.infer<typeof TaskSpecialistResultSchema>;
export type CaseTaskRole =
  | 'legal-orchestrator'
  | 'matter-analyst'
  | 'legal-researcher'
  | 'authority-verifier'
  | 'procedural-advisor'
  | 'legal-drafter'
  | 'adversarial-reviewer';
export const CASE_TASK_POLICY = {
  id: 'agentic-case-task-policy',
  version: '1.0.0',
  maxTurns: 6,
  maxToolsPerStep: 12,
  maxTools: 48,
  maxBytes: 192000,
  rules: [
    ...LEGAL_WORK_POLICY.rules,
    'Produzir apenas handoff estruturado via task.submit; não registrar cadeia de pensamento.',
    'Somente fontes efetivamente recuperadas sustentam referências; identidade de citação não demonstra suporte.',
    'Lacuna material exige pergunta neutra ou entrega limitada; desconhecimento não confirma fatos.',
    'Não há escolha implícita de peça, procedimento, provider, modelo ou autorização financeira.',
  ],
} as const;
const baseRole = (role: CaseTaskRole) => (role === 'legal-researcher' ? 'legal-researcher' : role);
export function caseTaskProfile(role: CaseTaskRole) {
  const agent = LEGAL_AGENT_CATALOG.find((a) => a.role === baseRole(role));
  const instruction = [
    ...LEGAL_WORK_INSTRUCTIONS,
    RESEARCH_AUTHORITY_INSTRUCTIONS,
    AUTHORITY_VERIFIER_INSTRUCTIONS,
  ].find((i) => agent && i.id === agent.instructionId);
  const extra =
    role === 'legal-orchestrator'
      ? 'Delimitar objetivo a partir do contexto, planejar fontes normativas/jurisprudenciais e questões; delegar somente os papéis necessários. Pedir esclarecimento apenas de lacuna material, usando opções neutras, texto livre e desconhecimento; aproveitar respostas e dados já fornecidos.'
      : role === 'procedural-advisor'
        ? 'Investigar medida, posição processual e requisitos com fontes; sem regra ou prazo presumido. Ausência de norma recuperada e aplicabilidade não avaliada devem virar limitações identificáveis.'
        : undefined;
  const tools: string[] = ['case.read_selected'];
  if (role === 'legal-researcher')
    tools.push(
      'research.search_case_law',
      'research.get_authority',
      'research.verify_authority',
      'research.get_legislation',
    );
  if (role === 'authority-verifier') tools.push('research.get_authority', 'research.verify_authority');
  if (role === 'procedural-advisor') tools.push('research.get_legislation');
  return {
    role,
    version: '1.0.0',
    instructionId: agent?.instructionId ?? `${role}-instructions`,
    instructionVersion: agent?.instructionVersion ?? '1.0.0',
    legacyAgentId: agent?.id ?? null,
    legacyAgentVersion: agent?.version ?? null,
    policyId: CASE_TASK_POLICY.id,
    policyVersion: CASE_TASK_POLICY.version,
    instructions:
      extra ??
      `${JSON.stringify(instruction)}${role === 'authority-verifier' ? ' Extensão interna da tarefa: conferir também identidade, versão e trecho de snapshots normativos recuperados, sem afirmar vigência online ou aplicabilidade jurídica.' : ''}`,
    allowedTools: tools,
  };
}
