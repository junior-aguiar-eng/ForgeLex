import { expect, it } from 'vitest';
import { createMatterLifecycleRuntime } from './matter-lifecycle-runtime.js';
it('fails closed when the durable journal is required but its configuration was lost', () => {
  expect(() => createMatterLifecycleRuntime(undefined, { FORGELEX_MATTER_PURGE_JOURNAL_REQUIRED: 'true' })).toThrow('MATTER_PURGE_JOURNAL_CONFIG_INVALID');
  expect(createMatterLifecycleRuntime(undefined, { NODE_ENV: 'test' })).toBeUndefined();
});
