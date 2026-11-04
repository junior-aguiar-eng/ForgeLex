import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { FinalEditorGenerator } from '@forgelex/legal-workflows';
import { FinalEditorialContextSchema } from '../../../../packages/legal-agents/src/index.js';
import { createFinalEditorOpenAIRuntime } from './final-editor-provider.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture(duplicate = false) {
  const owner = { tenantId: 'editorial', userId: 'boni' };
  const target = { draftId: 'draft', versionId: 'version' };
  const document = {
    title: 'Minuta',
    documentType: 'Manifestação',
    sections: [{ title: 'Pedido', content: 'Pedido condicionado.', sourceIds: ['s'] }],
  };
  const identity = {
    contractVersion: '1.0.0',
    contextId: 'context',
    contextRevision: 1,
    deliveryId: 'delivery',
    ...target,
    documentHash: hash(document),
  };
  const context = FinalEditorialContextSchema.parse({
    ...identity,
    document,
    sources: [
      {
        id: 's',
        kind: 'NORM',
        text: 'Norma sintética.',
        contentHash: createHash('sha256').update('Norma sintética.').digest('hex'),
      },
    ],
    claims: [],
    supportAudit: [],
    requirements: [],
    findings: [],
  });
  const proposal = {
    ...identity,
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    changes: [],
    substantiveSuggestions: [],
    limitations: ['Conferir suporte.'],
  };
  const load = vi.fn(async () => structuredClone(context));
  let dispatched = false;
  const finance = {
    authorizeCall: vi.fn(async () => {
      const shouldExecute = !dispatched;
      dispatched = true;
      return { shouldExecute };
    }),
    settleCall: vi.fn(async () => ({ status: 'SETTLED' })),
    markUncertain: vi.fn(async () => ({})),
    markNotDispatched: vi.fn(async () => ({})),
  };
  const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
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
      model: 'gpt-6.1-sol',
      service_tier: 'default',
      status: 'completed',
      output: duplicate
        ? [
            item,
            {
              ...item,
              id: 'fc_extra',
              call_id: 'call_extra',
              arguments: JSON.stringify({ ...proposal, humanReviewRequired: false }),
            },
          ]
        : [item],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
      parallel_tool_calls: false,
      tool_choice: 'auto',
      tools: body.tools,
    };
    return new Response(
      [
        { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response },
      ]
        .map(
          (frame, sequence_number) =>
            `event: ${frame.type}\ndata: ${JSON.stringify({ ...frame, sequence_number })}\n\n`,
        )
        .join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  const createRuntime = () =>
    createFinalEditorOpenAIRuntime({
      apiKey: 'synthetic-no-network',
      executionId: 'editorial-authorized-command',
      owner,
      context,
      editor: { load },
      finance: finance as any,
      transport,
    });
  const runtime = createRuntime();
  const generator = new FinalEditorGenerator({ load }, runtime);
  const generate = () => generator.generate(owner, 'delivery', target);
  return { owner, target, context, proposal, load, finance, transport, runtime, createRuntime, generate };
}

it('conecta SDK real com transporte simulado, reserva antes de enviar e entrega uma proposta', async () => {
  const f = fixture();
  const result = await f.generate();
  expect(result.mode).toBe('REAL');
  expect(result.proposal).toEqual(f.proposal);
  expect(f.transport).toHaveBeenCalledOnce();
  expect(f.finance.authorizeCall.mock.invocationCallOrder[0]).toBeLessThan(f.transport.mock.invocationCallOrder[0]);
  expect(f.finance.settleCall).toHaveBeenCalledOnce();
  const sent = JSON.parse(String(f.transport.mock.calls[0][1]?.body));
  expect(sent).toMatchObject({
    max_output_tokens: 2048,
    reasoning: { effort: 'low' },
    service_tier: 'default',
    store: false,
    parallel_tool_calls: false,
  });
  expect(sent.tools.map((tool: any) => tool.name)).toEqual(['forgelex_editorial_submit']);
  expect(f.load.mock.calls.length).toBeGreaterThanOrEqual(4);
});

it('recriar runtime não repete chamada reservada no mesmo comando financeiro', async () => {
  const f = fixture();
  await f.generate();
  const restarted = new FinalEditorGenerator({ load: f.load }, f.createRuntime());
  await expect(restarted.generate(f.owner, 'delivery', f.target)).rejects.toThrow();
  expect(f.transport).toHaveBeenCalledOnce();
  const calls = f.finance.authorizeCall.mock.calls as any[];
  expect(calls[0][2].callId).toBe(calls[1][2].callId);
});

it('não envia depois de revogação, mudança de contexto ou reserva recusada', async () => {
  for (const kind of ['access', 'context', 'budget']) {
    const f = fixture();
    if (kind === 'access') f.load.mockRejectedValue(new Error('ACCESS_REVOKED'));
    if (kind === 'context') f.context.document.sections[0].content = 'Outro texto.';
    if (kind === 'budget') f.finance.authorizeCall.mockRejectedValue(new Error('BUDGET_EXCEEDED'));
    await expect(f.generate()).rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled();
  }
});

it('marca custo incerto sem repetição quando o transporte perde a resposta', async () => {
  const f = fixture();
  f.transport.mockRejectedValue(new Error('lost response'));
  await expect(f.generate()).rejects.toThrow();
  expect(f.transport).toHaveBeenCalledOnce();
  expect(f.finance.markUncertain).toHaveBeenCalledOnce();
  expect(f.finance.settleCall).not.toHaveBeenCalled();
});

it('recusa segunda submissão inválida sem descartar o custo medido', async () => {
  const f = fixture(true);
  await expect(f.generate()).rejects.toThrow();
  expect(f.finance.settleCall).toHaveBeenCalledOnce();
  expect(f.finance.markUncertain).not.toHaveBeenCalled();
});
