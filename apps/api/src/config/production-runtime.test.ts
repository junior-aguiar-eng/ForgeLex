import { describe, expect, it } from 'vitest';
import { resolveProductionRuntime } from './production-runtime.js';

const validEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://forgelex:secret@localhost:5432/forgelex',
  FORGELEX_WEBHOOK_MASTER_KEY: 'webhook-secret',
  FORGELEX_METRICS_TOKEN: 'metrics-secret',
};

describe('resolveProductionRuntime', () => {
  it('rejeita produção sem PostgreSQL', () => {
    expect(() => resolveProductionRuntime({ NODE_ENV: 'production' }))
      .toThrow('PRODUCTION_DATABASE_URL_REQUIRED');
    expect(() => resolveProductionRuntime({
      ...validEnvironment,
      DATABASE_URL: 'file:forgelex.db',
    })).toThrow('PRODUCTION_POSTGRES_REQUIRED');
  });

  it('rejeita secrets operacionais ausentes', () => {
    expect(() => resolveProductionRuntime({
      ...validEnvironment,
      FORGELEX_WEBHOOK_MASTER_KEY: undefined,
    })).toThrow('PRODUCTION_WEBHOOK_KEY_REQUIRED');
    expect(() => resolveProductionRuntime({
      ...validEnvironment,
      FORGELEX_METRICS_TOKEN: undefined,
    })).toThrow('PRODUCTION_METRICS_TOKEN_REQUIRED');
  });

  it.each(['0', '65536', 'abc', '3000.5'])('rejeita PORT inválida %s', (port) => {
    expect(() => resolveProductionRuntime({ ...validEnvironment, PORT: port }))
      .toThrow('PRODUCTION_PORT_INVALID');
  });

  it('normaliza o runtime imutável com a porta do Cloud Run', () => {
    const runtime = resolveProductionRuntime({ ...validEnvironment, PORT: '8080' });

    expect(runtime).toEqual({
      port: 8080,
      host: '0.0.0.0',
      databaseUrl: validEnvironment.DATABASE_URL,
      webhookMasterKey: 'webhook-secret',
      metricsToken: 'metrics-secret',
    });
    expect(Object.isFrozen(runtime)).toBe(true);
  });
});
