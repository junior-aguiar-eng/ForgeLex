/**
 * "Primeiros passos" da Visão (V2): o cartão pode ser ocultado e o estado vale por usuário, no navegador. Sem
 * armazenamento (bloqueado, janela privada, ausente) o cartão simplesmente aparece, e nada quebra.
 */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const firstStepsKey = (userId: string) => `forgelex.primeiros-passos.${userId}`;

export function readFirstStepsHidden(storage: KeyValueStorage | undefined, userId: string): boolean {
  if (!storage || !userId) return false;
  try {
    return storage.getItem(firstStepsKey(userId)) === 'oculto';
  } catch {
    return false;
  }
}

export function writeFirstStepsHidden(storage: KeyValueStorage | undefined, userId: string, hidden: boolean): void {
  if (!storage || !userId) return;
  try {
    if (hidden) storage.setItem(firstStepsKey(userId), 'oculto');
    else storage.removeItem(firstStepsKey(userId));
  } catch {
    // sem armazenamento: o cartão só não lembra
  }
}

/** `localStorage` do navegador, ou nada quando o acesso a ele já lança erro (dados de site bloqueados). */
export function browserStorage(): KeyValueStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
