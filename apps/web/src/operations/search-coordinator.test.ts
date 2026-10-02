import { describe, expect, it, vi } from 'vitest';
import { createSearchIntent, type SearchExecution } from './contracts';
import { SearchCoordinator } from './search-coordinator';

describe('SearchCoordinator', () => {
  it('bloqueia outra operação enquanto busca e atualização do histórico estão pendentes', async () => {
    let finish!: (execution: SearchExecution) => void;
    const run = vi.fn(() => new Promise<SearchExecution>((resolve) => { finish = resolve; }));
    const coordinator = new SearchCoordinator(run);
    const intent = createSearchIntent('vazamento', 'STJ', 20, 2023);
    const first = coordinator.search(intent);
    await expect(coordinator.search(createSearchIntent('vazamento', 'STJ'))).rejects.toThrow('Já existe uma pesquisa em andamento');
    expect(run).toHaveBeenCalledTimes(1);
    finish({ intent, results: [], resultCount: 0, billingMode: 'METERED', chargedCents: 20, remainingBalanceCents: 480, isReplay: false });
    await first;
    run.mockResolvedValueOnce({ intent, results: [], resultCount: 0, billingMode: 'METERED', chargedCents: 0, remainingBalanceCents: 480, isReplay: true });
    await coordinator.search(intent);
  });
});
