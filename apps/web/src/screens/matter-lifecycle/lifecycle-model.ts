export type LifecycleState = 'ACTIVE' | 'ARCHIVED' | 'TRASHED' | 'PURGED';
export type LifecycleAction = 'archive' | 'trash' | 'restore' | 'purge';
export type LifecycleView = 'active' | 'archived' | 'trash';
export interface LifecycleRecord { id: string; title: string; lifecycleState?: LifecycleState; lifecycleRevision?: number; }
export function lifecycleActions(state: LifecycleState = 'ACTIVE'): LifecycleAction[] {
  return state === 'ACTIVE' ? ['archive', 'trash'] : state === 'ARCHIVED' ? ['restore', 'trash'] : state === 'TRASHED' ? ['restore', 'purge'] : [];
}
export function canManageLifecycle(status: string, userId: string | undefined, role: string | undefined, createdBy: string | undefined): boolean {
  return status === 'authenticated' && !!userId && (userId === createdBy || role === 'OWNER');
}
export const actionLabels: Record<LifecycleAction, string> = { archive: 'Arquivar', trash: 'Mover para a lixeira', restore: 'Restaurar', purge: 'Excluir definitivamente' };
export const viewLabels: Record<LifecycleView, string> = { active: 'Em uso', archived: 'Arquivados', trash: 'Lixeira' };
