const prefix = 'forgelex:pending-draft-save:';

export function pendingDraftSaveKey(workspaceId: string, userId: string, matterId: string) {
  return `${prefix}${JSON.stringify([workspaceId, userId, matterId])}`;
}

export function readPendingDraftSave(key: string): string | undefined {
  try {
    const value = window.sessionStorage.getItem(key);
    return value && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function storePendingDraftSave(key: string, commandId?: string) {
  try {
    if (commandId) window.sessionStorage.setItem(key, commandId);
    else window.sessionStorage.removeItem(key);
  } catch {
    // The editor still keeps the command in memory if storage is unavailable.
  }
}

export function clearPendingDraftSaves() {
  try {
    const storage = window.sessionStorage;
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) storage.removeItem(key);
    }
  } catch {
    // Some browser configurations block session storage.
  }
}
