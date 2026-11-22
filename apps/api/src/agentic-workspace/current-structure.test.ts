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
    store: { workspace: { listRecentConversations: async () => conversations } },
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
    expect(found).toEqual({ executionId: 'e2', deliveryId: 'd-e2', updatedAt: '2026-11-02T00:00:00.000Z' });
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
});
