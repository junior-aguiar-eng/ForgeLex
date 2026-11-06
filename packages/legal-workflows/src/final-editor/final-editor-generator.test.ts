import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { FakeAgentProvider, type AgentProvider } from '@forgelex/agent-core';
import { FinalEditorialContextSchema, FINAL_EDITOR_GENERATION_PROFILE } from '@forgelex/legal-agents';
import { FinalEditorGenerator } from './final-editor-generator.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const owner = { tenantId: 'tenant', userId: 'boni' };
const target = { draftId: 'draft', versionId: 'v1' };
afterEach(() => vi.useRealTimers());
function fixture() {
  const document = {
    title: 'Minuta',
    documentType: 'Manifestação',
    sections: [{ title: 'Pedido', content: 'O pedido esta condicionado. 😀', sourceIds: ['s'] }],
  };
  const envelope = {
    contractVersion: '1.0.0',
    contextId: 'ctx',
    contextRevision: 1,
    deliveryId: 'delivery:e',
    ...target,
    documentHash: hash(JSON.stringify(document)),
  };
  const context = FinalEditorialContextSchema.parse({
    ...envelope,
    document,
    sources: [{ id: 's', kind: 'NORM', text: 'Norma sintética.', contentHash: hash('Norma sintética.') }],
    claims: [],
    supportAudit: [],
    requirements: [{ id: 'r', statement: 'Conferir.', verified: false, sourceIds: ['s'] }],
    findings: [{ id: 'f', code: 'LIMITATION', severity: 'BLOCKING', statement: 'Suporte parcial.', sourceIds: ['s'] }],
  });
  const proposal = {
    ...envelope,
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    changes: [
      {
        id: 'edit',
        category: 'GRAMMAR',
        sectionIndex: 0,
        sectionHash: hash(document.sections[0].content),
        start: 9,
        end: 13,
        before: 'esta',
        after: 'está',
        reason: 'Acentuação.',
        sourceIds: ['s'],
      },
    ],
    substantiveSuggestions: [],
    limitations: ['Conferir suporte.'],
  };
  const load = vi.fn(async () => structuredClone(context));
  const factory = vi.fn(
    ({ registry }: any) =>
      new FakeAgentProvider(registry, undefined, [
        { thought: 'Simulação', toolCall: { name: 'editorial.submit', input: proposal } },
        { thought: 'Não executar depois de entrega aceita', providerError: 'unexpected' },
      ]),
  );
  const generator = new FinalEditorGenerator({ load }, { createProvider: factory });
  const generate = (signal?: AbortSignal) => generator.generate(owner, envelope.deliveryId, target, signal);
  return { context, proposal, load, factory, generator, generate };
}
it('gera via FakeAgentProvider, entrega única, hashes de seção e revalidação, sem mutar contexto', async () => {
  const f = fixture(),
    before = structuredClone(f.context);
  const result = await f.generate();
  expect(result).toEqual({ mode: 'SIMULATED', profileVersion: '1.1.0', proposal: f.proposal });
  expect(f.factory).toHaveBeenCalledTimes(1);
  expect(f.load).toHaveBeenCalledTimes(2);
  const input = f.factory.mock.calls[0][0];
  expect(input.registry.list().map((tool: any) => tool.name)).toEqual(['editorial.submit']);
  expect(input.sectionAnchors[0]).toEqual({
    sectionIndex: 0,
    sectionHash: f.proposal.changes[0].sectionHash,
    utf16Length: f.context.document.sections[0].content.length,
  });
  expect(input.profile).toMatchObject({ maxTurns: 1, maxOutputTokens: 2048, maxDurationMs: 300000 });
  expect(f.context).toEqual(before);
});
it('permanece desabilitado sem factory e rejeita provedor real antes de run', async () => {
  const f = fixture();
  await expect(new FinalEditorGenerator({ load: f.load }).generate(owner, 'delivery:e', target)).rejects.toThrow(
    'EDITORIAL_GENERATION_DISABLED',
  );
  expect(f.load).not.toHaveBeenCalled();
  for (const id of ['openai', 'anthropic'] as const) {
    const run = vi.fn();
    await expect(
      new FinalEditorGenerator({ load: f.load }, { createProvider: () => ({ id, run, cancel: vi.fn() }) }).generate(
        owner,
        'delivery:e',
        target,
      ),
    ).rejects.toThrow('EDITORIAL_PROVIDER_NOT_ALLOWED');
    expect(run).not.toHaveBeenCalled();
  }
});
it('recusa antes do provider quando acesso não é autorizado', async () => {
  const f = fixture();
  f.load.mockRejectedValue(new Error('ACCESS_REVOKED'));
  await expect(f.generate()).rejects.toThrow('ACCESS_REVOKED');
  expect(f.factory).not.toHaveBeenCalled();
});
it.each(['revision', 'support', 'access'])('revalida contexto após geração: %s', async (kind) => {
  const f = fixture();
  if (kind === 'access') f.load.mockResolvedValueOnce(f.context).mockRejectedValueOnce(new Error('ACCESS_REVOKED'));
  else {
    const changed = structuredClone(f.context);
    if (kind === 'revision') changed.contextRevision++;
    else changed.requirements[0].verified = true;
    f.load.mockResolvedValueOnce(f.context).mockResolvedValueOnce(changed);
  }
  await expect(f.generate()).rejects.toThrow(kind === 'access' ? 'ACCESS_REVOKED' : 'EDITORIAL_CONTEXT_CHANGED');
});
it.each(['source', 'anchor', 'approval', 'oversize'])('não repara nem retorna saída inválida: %s', async (kind) => {
  const f = fixture(),
    bad = structuredClone(f.proposal);
  if (kind === 'source') bad.changes[0].sourceIds = ['inventada'];
  if (kind === 'anchor') bad.changes[0].before = 'outro';
  if (kind === 'approval') bad.humanReviewRequired = false;
  if (kind === 'oversize') bad.changes[0].after = 'x'.repeat(2000);
  f.factory.mockImplementation(
    ({ registry }) =>
      new FakeAgentProvider(registry, undefined, [{ thought: '', toolCall: { name: 'editorial.submit', input: bad } }]),
  );
  await expect(f.generate()).rejects.toThrow('EDITORIAL_GENERATION_FAILED');
  expect(f.factory).toHaveBeenCalledTimes(1);
});
it('não aceita texto livre, evento de sucesso isolado ou ferramenta de pesquisa', async () => {
  for (const tool of [undefined, 'research.search_case_law']) {
    const f = fixture();
    f.factory.mockImplementation(
      ({ registry }) =>
        new FakeAgentProvider(registry, undefined, [
          { thought: JSON.stringify(f.proposal), ...(tool ? { toolCall: { name: tool, input: {} } } : {}) },
        ]),
    );
    await expect(f.generate()).rejects.toThrow('EDITORIAL_GENERATION_FAILED');
  }
});
it('isola mutação da cópia do contexto recebida pela factory', async () => {
  const f = fixture();
  const previous = f.factory.getMockImplementation()!;
  f.factory.mockImplementation((input) => {
    input.context.document.sections[0].content = 'alterado';
    return previous(input);
  });
  expect((await f.generate()).proposal).toEqual(f.proposal);
  expect(f.context.document.sections[0].content).toContain('esta');
});
it('nega prompt acima do limite sem truncar ou invocar factory', async () => {
  const f = fixture();
  const context = structuredClone(f.context);
  context.sources = Array.from({ length: 4 }, (_, i) => ({
    id: i ? `s${i}` : 's',
    kind: 'NORM' as const,
    text: 'x'.repeat(64000),
    contentHash: hash('x'.repeat(64000)),
  }));
  f.load.mockResolvedValue(context);
  await expect(f.generate()).rejects.toThrow('EDITORIAL_CONTEXT_LIMIT');
  expect(f.factory).not.toHaveBeenCalled();
});
it('cancelamento antes de iniciar não lê contexto nem invoca provider', async () => {
  const f = fixture();
  const control = new AbortController();
  control.abort();
  await expect(f.generate(control.signal)).rejects.toThrow('EDITORIAL_GENERATION_CANCELLED');
  expect(f.load).not.toHaveBeenCalled();
  expect(f.factory).not.toHaveBeenCalled();
});
it('timeout encerra provider que ignora signal; submissão tardia falha', async () => {
  vi.useFakeTimers();
  const f = fixture();
  let input: any;
  let registry: any;
  const cancel = vi.fn(async () => {});
  const provider: AgentProvider = {
    id: 'fake',
    cancel,
    async *run(value) {
      input = value;
      await new Promise(() => {});
      yield {} as never;
    },
  };
  const generator = new FinalEditorGenerator(
    { load: f.load },
    {
      createProvider: (value) => {
        registry = value.registry;
        return provider;
      },
    },
  );
  const result = generator.generate(owner, 'delivery:e', target);
  const assertion = expect(result).rejects.toThrow('EDITORIAL_GENERATION_TIMEOUT');
  await vi.advanceTimersByTimeAsync(300001);
  await assertion;
  expect(cancel).toHaveBeenCalledTimes(1);
  await expect(
    registry.executeTool('editorial.submit', f.proposal, {
      ...owner,
      sessionId: input.sessionId,
      abortSignal: new AbortController().signal,
    }),
  ).rejects.toThrow();
});
it('cancelamento interrompe provider pendente e oculta mensagens internas', async () => {
  const f = fixture(),
    control = new AbortController();
  const cancel = vi.fn(async () => {});
  const generator = new FinalEditorGenerator(
    { load: f.load },
    {
      createProvider: () => ({
        id: 'fake',
        cancel,
        async *run() {
          control.abort('secret');
          await new Promise(() => {});
          yield {} as never;
        },
      }),
    },
  );
  await expect(generator.generate(owner, 'delivery:e', target, control.signal)).rejects.toThrow(
    'EDITORIAL_GENERATION_CANCELLED',
  );
  expect(cancel).toHaveBeenCalledTimes(1);
});
it('limita eventos de provider sem entrega', async () => {
  const f = fixture();
  const generator = new FinalEditorGenerator(
    { load: f.load },
    {
      createProvider: () => ({
        id: 'fake',
        cancel: async () => {},
        async *run(input) {
          for (let i = 0; i < 17; i++)
            yield {
              type: 'thought:delta' as const,
              sessionId: input.sessionId,
              timestamp: new Date().toISOString(),
              delta: 'texto',
            };
        },
      }),
    },
  );
  await expect(generator.generate(owner, 'delivery:e', target)).rejects.toThrow('EDITORIAL_GENERATION_FAILED');
});
it.each(['valid', 'invalid'])(
  'submissão duplicada %s não pode ser escondida por um provider simulado',
  async (kind) => {
    const f = fixture();
    const generator = new FinalEditorGenerator(
      { load: f.load },
      {
        createProvider: ({ registry }) => ({
          id: 'fake',
          cancel: async () => {},
          async *run(input) {
            const toolContext = { ...owner, sessionId: input.sessionId, abortSignal: input.abortSignal };
            await registry.executeTool('editorial.submit', f.proposal, toolContext);
            await registry
              .executeTool(
                'editorial.submit',
                kind === 'invalid' ? { ...f.proposal, humanReviewRequired: false } : f.proposal,
                toolContext,
              )
              .catch(() => {});
            yield {
              type: 'lifecycle:completed',
              sessionId: input.sessionId,
              totalTurns: 1,
              totalDurationMs: 0,
              timestamp: new Date().toISOString(),
            };
          },
        }),
      },
    );
    await expect(generator.generate(owner, 'delivery:e', target)).rejects.toThrow('EDITORIAL_GENERATION_FAILED');
  },
);
it('inclui instruções no limite de entrada', async () => {
  const f = fixture(),
    context = structuredClone(f.context);
  context.sources = [
    { id: 's', kind: 'NORM', text: 'x'.repeat(64000), contentHash: hash('x'.repeat(64000)) },
    { id: 's2', kind: 'NORM', text: '', contentHash: hash('') },
  ];
  const sectionAnchors = [
    {
      sectionIndex: 0,
      sectionHash: f.proposal.changes[0].sectionHash,
      utf16Length: context.document.sections[0].content.length,
    },
  ];
  const base = Buffer.byteLength(JSON.stringify({ context, sectionAnchors }));
  const extra =
    FINAL_EDITOR_GENERATION_PROFILE.maxPromptBytes -
    base -
    Buffer.byteLength(FINAL_EDITOR_GENERATION_PROFILE.instructions) +
    1;
  expect(extra).toBeGreaterThan(0);
  expect(extra).toBeLessThan(64000);
  context.sources[1].text = 'x'.repeat(extra);
  context.sources[1].contentHash = hash(context.sources[1].text);
  f.load.mockResolvedValue(context);
  await expect(f.generate()).rejects.toThrow('EDITORIAL_CONTEXT_LIMIT');
  expect(f.factory).not.toHaveBeenCalled();
});
it('aceita exatamente 2048 bytes de proposta e rejeita um byte adicional sem truncar', async () => {
  for (const over of [0, 1]) {
    const f = fixture(),
      proposal = structuredClone(f.proposal);
    proposal.changes[0].reason += 'x'.repeat(2048 - Buffer.byteLength(JSON.stringify(proposal)) + over);
    expect(Buffer.byteLength(JSON.stringify(proposal))).toBe(2048 + over);
    f.factory.mockImplementation(
      ({ registry }) =>
        new FakeAgentProvider(registry, undefined, [
          { thought: '', toolCall: { name: 'editorial.submit', input: proposal } },
        ]),
    );
    if (over) await expect(f.generate()).rejects.toThrow('EDITORIAL_GENERATION_FAILED');
    else expect((await f.generate()).proposal).toEqual(proposal);
  }
});
