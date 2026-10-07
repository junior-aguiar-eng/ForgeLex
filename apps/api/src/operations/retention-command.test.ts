import { describe, expect, it } from 'vitest';
import { resolveRetentionCommand } from './retention-command.js';

describe('operational retention command', () => {
  it('inspeciona por padrão e exige autorização explícita para expurgo', () => {
    expect(resolveRetentionCommand([], {})).toMatchObject({ apply: false, policy: { operationalDays: 90 } });
    expect(() => resolveRetentionCommand(['--apply'], { DATABASE_URL: 'postgres://unused' })).toThrow('RETENTION_EXECUTION_NOT_AUTHORIZED');
    expect(resolveRetentionCommand(['--apply'], { FORGELEX_RETENTION_EXECUTION_ENABLED: 'true' })).toMatchObject({ apply: true });
    expect(() => resolveRetentionCommand(['--unknown'], {})).toThrow('RETENTION_ARGUMENT_INVALID');
    expect(() => resolveRetentionCommand([], { FORGELEX_OPERATION_RETENTION_DAYS: '0' })).toThrow('FORGELEX_OPERATION_RETENTION_DAYS_INVALID');
  });
});
