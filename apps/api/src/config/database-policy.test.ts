import { describe, expect, it } from 'vitest';
import { resolveDatabasePolicy } from './database-policy.js';

describe('database policy', () => {
  it('exige PostgreSQL explicitamente em produção', () => {
    expect(() => resolveDatabasePolicy({ NODE_ENV: 'production' })).toThrow('DATABASE_URL_REQUIRED');
    expect(() => resolveDatabasePolicy({ NODE_ENV: 'production', DATABASE_URL: 'file:forgelex.db' }))
      .toThrow('POSTGRES_REQUIRED_IN_PRODUCTION');
    expect(resolveDatabasePolicy({ NODE_ENV: 'production', FORGELEX_DATABASE_URL: 'postgres://localhost/forgelex' }))
      .toEqual({ mode: 'postgres', url: 'postgres://localhost/forgelex' });
  });

  it('mantém memória apenas em teste e SQLite apenas quando declarado', () => {
    expect(resolveDatabasePolicy({ NODE_ENV: 'test' })).toEqual({ mode: 'injected_or_memory', url: undefined });
    expect(resolveDatabasePolicy({ NODE_ENV: 'development', DATABASE_URL: 'file:dev.db' }))
      .toEqual({ mode: 'sqlite', url: 'file:dev.db' });
    expect(() => resolveDatabasePolicy({ NODE_ENV: 'development' })).toThrow('DATABASE_URL_REQUIRED');
  });
});
