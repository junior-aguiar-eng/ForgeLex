import type { AccountClosureAccepted } from './api-client';

const ACTIVE_KEY = 'forgelex_account_closure_active';
const COMPLETED_KEY = 'forgelex_account_closure_completed';
const PROBE_KEY = 'forgelex_account_closure_storage_probe';

export type ClosureReceipt = Pick<
  AccountClosureAccepted,
  'closureId' | 'statusToken' | 'requestedAt' | 'policyVersion'
>;
export type CompletedClosureReceipt = Omit<ClosureReceipt, 'statusToken'> & { completedAt: string };

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function ensureClosureReceiptStorage(): void {
  const target = storage();
  if (!target) throw new Error('O armazenamento da aba está indisponível. Não é possível guardar o recibo.');
  try {
    target.setItem(PROBE_KEY, 'available');
    if (target.getItem(PROBE_KEY) !== 'available') throw new Error('storage unavailable');
    target.removeItem(PROBE_KEY);
    if (target.getItem(PROBE_KEY) !== null) throw new Error('storage unavailable');
  } catch {
    throw new Error('O armazenamento da aba está indisponível. Não é possível guardar o recibo.');
  }
}

export function saveClosureReceipt(receipt: ClosureReceipt): void {
  const target = storage();
  if (!target) throw new Error('O armazenamento da aba está indisponível. Não é possível guardar o recibo.');
  target.setItem(ACTIVE_KEY, JSON.stringify(receipt));
  target.removeItem(COMPLETED_KEY);
}

export function readActiveClosureReceipt(): ClosureReceipt | null {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(ACTIVE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const receipt = value as Partial<ClosureReceipt>;
    if (
      typeof receipt.closureId !== 'string' ||
      typeof receipt.statusToken !== 'string' ||
      typeof receipt.requestedAt !== 'string' ||
      receipt.policyVersion !== '2026-09-22.v1'
    )
      return null;
    return receipt as ClosureReceipt;
  } catch {
    return null;
  }
}

export function readCompletedClosureReceipt(): CompletedClosureReceipt | null {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(COMPLETED_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const receipt = value as Partial<CompletedClosureReceipt>;
    if (
      typeof receipt.closureId !== 'string' ||
      typeof receipt.requestedAt !== 'string' ||
      typeof receipt.completedAt !== 'string' ||
      receipt.policyVersion !== '2026-09-22.v1'
    )
      return null;
    return {
      closureId: receipt.closureId,
      requestedAt: receipt.requestedAt,
      completedAt: receipt.completedAt,
      policyVersion: receipt.policyVersion,
    };
  } catch {
    return null;
  }
}

export function completeClosureReceipt(completedAt: string): CompletedClosureReceipt {
  const active = readActiveClosureReceipt();
  if (!active) throw new Error('Recibo de acompanhamento ausente.');
  const completed = {
    closureId: active.closureId,
    requestedAt: active.requestedAt,
    policyVersion: active.policyVersion,
    completedAt,
  };
  const target = storage();
  if (!target) throw new Error('O armazenamento da aba está indisponível.');
  target.removeItem(ACTIVE_KEY);
  if (target.getItem(ACTIVE_KEY) !== null) throw new Error('Não foi possível apagar o token local.');
  try {
    target.setItem(COMPLETED_KEY, JSON.stringify(completed));
  } catch {
    // O token já foi apagado; o recibo não secreto segue disponível em memória.
  }
  return completed;
}
