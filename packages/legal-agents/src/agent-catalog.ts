import { AUTHORITY_VERIFIER_INSTRUCTIONS } from './instructions/authority-verifier.js';
import { LEGAL_ACTION_REQUIREMENTS } from './playbooks.js';
import type { LegalAgentDefinition } from './agent-definition.js';
import { ResearchContextSchema, AuthorityVerificationContextSchema } from './context-packet.js';
import { ResearchDeliverySchema } from './research-agent-contracts.js';
import { LEGAL_WORKFLOW_CONTRACTS } from './legal-work-contracts.js';
import { LEGAL_WORK_INSTRUCTIONS } from './instructions/legal-work.js';
import { RESEARCH_AUTHORITY_WORKFLOW, RESEARCH_AUTHORITY_INSTRUCTIONS } from './instructions/research-authority.js';
export const LEGAL_AGENT_CATALOG: readonly LegalAgentDefinition[] = [
  {
    id: 'stj-authority-researcher',
    version: '1.0.0',
    role: 'legal-researcher',
    objective: 'Pesquisar candidatos no STJ e entregar autoridades com proveniência e limitações para revisão humana.',
    scope: 'STJ',
    instructionId: RESEARCH_AUTHORITY_INSTRUCTIONS.id,
    instructionVersion: RESEARCH_AUTHORITY_INSTRUCTIONS.version,
    workflowId: RESEARCH_AUTHORITY_WORKFLOW.id,
    workflowVersion: RESEARCH_AUTHORITY_WORKFLOW.version,
    allowedTools: RESEARCH_AUTHORITY_WORKFLOW.steps.map((step) => step.toolName),
    inputSchema: ResearchContextSchema,
    outputSchema: ResearchDeliverySchema,
    forbiddenBehaviors: ['inventar autoridades', 'presumir vigência ou adequação jurídica', 'publicar sem revisão'],
    handoff: ['contexto válido', 'autoridades e status preservados', 'limitações explícitas', 'revisão humana'],
    escalation: [
      'fonte indisponível',
      'autoridade ausente ou divergente',
      'questão fora do STJ',
      'contexto insuficiente',
    ],
    qualityChecks: [
      'preservar status da fonte',
      'não inventar fatos ou autoridades',
      'não equiparar verificação a adequação jurídica',
      'exigir revisão humana',
    ],
    executionEnabled: false,
  },
  {
    id: 'authority-verifier',
    version: '1.0.0',
    role: 'authority-verifier',
    objective: AUTHORITY_VERIFIER_INSTRUCTIONS.objective,
    scope: 'STJ',
    instructionId: AUTHORITY_VERIFIER_INSTRUCTIONS.id,
    instructionVersion: AUTHORITY_VERIFIER_INSTRUCTIONS.version,
    workflowId: RESEARCH_AUTHORITY_WORKFLOW.id,
    workflowVersion: RESEARCH_AUTHORITY_WORKFLOW.version,
    allowedTools: ['research.get_authority', 'research.verify_authority'],
    inputSchema: AuthorityVerificationContextSchema,
    outputSchema: ResearchDeliverySchema,
    forbiddenBehaviors: AUTHORITY_VERIFIER_INSTRUCTIONS.forbiddenBehaviors,
    handoff: ['autoridade identificada', 'status e proveniência preservados', 'limites explícitos'],
    escalation: ['autoridade não localizada', 'metadados divergentes', 'fonte indisponível'],
    qualityChecks: ['não presumir suporte jurídico', 'não presumir tratamento posterior', 'exigir revisão humana'],
    executionEnabled: false,
  },
  ...LEGAL_WORK_INSTRUCTIONS.map((instruction) => {
    const workflow = LEGAL_WORKFLOW_CONTRACTS.find((item) => item.instructionId === instruction.id)!;
    return {
      id: instruction.role,
      version: '1.0.0',
      role: instruction.role,
      objective: instruction.objective,
      scope: 'SUPPLIED_CONTEXT' as const,
      instructionId: instruction.id,
      instructionVersion: instruction.version,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      allowedTools: [],
      inputSchema: workflow.inputSchema,
      outputSchema: workflow.outputSchema,
      forbiddenBehaviors: instruction.forbiddenBehaviors,
      handoff: [
        'ação, contexto e revisão correspondentes',
        'referências disponíveis',
        'entrega candidata sem aprovação',
      ],
      escalation: ['fonte ausente', 'contexto insuficiente ou conflitante', 'avaliação jurídica necessária'],
      qualityChecks: ['preservar origem e revisão do contexto', 'não confirmar fatos', 'exigir revisão humana'],
      executionEnabled: false as const,
    };
  }),
];

export type LegalActionId = 'analyze_documents' | 'research_question' | 'create_document' | 'review_text';
export interface LegalActionDefinition {
  readonly id: LegalActionId;
  readonly label: string;
  readonly objective: string;
  readonly contextRequirements: readonly string[];
  readonly playbookId: string;
  readonly playbookVersion: string;
  readonly workflowIds: readonly string[];
  readonly dialogue: readonly {
    readonly id: string;
    readonly prompt: string;
    readonly options: readonly string[];
    readonly allowFreeText: true;
  }[];
  readonly deliveryCriteria: readonly string[];
  readonly contractStatus: 'PLANNED' | 'DEFINED';
  readonly agentIds: readonly string[];
  readonly executionEnabled: false;
}

/** Catálogo interno de planejamento, sem publicação automática no frontend/MCP. */
export const LEGAL_ACTION_CATALOG: readonly LegalActionDefinition[] = [
  {
    id: 'analyze_documents',
    ...LEGAL_ACTION_REQUIREMENTS.analyze_documents,
    playbookVersion: '1.0.0',
    workflowIds: LEGAL_WORKFLOW_CONTRACTS.filter((workflow) => workflow.action === 'analyze_documents').map(
      (workflow) => workflow.id,
    ),
    label: 'Analisar documentos',
    contractStatus: 'DEFINED',
    agentIds: ['matter-analyst'],
    executionEnabled: false,
  },
  {
    id: 'research_question',
    ...LEGAL_ACTION_REQUIREMENTS.research_question,
    playbookVersion: '1.0.0',
    workflowIds: LEGAL_WORKFLOW_CONTRACTS.filter((workflow) => workflow.action === 'research_question').map(
      (workflow) => workflow.id,
    ),
    label: 'Pesquisar uma questão',
    contractStatus: 'DEFINED',
    agentIds: ['stj-authority-researcher'],
    executionEnabled: false,
  },
  {
    id: 'create_document',
    ...LEGAL_ACTION_REQUIREMENTS.create_document,
    playbookVersion: '1.0.0',
    workflowIds: LEGAL_WORKFLOW_CONTRACTS.filter((workflow) => workflow.action === 'create_document').map(
      (workflow) => workflow.id,
    ),
    label: 'Criar uma peça',
    contractStatus: 'DEFINED',
    agentIds: ['legal-drafter'],
    executionEnabled: false,
  },
  {
    id: 'review_text',
    ...LEGAL_ACTION_REQUIREMENTS.review_text,
    playbookVersion: '1.0.0',
    workflowIds: LEGAL_WORKFLOW_CONTRACTS.filter((workflow) => workflow.action === 'review_text').map(
      (workflow) => workflow.id,
    ),
    label: 'Revisar um texto',
    contractStatus: 'DEFINED',
    agentIds: ['adversarial-reviewer'],
    executionEnabled: false,
  },
];
