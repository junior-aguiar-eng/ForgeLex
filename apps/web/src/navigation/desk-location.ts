import type { DeskSelection } from '../agentic-workspace/desk-selection';

const deskPath = '/app/trabalho';
const draftPaths = ['/app/rascunhos', '/rascunhos'];
const selectionKeys = ['executionId', 'conversationId', 'matterId', 'draftId', 'versionId', 'deliveryId'] as const;

export function readDeskLocation(href: string): DeskSelection {
  const { pathname, searchParams } = new URL(href, 'https://forgelex.invalid');
  const selection: DeskSelection = {};
  for (const key of selectionKeys) {
    const value = searchParams.get(key);
    if (value) selection[key] = value;
  }
  selection.executionId ??= searchParams.get('returnExecution') || undefined;
  const revision = searchParams.get('contextRevision');
  if (selection.conversationId && revision && /^\d+$/.test(revision) && Number.isSafeInteger(Number(revision))) {
    selection.contextRevision = Number(revision);
  }
  if (searchParams.get('piece') === '1' || draftPaths.includes(pathname.replace(/\/+$/, ''))) selection.piece = true;
  return selection;
}

export function deskLocation(selection: DeskSelection): string {
  const query = new URLSearchParams();
  for (const key of selectionKeys) {
    const value = selection[key];
    if (value) query.set(key, value);
  }
  if (selection.conversationId && selection.contextRevision !== undefined)
    query.set('contextRevision', String(selection.contextRevision));
  if (selection.piece && !selection.matterId && !selection.draftId && !selection.deliveryId) query.set('piece', '1');
  // `URLSearchParams.size` não existe em Safari/iOS < 17 nem Chrome < 113.
  const serialized = query.toString();
  return serialized ? `${deskPath}?${serialized}` : deskPath;
}

export function writeDeskLocation(selection: DeskSelection, mode: 'push' | 'replace' = 'replace'): void {
  const destination = deskLocation(selection);
  if (destination === window.location.pathname + window.location.search) return;
  const state = window.history.state;
  const forgelexIndex = Number(state?.forgelexIndex ?? 0) + (mode === 'push' ? 1 : 0);
  window.history[mode === 'push' ? 'pushState' : 'replaceState']({ ...state, forgelexIndex }, '', destination);
  window.dispatchEvent(new Event('forgelex:route-updated'));
}
