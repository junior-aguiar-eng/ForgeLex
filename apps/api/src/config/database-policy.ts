export type DatabasePolicy =
  | { mode: 'postgres'; url: string }
  | { mode: 'sqlite'; url: string }
  | { mode: 'injected_or_memory'; url: undefined };

export function resolveDatabasePolicy(environment: Record<string, string | undefined>): DatabasePolicy {
  const url = environment.FORGELEX_DATABASE_URL ?? environment.DATABASE_URL;
  if (environment.NODE_ENV === 'test' && !url) {
    return { mode: 'injected_or_memory', url: undefined };
  }
  if (!url) throw new Error('DATABASE_URL_REQUIRED');
  const isPostgres = /^postgres(?:ql)?:\/\//i.test(url);
  if (environment.NODE_ENV === 'production' && !isPostgres) {
    throw new Error('POSTGRES_REQUIRED_IN_PRODUCTION');
  }
  return isPostgres ? { mode: 'postgres', url } : { mode: 'sqlite', url };
}
