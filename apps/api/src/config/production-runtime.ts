export interface ProductionRuntime {
  port: number;
  host: '0.0.0.0';
  databaseUrl: string;
  webhookMasterKey: string;
  metricsToken: string;
}

export function startupErrorForLog(error: unknown): Readonly<{ name: string; code: string }> {
  if (!(error instanceof Error)) return Object.freeze({ name: 'UnknownError', code: 'STARTUP_FAILED' });
  const candidate = error as Error & { code?: unknown };
  return Object.freeze({
    name: error.name || 'Error',
    code: typeof candidate.code === 'string' && /^[A-Z0-9_]+$/.test(candidate.code)
      ? candidate.code
      : 'STARTUP_FAILED',
  });
}

export function resolveProductionRuntime(
  environment: Record<string, string | undefined>,
): Readonly<ProductionRuntime> {
  if (environment.NODE_ENV !== 'production') throw new Error('PRODUCTION_ENV_REQUIRED');

  const databaseUrl = environment.DATABASE_URL ?? environment.FORGELEX_DATABASE_URL;
  if (!databaseUrl) throw new Error('PRODUCTION_DATABASE_URL_REQUIRED');
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) throw new Error('PRODUCTION_POSTGRES_REQUIRED');

  const webhookMasterKey = environment.FORGELEX_WEBHOOK_MASTER_KEY;
  if (!webhookMasterKey) throw new Error('PRODUCTION_WEBHOOK_KEY_REQUIRED');

  const metricsToken = environment.FORGELEX_METRICS_TOKEN;
  if (!metricsToken) throw new Error('PRODUCTION_METRICS_TOKEN_REQUIRED');

  const port = Number(environment.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PRODUCTION_PORT_INVALID');
  }

  return Object.freeze({
    port,
    host: '0.0.0.0' as const,
    databaseUrl,
    webhookMasterKey,
    metricsToken,
  });
}
