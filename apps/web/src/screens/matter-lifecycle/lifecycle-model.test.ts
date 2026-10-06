import { expect, it } from 'vitest';
import { lifecycleActions, canManageLifecycle } from './lifecycle-model';
it('offers definitive deletion only in trash and restricts management to creator or owner', () => {
  expect(lifecycleActions('ACTIVE')).toEqual(['archive', 'trash']);
  expect(lifecycleActions('ARCHIVED')).toEqual(['restore', 'trash']);
  expect(lifecycleActions('TRASHED')).toEqual(['restore', 'purge']);
  expect(lifecycleActions('PURGED')).toEqual([]);
  expect(canManageLifecycle('authenticated', 'author', 'MEMBER', 'author')).toBe(true);
  expect(canManageLifecycle('authenticated', 'member', 'MEMBER', 'author')).toBe(false);
  expect(canManageLifecycle('authenticated', 'owner', 'OWNER', 'author')).toBe(true);
  expect(canManageLifecycle('legacy', 'author', 'OWNER', 'author')).toBe(false);
});
