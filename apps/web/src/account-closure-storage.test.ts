import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  completeClosureReceipt,
  ensureClosureReceiptStorage,
  readActiveClosureReceipt,
  readCompletedClosureReceipt,
  saveClosureReceipt,
} from './account-closure-storage';

describe('recibo de encerramento', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mantém o segredo só na sessão e o remove após conclusão', () => {
    const session = new Map<string, string>();
    const localSet = vi.fn();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => session.set(key, value),
        removeItem: (key: string) => session.delete(key),
      },
      localStorage: { setItem: localSet },
    });
    const receipt = {
      closureId: 'closure-1',
      statusToken: 'flx_close_secret',
      requestedAt: '2026-09-22T00:00:00Z',
      policyVersion: '2026-09-22.v1' as const,
    };
    saveClosureReceipt(receipt);
    ensureClosureReceiptStorage();
    expect(readActiveClosureReceipt()).toEqual(receipt);
    expect(localSet).not.toHaveBeenCalled();
    completeClosureReceipt('2026-09-22T01:00:00Z');
    expect(readActiveClosureReceipt()).toBeNull();
    expect(JSON.stringify(readCompletedClosureReceipt())).not.toContain(receipt.statusToken);
    expect([...session.values()].join('')).not.toContain(receipt.statusToken);
  });

  it('impede a solicitação se o armazenamento da aba não puder apagar o token', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        setItem: vi.fn(),
        getItem: () => 'available',
        removeItem: () => {
          throw new Error('storage blocked');
        },
      },
    });
    expect(() => ensureClosureReceiptStorage()).toThrow('O armazenamento da aba está indisponível');
  });

  it('apaga o token antes de gravar o recibo final, mesmo se a gravação falhar', () => {
    const session = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (key.endsWith('_completed')) throw new Error('quota');
          session.set(key, value);
        },
        removeItem: (key: string) => session.delete(key),
      },
    });
    saveClosureReceipt({
      closureId: 'closure-1',
      statusToken: 'flx_close_secret',
      requestedAt: '2026-09-22T00:00:00Z',
      policyVersion: '2026-09-22.v1',
    });
    expect(completeClosureReceipt('2026-09-22T01:00:00Z')).toMatchObject({ closureId: 'closure-1' });
    expect([...session.values()].join('')).not.toContain('flx_close_secret');
  });
});
