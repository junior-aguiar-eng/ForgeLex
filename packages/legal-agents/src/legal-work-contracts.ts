import type { LegalWorkflowDefinition } from './workflow-definition.js';
import { LEGAL_ACTION_REQUIREMENTS } from './playbooks.js';
import { z } from 'zod';
import { LegalWorkContextSchema, referenceId, legalWorkText as text } from './context-packet.js';
import { LEGAL_WORK_POLICY, LEGAL_WORK_INSTRUCTIONS } from './instructions/legal-work.js';
import { ResearchDeliverySchema } from './research-agent-contracts.js';
import { ResearchContextSchema } from './context-packet.js';
import { RESEARCH_AUTHORITY_WORKFLOW, RESEARCH_AUTHORITY_INSTRUCTIONS } from './instructions/research-authority.js';

const finding = z
  .strictObject({
    statement: text,
    classification: z.enum(['ALLEGATION', 'INFERENCE', 'CONFLICT', 'GAP']),
    sourceIds: z.array(referenceId).max(100),
  })
  .superRefine((value, ctx) => {
    if (value.classification !== 'GAP' && value.sourceIds.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Alegação, inferência ou conflito exige referência de origem.' });
    }
  });

const envelope = {
  contextId: referenceId,
  contextRevision: z.number().int().positive(),
  status: z.enum(['CANDIDATE', 'LIMITED']),
  humanReviewRequired: z.literal(true),
  limitations: z.array(text).max(20),
};

export const LegalWorkDeliverySchema = z
  .discriminatedUnion('action', [
    z.strictObject({ ...envelope, action: z.literal('analyze_documents'), findings: z.array(finding).min(1).max(100) }),
    z.strictObject({
      ...envelope,
      action: z.literal('create_document'),
      title: z.string().trim().min(3).max(200),
      sections: z
        .array(
          z.strictObject({
            title: z.string().trim().min(1).max(200),
            content: z.string().trim().min(1).max(20000),
            sourceIds: z.array(referenceId).max(100),
            supportStatus: z.enum(['LINKED', 'UNSUPPORTED']).default('LINKED'),
          }),
        )
        .min(1)
        .max(30),
    }),
    z.strictObject({
      ...envelope,
      action: z.literal('review_text'),
      targetSourceId: referenceId,
      findings: z.array(finding).min(1).max(100),
    }),
  ])
  .superRefine((delivery, ctx) => {
    if (delivery.action === 'create_document') {
      for (const section of delivery.sections) {
        if (section.sourceIds.length === 0 && section.supportStatus !== 'UNSUPPORTED') {
          ctx.addIssue({ code: 'custom', message: 'Seção sem origem exige marcador de falta de suporte.' });
        }
        if (
          section.supportStatus === 'UNSUPPORTED' &&
          (delivery.status !== 'LIMITED' || delivery.limitations.length === 0)
        ) {
          ctx.addIssue({ code: 'custom', message: 'Seção sem suporte exige entrega limitada com motivo.' });
        }
      }
    }
    if (delivery.status === 'LIMITED' && delivery.limitations.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Entrega limitada exige motivo explícito.' });
    }
  });
export type LegalWorkDelivery = z.infer<typeof LegalWorkDeliverySchema>;

/** Validação estrutural; executor deve validar snapshot, autorização e origem real. */
export function validateLegalWorkHandoff(context: unknown, output: unknown): LegalWorkDelivery {
  const input = LegalWorkContextSchema.parse(context);
  const delivery = LegalWorkDeliverySchema.parse(output);
  if (
    delivery.action !== input.action ||
    delivery.contextId !== input.contextId ||
    delivery.contextRevision !== input.contextRevision
  ) {
    throw new Error('Entrega não corresponde ao contexto e à revisão solicitada.');
  }
  const sources = new Set(input.sources.map((source) => source.id));
  const references =
    delivery.action === 'create_document'
      ? delivery.sections.flatMap((section) => section.sourceIds)
      : delivery.findings.flatMap((item) => item.sourceIds);
  if (delivery.action === 'review_text') references.push(delivery.targetSourceId);
  if (references.some((id) => !sources.has(id))) throw new Error('Entrega referencia fonte ausente do contexto.');
  return delivery;
}

/** Playbooks descrevem coordenação futura; não executam modelos ou serviços. */
export const LEGAL_WORKFLOW_CONTRACTS: readonly LegalWorkflowDefinition[] = [
  {
    action: 'research_question',
    id: RESEARCH_AUTHORITY_WORKFLOW.id,
    version: RESEARCH_AUTHORITY_WORKFLOW.version,
    instructionId: RESEARCH_AUTHORITY_INSTRUCTIONS.id,
    instructionVersion: RESEARCH_AUTHORITY_INSTRUCTIONS.version,
    inputSchema: ResearchContextSchema,
    outputSchema: ResearchDeliverySchema,
    policyId: LEGAL_WORK_POLICY.id,
    policyVersion: LEGAL_WORK_POLICY.version,
    roles: ['legal-researcher', 'authority-verifier'],
    dependencies: RESEARCH_AUTHORITY_WORKFLOW.steps.map((step) => step.toolName),
    requiredSources: ['corpus STJ e proveniência retornada'],
    completionCriteria: LEGAL_ACTION_REQUIREMENTS.research_question.deliveryCriteria,
    allowedTools: RESEARCH_AUTHORITY_WORKFLOW.steps.map((step) => step.toolName),
    playbook: {
      id: 'research_question-playbook',
      version: '1.0.0',
      steps: LEGAL_ACTION_REQUIREMENTS.research_question.steps,
    },
    documentTemplate: null,
    executionEnabled: false,
  },
  ...(['analyze_documents', 'create_document', 'review_text'] as const).map(
    (action, index): LegalWorkflowDefinition => ({
      action,
      id: `${action}-workflow`,
      version: '1.0.0',
      instructionId: LEGAL_WORK_INSTRUCTIONS[index].id,
      instructionVersion: LEGAL_WORK_INSTRUCTIONS[index].version,
      policyId: LEGAL_WORK_POLICY.id,
      policyVersion: LEGAL_WORK_POLICY.version,
      roles: [LEGAL_WORK_INSTRUCTIONS[index].role],
      dependencies: ['snapshot validado pelo servidor', 'revisão humana'],
      requiredSources: LEGAL_ACTION_REQUIREMENTS[action].contextRequirements,
      completionCriteria: LEGAL_ACTION_REQUIREMENTS[action].deliveryCriteria,
      playbook: {
        id: LEGAL_ACTION_REQUIREMENTS[action].playbookId,
        version: '1.0.0',
        steps: LEGAL_ACTION_REQUIREMENTS[action].steps,
      },
      documentTemplate: null,
      allowedTools: [] as readonly string[],
      inputSchema: LegalWorkContextSchema.refine((input) => input.action === action, 'Contexto de outra ação.'),
      outputSchema: LegalWorkDeliverySchema.refine((output) => output.action === action, 'Entrega de outra ação.'),
      executionEnabled: false,
    }),
  ),
] as const;
