import { describe, expect, it } from 'vitest';
import { findCurrentStructure, type CurrentStructureExecution } from './current-structure.js';

const owner = { tenantId: 't1', userId: 'u1' };
const MATTER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

type Conv = { matterId: string; execution: CurrentStructureExecution };
const conv = (id: string, matterId: string, status: string, updatedAt: string, deliveryId = `d-${id}`): Conv => ({
  matterId,
  execution: { id, status, updatedAt, deliveryIds: [deliveryId] },
});

function deps(
  conversations: Conv[],
  actions: Record<string, string> = {},
  manages?: (e: CurrentStructureExecution) => boolean,
) {
  return {
    store: {
      workspace: {
        // Same contract as the repository: only this case, newest first, one page at a time.
        listMatterConversations: async (_o: unknown, matterId: string, page: { limit: number; offset: number }) =>
          conversations.filter((c) => c.matterId === matterId).slice(page.offset, page.offset + page.limit),
      },
    },
    native: {
      getDelivery: async (_o: unknown, id: string) => ({ delivery: { action: actions[id] ?? 'analyze_evidence' } }),
    },
    manages,
  };
}

describe('findCurrentStructure', () => {
  it('devolve a análise mais recente quando há duas (lista vem da mais nova para a mais antiga)', async () => {
    const found = await findCurrentStructure(
      deps([
        conv('e2', MATTER, 'COMPLETED', '2026-11-02T00:00:00.000Z'),
        conv('e1', MATTER, 'COMPLETED', '2026-11-01T00:00:00.000Z'),
      ]),
      owner,
      MATTER,
    );
    expect(found).toEqual({
      executionId: 'e2',
      deliveryId: 'd-e2',
      updatedAt: '2026-11-02T00:00:00.000Z',
      previousDeliveryId: 'd-e1',
    });
  });

  it('devolve null quando só há execução cancelada', async () => {
    const found = await findCurrentStructure(
      deps([conv('e1', MATTER, 'CANCELLED', '2026-11-01T00:00:00.000Z')]),
      owner,
      MATTER,
    );
    expect(found).toBeNull();
  });

  it('ignora a análise de outro caso e entregas que não são análise de provas', async () => {
    const found = await findCurrentStructure(
      deps(
        [
          conv('e3', OTHER, 'COMPLETED', '2026-11-03T00:00:00.000Z'),
          conv('e2', MATTER, 'COMPLETED', '2026-11-02T00:00:00.000Z'),
          conv('e1', MATTER, 'COMPLETED', '2026-11-01T00:00:00.000Z'),
        ],
        { 'd-e2': 'draft_piece' },
      ),
      owner,
      MATTER,
    );
    expect(found?.executionId).toBe('e1');
  });

  it('pula a execução que o usuário não administra', async () => {
    const found = await findCurrentStructure(
      deps(
        [
          conv('e2', MATTER, 'COMPLETED', '2026-11-02T00:00:00.000Z'),
          conv('e1', MATTER, 'COMPLETED', '2026-11-01T00:00:00.000Z'),
        ],
        {},
        (e) => e.id !== 'e2',
      ),
      owner,
      MATTER,
    );
    expect(found?.executionId).toBe('e1');
  });

  it('acha a análise mesmo com mais de 50 conversas recentes de outros casos', async () => {
    const others = Array.from({ length: 80 }, (_, i) =>
      conv(`o${i}`, OTHER, 'COMPLETED', `2026-11-10T00:00:${String(i % 60).padStart(2, '0')}.000Z`),
    );
    const found = await findCurrentStructure(
      deps([...others, conv('e1', MATTER, 'COMPLETED', '2026-11-01T00:00:00.000Z')]),
      owner,
      MATTER,
    );
    expect(found).toEqual({ executionId: 'e1', deliveryId: 'd-e1', updatedAt: '2026-11-01T00:00:00.000Z' });
  });

  it('acha a análise depois de muitas conversas de ajuste do mesmo caso, sem perder a anterior', async () => {
    const adjusts = Array.from({ length: 130 }, (_, i) =>
      conv(
        `a${i}`,
        MATTER,
        'COMPLETED',
        `2026-11-05T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
      ),
    ).reverse();
    const actions = Object.fromEntries(adjusts.map((c) => [`d-${c.execution.id}`, 'adjust_structure']));
    const found = await findCurrentStructure(
      deps(
        [
          ...adjusts,
          conv('e2', MATTER, 'COMPLETED', '2026-11-02T00:00:00.000Z'),
          ...adjusts.map((c) => ({ ...c, execution: { ...c.execution, id: `b${c.execution.id}` } })),
          conv('e1', MATTER, 'COMPLETED', '2026-11-01T00:00:00.000Z'),
        ],
        actions,
      ),
      owner,
      MATTER,
    );
    expect(found?.executionId).toBe('e2');
    expect(found?.previousDeliveryId).toBe('d-e1');
  });
});
