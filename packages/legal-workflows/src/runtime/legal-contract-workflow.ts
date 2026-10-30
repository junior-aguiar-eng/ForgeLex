import { createHash } from 'node:crypto';
import {
  LEGAL_WORKFLOW_CONTRACTS,
  LEGAL_AGENT_CATALOG,
  validateLegalWorkHandoff,
  validateResearchHandoff,
  type LegalActionId,
  LEGAL_WORK_POLICY,
  LEGAL_WORK_INSTRUCTIONS,
  RESEARCH_AUTHORITY_INSTRUCTIONS,
  AUTHORITY_VERIFIER_INSTRUCTIONS,
} from '@forgelex/legal-agents';
import type { WorkflowCheckpointStore, WorkflowContext, WorkflowEvent } from '../contracts/workflow.js';
import { InMemoryWorkflowCheckpointStore, VersionedWorkflowRunner } from './workflow-runner.js';

interface ContractVersions {
  workflow: { id: string; version: string };
  policy: { id: string; version: string };
  playbook: { id: string; version: string };
  agents: { role: string; version: string; instructionId: string; instructionVersion: string }[];
  documentTemplate: null;
  deterministicScripts: { id: string; version: string }[];
}
export interface LegalContractHandlerSpec {
  contracts: ContractVersions;
  policy: typeof LEGAL_WORK_POLICY;
  instructions: readonly unknown[];
  playbook: { readonly id: string; readonly version: string; readonly steps: readonly string[] };
}
interface ContractRunState {
  contracts?: ContractVersions;
  inputDigest?: string;
  userId?: string;
  matterId?: string;
  output?: unknown;
}

/**
 * Coordenação dos contratos sobre o runner existente, com handler explícito.
 * Nenhum modelo, ferramenta ou capability pública é ativado por esta classe.
 */
export class LegalContractWorkflow {
  public constructor(
    private readonly action: LegalActionId,
    private readonly prepareCandidate: (
      input: unknown,
      context: WorkflowContext,
      specification: LegalContractHandlerSpec,
    ) => Promise<unknown>,
    private readonly store: WorkflowCheckpointStore = new InMemoryWorkflowCheckpointStore(),
  ) {}

  public async *execute(
    input: unknown,
    context: Omit<WorkflowContext, 'executionId'> & { executionId?: string; resumeExecutionId?: string },
  ): AsyncGenerator<WorkflowEvent> {
    if (context.resumeExecutionId) {
      const checkpoint = await this.store.getLatest(context.resumeExecutionId, context.tenantId);
      if (!checkpoint) throw new Error('Retomada exige checkpoint existente no tenant.');
      if (context.executionId && context.executionId !== context.resumeExecutionId) {
        throw new Error('Retomada não pode alterar a identidade da execução.');
      }
    }
    const definition = LEGAL_WORKFLOW_CONTRACTS.find((workflow) => workflow.action === this.action);
    if (!definition) throw new Error('Contrato de workflow não localizado.');
    const normalized = definition.inputSchema.parse(input);
    const inputDigest = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const contracts: ContractVersions = {
      workflow: { id: definition.id, version: definition.version },
      policy: { id: definition.policyId, version: definition.policyVersion },
      playbook: { id: definition.playbook.id, version: definition.playbook.version },
      agents: definition.roles.map((role) => {
        const agent = LEGAL_AGENT_CATALOG.find((item) => item.role === role);
        if (!agent) throw new Error('Papel requerido ausente do catálogo.');
        return {
          role,
          version: agent.version,
          instructionId: agent.instructionId,
          instructionVersion: agent.instructionVersion,
        };
      }),
      documentTemplate: definition.documentTemplate,
      deterministicScripts: [
        { id: 'validate-context', version: '1.0.0' },
        { id: 'validate-handoff', version: '1.0.0' },
      ],
    };
    const validate = (candidate: unknown) => {
      const parsed = definition.outputSchema.parse(candidate);
      return this.action === 'research_question'
        ? validateResearchHandoff(normalized, parsed)
        : validateLegalWorkHandoff(normalized, parsed);
    };
    const runner = new VersionedWorkflowRunner<
      unknown,
      ContractRunState,
      { output: unknown; contracts: ContractVersions }
    >({
      id: definition.id,
      version: definition.version,
      checkpointStore: this.store,
      restoreState: (raw) => {
        const state = raw as ContractRunState | undefined;
        if (
          !state ||
          state.inputDigest !== inputDigest ||
          state.userId !== context.userId ||
          state.matterId !== context.matterId ||
          JSON.stringify(state.contracts) !== JSON.stringify(contracts)
        ) {
          throw new Error('Não é possível retomar: contexto, usuário, caso ou versões dos contratos divergentes.');
        }
        return state;
      },
      steps: [
        {
          id: 'record_contracts',
          execute: async () => ({
            state: {
              contracts: structuredClone(contracts),
              inputDigest,
              userId: context.userId,
              matterId: context.matterId,
            },
            output: { contracts: structuredClone(contracts) },
          }),
        },
        {
          id: 'prepare_candidate',
          execute: async (_input, state, runContext) => {
            const availableInstructions = [
              RESEARCH_AUTHORITY_INSTRUCTIONS,
              AUTHORITY_VERIFIER_INSTRUCTIONS,
              ...LEGAL_WORK_INSTRUCTIONS,
            ];
            const instructions = contracts.agents.map((agent) => {
              const instruction = availableInstructions.find(
                (item) => item.id === agent.instructionId && item.version === agent.instructionVersion,
              );
              if (!instruction) throw new Error('Instrução versionada não localizada.');
              return instruction;
            });
            const candidate = await this.prepareCandidate(structuredClone(normalized), runContext, {
              contracts: structuredClone(contracts),
              policy: structuredClone(LEGAL_WORK_POLICY),
              instructions: structuredClone(instructions),
              playbook: structuredClone(definition.playbook),
            });
            const output = validate(candidate);
            return { state: { ...state, output }, output: { validated: true } };
          },
        },
      ],
      finalize: (state) => ({ output: validate(state.output), contracts: structuredClone(contracts) }),
    });
    yield* runner.execute(normalized, context, {});
  }
}
