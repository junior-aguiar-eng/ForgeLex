import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, statSync, appendFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabase, AccountRepository, NativeCaseTaskRepository } from '../packages/persistence/dist/index.js';
import { FinalEditorService, FinalEditorGenerator } from '../packages/legal-workflows/dist/index.js';
import { COMMERCIAL_POLICY } from '../packages/billing-ledger/dist/index.js';
import { createFinalEditorOpenAIRuntime } from '../apps/api/dist/agentic-workspace/final-editor-provider.js';
import { EvaluationBudget } from './forgelex-final-evaluation/budget.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';

export function parseEditorialArgs(args) {
  let commandPath,
    real = false,
    approved = false,
    prepare = false;
  for (const arg of args) {
    if (arg.startsWith('--command=') && !commandPath) commandPath = arg.slice(10);
    else if (arg === '--real' && !real) real = true;
    else if (arg === '--prepare' && !prepare) prepare = true;
    else if (arg === '--approve-editorial-usd=0.25' && !approved) approved = true;
    else throw new Error('EDITORIAL_ARGUMENT_INVALID');
  }
  if (!commandPath) throw new Error('EDITORIAL_COMMAND_REQUIRED');
  if (real !== approved || (prepare && real)) throw new Error('EDITORIAL_APPROVAL_REQUIRED');
  return { commandPath, real, approved, ...(prepare ? { prepare } : {}) };
}

function validateCommand(command, prepare = false) {
  const keys = ['commandId', 'databaseFile', 'owner', 'deliveryId', 'draftId', 'versionId', 'contextHash'];
  if (
    !command ||
    typeof command !== 'object' ||
    Object.keys(command).some((key) => !keys.includes(key)) ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(command.commandId) ||
    typeof command.databaseFile !== 'string' ||
    !isAbsolute(command.databaseFile) ||
    !command.owner ||
    Object.keys(command.owner).sort().join(',') !== 'tenantId,userId' ||
    [command.owner.tenantId, command.owner.userId, command.deliveryId, command.draftId, command.versionId].some(
      (value) => typeof value !== 'string' || !value.trim() || value.length > 200,
    ) ||
    (!prepare && !/^[a-f0-9]{64}$/.test(command.contextHash))
  )
    throw new Error('EDITORIAL_COMMAND_INVALID');
}

function syntheticResponse(context, init) {
  const {
    document: _d,
    sources: _s,
    claims: _c,
    requirements: _r,
    findings: _f,
    supportAudit: _a,
    ...identity
  } = context;
  const proposal = {
    ...identity,
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    changes: [],
    substantiveSuggestions: [],
    limitations: ['Simulação de transporte; conteúdo jurídico não avaliado.'],
  };
  const item = {
    id: 'fc_editorial',
    type: 'function_call',
    status: 'completed',
    call_id: 'call_editorial',
    name: 'forgelex_editorial_submit',
    arguments: JSON.stringify(proposal),
  };
  const response = {
    id: 'resp_editorial',
    object: 'response',
    created_at: 1793664000,
    model: COMMERCIAL_POLICY.model,
    service_tier: 'default',
    status: 'completed',
    output: [item],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    parallel_tool_calls: false,
    tool_choice: 'auto',
    tools: JSON.parse(String(init.body)).tools,
  };
  return new Response(
    [
      { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response },
    ]
      .map(
        (frame, sequence_number) => `event: ${frame.type}\ndata: ${JSON.stringify({ ...frame, sequence_number })}\n\n`,
      )
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

/** Local operator host. Uses a dedicated durable USD ledger, never a customer or pilot wallet.
 * editor/transport/directory are trusted host dependencies, not request data. */
export async function runEditorialCommand({
  command,
  editor,
  directory,
  real = false,
  approved = false,
  apiKey,
  transport,
}) {
  validateCommand(command);
  if (real && (!approved || !apiKey?.trim())) throw new Error('EDITORIAL_APPROVAL_AND_KEY_REQUIRED');
  if (!real && approved) throw new Error('EDITORIAL_APPROVAL_INVALID');
  const context = await editor.load(command.owner, command.deliveryId, command);
  if (digest(context) !== command.contextHash) throw new Error('EDITORIAL_CONTEXT_CHANGED');
  const mode = real ? 'REAL' : 'SIMULATED_TRANSPORT';
  const fingerprint = digest({ command, mode, policy: COMMERCIAL_POLICY, cap: 250000 });
  const budget = new EvaluationBudget({ directory, fingerprint, runIds: [command.commandId], cap: 250000 });
  const output = resolve(directory, 'proposal.json');
  try {
    const previous = budget.state.runs[command.commandId];
    if (previous) {
      if (previous.status !== 'completed' || budget.summary().unresolved || !existsSync(output))
        throw new Error('EDITORIAL_RECONCILIATION_REQUIRED');
      const saved = JSON.parse(readFileSync(output, 'utf8'));
      if (saved.sha256 !== digest(saved.receipt) || saved.receipt.fingerprint !== fingerprint)
        throw new Error('EDITORIAL_RECEIPT_INTEGRITY');
      return saved.receipt;
    }
    const assertOwner = (owner, id) => {
      if (
        owner.tenantId !== command.owner.tenantId ||
        owner.userId !== command.owner.userId ||
        id !== command.commandId
      )
        throw new Error('EDITORIAL_AUTHORIZATION_REQUIRED');
    };
    const finance = {
      async authorizeCall(owner, id, call) {
        assertOwner(owner, id);
        return { shouldExecute: budget.reserve(id, call.callId, call.upperBoundMicroUsd) };
      },
      async settleCall(owner, id, callId, usage) {
        assertOwner(owner, id);
        const cached = usage.cachedInputTokens ?? 0;
        const actual = Number(
          (BigInt(usage.inputTokens - cached) * BigInt(COMMERCIAL_POLICY.inputMicroUsdPerMillion) +
            BigInt(cached) * BigInt(COMMERCIAL_POLICY.cachedInputMicroUsdPerMillion) +
            BigInt(usage.outputTokens) * BigInt(COMMERCIAL_POLICY.outputMicroUsdPerMillion) +
            999999n) /
            1000000n,
        );
        budget.settle(id, callId, actual, usage);
        return { status: 'SETTLED' };
      },
      async markUncertain(owner, id, callId) {
        assertOwner(owner, id);
        budget.uncertain(id, callId);
      },
      async markNotDispatched(owner, id, callId) {
        assertOwner(owner, id);
        budget.void(id, callId);
      },
    };
    budget.begin(command.commandId);
    try {
      const runtime = createFinalEditorOpenAIRuntime({
        apiKey: real ? apiKey : 'synthetic-no-network',
        executionId: command.commandId,
        owner: command.owner,
        context,
        editor,
        finance,
        recordCall: async (event) => {
          appendFileSync(resolve(directory, 'call-trace.jsonl'), JSON.stringify(event) + '\n', { flush: true });
        },
        transport: transport ?? (real ? globalThis.fetch : async (_url, init) => syntheticResponse(context, init)),
      });
      const result = await new FinalEditorGenerator(editor, runtime).generate(
        command.owner,
        command.deliveryId,
        command,
      );
      const receipt = {
        mode,
        fingerprint,
        commandId: command.commandId,
        contextHash: command.contextHash,
        model: COMMERCIAL_POLICY.model,
        capUsd: 0.25,
        paidModelCalls: real ? budget.summary().calls : 0,
        budget: budget.summary(),
        profileVersion: result.profileVersion,
        proposal: result.proposal,
      };
      writeFileSync(output, json({ receipt, sha256: digest(receipt) }), { flag: 'wx' });
      // Importable by the existing mesa, separate from the auditable receipt.
      writeFileSync(resolve(directory, 'proposal-import.json'), json(result.proposal), { flag: 'wx' });
      budget.finish(command.commandId, 'completed');
      return receipt;
    } catch (error) {
      if (budget.state.runs[command.commandId]?.status === 'active') budget.finish(command.commandId, 'failed');
      throw error;
    }
  } finally {
    budget.close();
  }
}

async function main() {
  const flags = parseEditorialArgs(process.argv.slice(2));
  const command = JSON.parse(readFileSync(resolve(flags.commandPath), 'utf8'));
  validateCommand(command, flags.prepare);
  if (!statSync(command.databaseFile).isFile()) throw new Error('EDITORIAL_LOCAL_DATABASE_REQUIRED');
  const connection = await createDatabase({ url: pathToFileURL(command.databaseFile).toString() });
  try {
    // The host does not create accounts or migrate an operational database.
    const native = new NativeCaseTaskRepository(connection.db, async (owner, _matterId, db) => {
      if (owner.tenantId !== command.owner.tenantId || owner.userId !== command.owner.userId)
        throw new Error('ACCESS_REVOKED');
      const account = await new AccountRepository(db).findByUserAndTenant(owner.userId, owner.tenantId);
      if (
        !account ||
        account.user.status !== 'ACTIVE' ||
        account.tenant.status !== 'ACTIVE' ||
        account.membership.status !== 'ACTIVE'
      )
        throw new Error('ACCESS_REVOKED');
    });
    const editor = new FinalEditorService(native);
    if (flags.prepare) {
      const context = await editor.load(command.owner, command.deliveryId, command);
      const path = resolve(flags.commandPath + '.prepared.json');
      writeFileSync(path, json({ ...command, contextHash: digest(context) }), { flag: 'wx' });
      console.log(json({ preparedCommand: path, paidModelCalls: 0 }));
      return;
    }
    const directory = resolve(root, '.superpowers/sdd/editorial-generation', command.commandId);
    const result = await runEditorialCommand({
      command,
      editor,
      directory,
      ...flags,
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log(json({ directory, mode: result.mode, paidModelCalls: result.paidModelCalls, budget: result.budget }));
  } finally {
    connection.client.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message?.match(/^[A-Z_]+/)?.[0] ?? 'EDITORIAL_HOST_FAILED');
    process.exitCode = 1;
  });
}
