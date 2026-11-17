import { describe, expect, it } from 'vitest';
import {
  activeMatters,
  connectionRows,
  matterStatusLabel,
  monthlyUsage,
  overviewSteps,
  overviewSubtitle,
  pendingStep,
  stepsProgress,
} from './overview-model';

const debit = (date: string, amountCents: number, capability: string | null = 'SEARCH') => ({
  type: 'DEBIT',
  amountCents,
  date,
  capability,
});

describe('monthlyUsage', () => {
  const now = new Date('2026-11-17T12:00:00-03:00');

  it('soma só os débitos de operação do mês corrente e conta as operações', () => {
    const usage = monthlyUsage(
      [
        debit('2026-11-02T10:00:00-03:00', 20),
        debit('2026-11-16T10:00:00-03:00', 20),
        debit('2026-10-20T10:00:00-03:00', 20),
        debit('2026-11-10T10:00:00-03:00', 500, null),
        { type: 'CREDIT', amountCents: 10000, date: '2026-11-03T10:00:00-03:00', capability: null },
        { type: 'REFUND', amountCents: 20, date: '2026-11-04T10:00:00-03:00', capability: 'SEARCH' },
      ],
      now,
    );
    expect(usage).toEqual({ totalCents: 40, count: 2 });
  });

  it('sem lançamentos, zero', () => {
    expect(monthlyUsage([], now)).toEqual({ totalCents: 0, count: 0 });
  });
});

describe('overviewSteps', () => {
  const base = { connected: false, matterCount: 0, verified: false, casesEnabled: true };

  it('três passos na ordem do protótipo, cada um com o seu estado', () => {
    const steps = overviewSteps({ connected: true, matterCount: 2, verified: false, casesEnabled: true });
    expect(steps.map((step) => [step.id, step.done])).toEqual([
      ['connect', true],
      ['matter', true],
      ['verify', false],
    ]);
    expect(steps.map((step) => step.title)).toEqual([
      'Conectar sua IA',
      'Criar o primeiro caso',
      'Verificar uma citação',
    ]);
  });

  it('sem casos ligados o passo do caso some', () => {
    expect(overviewSteps({ ...base, casesEnabled: false }).map((step) => step.id)).toEqual(['connect', 'verify']);
  });

  it('dados ainda não carregados valem como não concluídos', () => {
    const steps = overviewSteps({ connected: undefined, matterCount: undefined, verified: false, casesEnabled: true });
    expect(steps.every((step) => !step.done)).toBe(true);
  });

  it('progresso e passo pendente', () => {
    const steps = overviewSteps({ connected: true, matterCount: 3, verified: false, casesEnabled: true });
    expect(stepsProgress(steps)).toEqual({ done: 2, total: 3 });
    expect(pendingStep(steps)?.id).toBe('verify');
    const all = overviewSteps({ connected: true, matterCount: 3, verified: true, casesEnabled: true });
    expect(stepsProgress(all)).toEqual({ done: 3, total: 3 });
    expect(pendingStep(all)).toBeUndefined();
  });

  it('cada passo pendente leva a uma tela', () => {
    const tabs = overviewSteps(base).map((step) => step.tab);
    expect(tabs).toEqual(['connections', 'matter', 'research']);
  });
});

describe('casos da Visão', () => {
  const matter = (id: string, status: 'OPEN' | 'CLOSED' | 'ARCHIVED', updatedAt: string) => ({
    id,
    title: `Caso ${id}`,
    status,
    updatedAt,
  });

  it('lista só os abertos, do mais recente ao mais antigo, até o limite', () => {
    const items = [
      matter('a', 'OPEN', '2026-11-01T00:00:00Z'),
      matter('b', 'ARCHIVED', '2026-11-16T00:00:00Z'),
      matter('c', 'OPEN', '2026-11-10T00:00:00Z'),
      matter('d', 'OPEN', '2026-11-12T00:00:00Z'),
      matter('e', 'OPEN', '2026-11-05T00:00:00Z'),
    ];
    expect(activeMatters(items).map((item) => item.id)).toEqual(['d', 'c', 'e']);
    expect(activeMatters(items, 2).map((item) => item.id)).toEqual(['d', 'c']);
  });

  it('rótulo do estado do caso', () => {
    expect(matterStatusLabel('OPEN')).toBe('aberto');
    expect(matterStatusLabel('CLOSED')).toBe('encerrado');
    expect(matterStatusLabel('ARCHIVED')).toBe('arquivado');
  });

  it('subtítulo da página conforme o número de casos abertos', () => {
    expect(overviewSubtitle({ casesEnabled: true, openCount: undefined })).toBe('Seu trabalho, num só lugar.');
    expect(overviewSubtitle({ casesEnabled: true, openCount: 0 })).toBe('Nenhum caso aberto ainda.');
    expect(overviewSubtitle({ casesEnabled: true, openCount: 1 })).toBe('1 caso aberto.');
    expect(overviewSubtitle({ casesEnabled: true, openCount: 3 })).toBe('3 casos abertos.');
    expect(overviewSubtitle({ casesEnabled: false, openCount: 3 })).toBe('Seu trabalho, num só lugar.');
  });
});

describe('connectionRows', () => {
  it('estado do MCP e das chaves, com o que se sabe', () => {
    expect(
      connectionRows({
        mcp: { authenticatedCredential: true, lastMcpUseAt: '2026-11-17T09:00:00Z' },
        activeKeys: 2,
      }),
    ).toEqual([
      { label: 'MCP remoto', state: 'ok', text: 'autenticado' },
      { label: 'Chaves de API', state: 'ok', text: '2 ativas' },
    ]);
  });

  it('sem conexão, sem chaves e sem resposta', () => {
    expect(connectionRows({ mcp: { authenticatedCredential: false, lastMcpUseAt: null }, activeKeys: 0 })).toEqual([
      { label: 'MCP remoto', state: 'off', text: 'não conectado' },
      { label: 'Chaves de API', state: 'off', text: 'nenhuma ativa' },
    ]);
    expect(connectionRows({ mcp: undefined, activeKeys: undefined })).toEqual([
      { label: 'MCP remoto', state: 'unknown', text: 'indisponível' },
      { label: 'Chaves de API', state: 'unknown', text: 'indisponível' },
    ]);
    expect(connectionRows({ mcp: undefined, activeKeys: 1 })[1]).toEqual({
      label: 'Chaves de API',
      state: 'ok',
      text: '1 ativa',
    });
  });
});
