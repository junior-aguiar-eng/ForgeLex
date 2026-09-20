import { describe, expect, it } from 'vitest';
import { GLOBAL_STJ_TABLES, assertAllowedTables, buildDumpArgs, buildRestoreArgs, assertRemoteRestore } from './export-global-stj.mjs';

describe('phase8:export-stj', () => {
  it('mantém allowlist estrita e comandos verificáveis', () => {
    expect(GLOBAL_STJ_TABLES).toHaveLength(4);
    expect(assertAllowedTables(GLOBAL_STJ_TABLES)).toEqual(GLOBAL_STJ_TABLES);
    expect(buildDumpArgs('/tmp/stj.dump')).toEqual(expect.arrayContaining(['--data-only', '--format=custom', '--file=/tmp/stj.dump']));
    expect(buildDumpArgs('/tmp/stj.dump').filter((item) => item.startsWith('--table='))).toHaveLength(4);
    expect(buildRestoreArgs('/tmp/stj.dump')).toEqual(['--single-transaction', '--exit-on-error', '--data-only', '/tmp/stj.dump']);
  });

  it.each(['forgelex_tenants', 'api_keys', 'ledger_accounts', 'matters', 'sessions', 'legal_documents', 'jurisprudence_ingestion_staging'])('rejeita tabela fora da allowlist: %s', (table) => {
    expect(() => assertAllowedTables([...GLOBAL_STJ_TABLES, table])).toThrow('EXPORT_TABLE_NOT_ALLOWED');
  });

  it('exige confirmação e hosts distintos para restauração remota', () => {
    expect(() => assertRemoteRestore('postgres://u:p@source/db', 'postgres://u:p@target/db', '')).toThrow('REMOTE_RESTORE_NOT_CONFIRMED');
    expect(() => assertRemoteRestore('postgres://u:p@same/db', 'postgres://u:p@same/other', 'confirmed')).toThrow('RESTORE_TARGET_MUST_DIFFER');
    expect(assertRemoteRestore('postgres://u:p@source/db', 'postgres://u:p@target/db', 'confirmed')).toBeUndefined();
  });
});
