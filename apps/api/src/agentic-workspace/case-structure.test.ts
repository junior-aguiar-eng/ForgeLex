import { describe, expect, it } from 'vitest';
import { buildAttachmentHeader } from '@forgelex/domain';
import { MAX_CASE_ANALYSES, findCaseStructure, type CaseStructureExecution } from './case-structure.js';

const owner = { tenantId: 't1', userId: 'u1' };
const MATTER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

type Conv = { matterId: string; hidden?: boolean; text: string; execution: CaseStructureExecution };
const at = (n: number) => new Date(Date.UTC(2026, 10, 1, 0, 0, n)).toISOString();
const conv = (
  id: string,
  n: number,
  text = `texto ${id}`,
  extra: { matterId?: string; status?: string; hidden?: boolean } = {},
): Conv => ({
  matterId: extra.matterId ?? MATTER,
  ...(extra.hidden ? { hidden: true } : {}),
  text,
  execution: {
    id: `e-${id}`,
    conversationId: `c-${id}`,
    contextRevision: 1,
    status: extra.status ?? 'COMPLETED',
    createdAt: at(n),
    updatedAt: at(n),
    deliveryIds: [`d-${id}`],
  },
});

function deps(conversations: Conv[], actions: Record<string, string> = {}) {
  return {
    store: {
      workspace: {
        listMatterConversations: async (
          _o: unknown,
          matterId: string,
          page: { limit: number; offset: number; includeHidden?: boolean },
        ) =>
          [...conversations]
            .filter((c) => c.matterId === matterId && (page.includeHidden || !c.hidden))
            .sort((a, b) => b.execution.createdAt.localeCompare(a.execution.createdAt))
            .slice(page.offset, page.offset + page.limit),
        getConversationReadOnly: async (_o: unknown, id: string) => {
          const found = conversations.find((c) => c.execution.conversationId === id);
          return found ? { contexts: [{ revision: 1, text: found.text }] } : undefined;
        },
      },
    },
    native: {
      getDelivery: async (_o: unknown, id: string) => ({ delivery: { action: actions[id] ?? 'analyze_evidence' } }),
    },
  };
}
const ids = (entries: { deliveryId: string }[]) => entries.map((e) => e.deliveryId);

describe('findCaseStructure (E4)', () => {
  it('devolve todas as análises vivas do caso da mais antiga para a mais nova', async () => {
    const found = await findCaseStructure(deps([conv('b', 2), conv('a', 1), conv('c', 3)]), owner, MATTER);
    expect(ids(found)).toEqual(['d-a', 'd-b', 'd-c']);
    expect(found[0]).toMatchObject({ executionId: 'e-a', contextTextHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it('conversa escondida do histórico continua na soma', async () => {
    const found = await findCaseStructure(deps([conv('a', 1, 'um', { hidden: true }), conv('b', 2)]), owner, MATTER);
    expect(ids(found)).toEqual(['d-a', 'd-b']);
  });

  it('outro caso, trabalho não concluído e outra ação não entram', async () => {
    const found = await findCaseStructure(
      deps(
        [
          conv('a', 1),
          conv('b', 2, 'x', { matterId: OTHER }),
          conv('c', 3, 'y', { status: 'FAILED' }),
          conv('d', 4, 'z', { status: 'CANCELLED' }),
          conv('e', 5, 'w'),
        ],
        { 'd-e': 'review_text' },
      ),
      owner,
      MATTER,
    );
    expect(ids(found)).toEqual(['d-a']);
  });

  it('duas análises do mesmo texto: só a mais nova soma', async () => {
    const found = await findCaseStructure(
      deps([conv('old', 1, 'mesmo texto'), conv('other', 2, 'outro'), conv('new', 3, 'mesmo texto')]),
      owner,
      MATTER,
    );
    expect(ids(found)).toEqual(['d-other', 'd-new']);
  });

  it('trechos do mesmo PDF levam o código do documento', async () => {
    const part = (i: number) =>
      `${buildAttachmentHeader({
        name: 'p.pdf',
        ocr: false,
        part: { index: i, total: 2, pageFrom: i, pageTo: i, documentCode: 'a1b2c3d4e5f6' },
      })}\nPágina ${i}\nTexto.`;
    const found = await findCaseStructure(
      deps([conv('a', 1, part(1)), conv('b', 2, part(2)), conv('c', 3, 'relato')]),
      owner,
      MATTER,
    );
    expect(found.map((e) => e.documentKey)).toEqual(['a1b2c3d4e5f6', 'a1b2c3d4e5f6', undefined]);
  });

  it('mais que o teto: ficam as mais recentes, ainda em ordem de chegada', async () => {
    const many = Array.from({ length: MAX_CASE_ANALYSES + 5 }, (_, i) => conv(`n${i}`, i + 1, `texto ${i}`));
    const found = await findCaseStructure(deps(many), owner, MATTER);
    expect(found).toHaveLength(MAX_CASE_ANALYSES);
    expect(found[0]?.deliveryId).toBe('d-n5');
    expect(found.at(-1)?.deliveryId).toBe(`d-n${MAX_CASE_ANALYSES + 4}`);
  });

  it('sem análise nenhuma, lista vazia', async () => {
    expect(await findCaseStructure(deps([]), owner, MATTER)).toEqual([]);
  });

  it('respeita quem o chamador não gerencia', async () => {
    const found = await findCaseStructure(
      { ...deps([conv('a', 1), conv('b', 2)]), manages: (e) => e.id !== 'e-a' },
      owner,
      MATTER,
    );
    expect(ids(found)).toEqual(['d-b']);
  });
});
