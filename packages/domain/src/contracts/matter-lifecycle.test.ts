import { describe, expect, it } from 'vitest';
import * as contracts from './matter-lifecycle.js';

describe('lifecycle commands', () => {
  it('rejects unknown fields and invalid revisions', () => {
    expect(contracts.LifecycleCommandSchema.safeParse({ expectedLifecycleRevision: 0 }).success).toBe(true);
    for (const input of [{ expectedLifecycleRevision: -1 }, { expectedLifecycleRevision: 1.5 }, { expectedLifecycleRevision: 0, userId: 'another' }]) {
      expect(contracts.LifecycleCommandSchema.safeParse(input).success).toBe(false);
    }
  });
  it('requires explicit purge confirmation and strict view', () => {
    expect(contracts.PurgeCommandSchema.safeParse({ expectedLifecycleRevision: 0 }).success).toBe(false);
    expect(contracts.PurgeCommandSchema.safeParse({ expectedLifecycleRevision: 0, confirmation: '' }).success).toBe(false);
    expect(contracts.LifecycleViewSchema.safeParse('purged').success).toBe(false);
  });
});
