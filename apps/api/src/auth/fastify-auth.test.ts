import { describe, expect, it } from 'vitest';
import {
  AuthAdapter,
  ClosureAwareTokenVerifier,
  createDefaultAuthAdapter,
  EnvironmentTokenVerifier,
  hashApiKey,
  resolveAllowedOrigins,
} from './fastify-auth.js';
import type { AuthenticatedPrincipal } from '@forgelex/domain';

const principal: AuthenticatedPrincipal = {
  subjectId: 'subject_1',
  tenantId: 'tenant_1',
  userId: 'user_1',
  roles: ['lawyer'],
  scopes: ['research:read'],
  authMethod: 'api_key',
};

describe('Fastify auth adapter', () => {
  it('autentica API key usando hash SHA-256 e retorna o principal canônico', async () => {
    const verifier = new EnvironmentTokenVerifier([
      {
        tokenHash: hashApiKey('secret-token'),
        ...principal,
      },
    ]);

    await expect(new AuthAdapter(verifier).authenticate('Bearer secret-token')).resolves.toEqual(principal);
    await expect(new AuthAdapter(verifier).authenticate('Bearer wrong-token')).rejects.toThrow(
      'Credencial Bearer inválida.'
    );
  });

  it('falha fechado sem configuração ou com JSON inválido', async () => {
    const missingVerifier = EnvironmentTokenVerifier.fromEnvironment({});
    const invalidVerifier = EnvironmentTokenVerifier.fromEnvironment({ FORGELEX_API_KEYS: '{invalid' });

    await expect(new AuthAdapter(missingVerifier).authenticate('Bearer any-token')).rejects.toThrow(
      'Credencial Bearer inválida.'
    );
    await expect(new AuthAdapter(invalidVerifier).authenticate('Bearer any-token')).rejects.toThrow(
      'Credencial Bearer inválida.'
    );
  });

  it('rejeita formatos que não sejam Bearer', async () => {
    const adapter = new AuthAdapter(new EnvironmentTokenVerifier([]));

    await expect(adapter.authenticate(undefined)).rejects.toThrow('Credencial Bearer ausente.');
    await expect(adapter.authenticate('Basic credentials')).rejects.toThrow('Credencial Bearer inválida.');
    await expect(adapter.authenticate('Bearer token extra')).rejects.toThrow('Credencial Bearer inválida.');
  });

  it('resolve origens configuradas e mantém localhost explícito fora de produção', () => {
    expect(resolveAllowedOrigins({ FORGELEX_ALLOWED_ORIGINS: 'https://app.example, https://admin.example' })).toEqual([
      'https://app.example',
      'https://admin.example',
    ]);
    expect(resolveAllowedOrigins({ NODE_ENV: 'production' })).toEqual([]);
    expect(resolveAllowedOrigins({ NODE_ENV: 'development' })).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
    ]);
  });

  it('bloqueia credenciais de qualquer origem quando subject ou tenant possui tombstone', async () => {
    const delegate = new EnvironmentTokenVerifier([{ tokenHash: hashApiKey('static-secret'), ...principal }]);
    const allowed = new ClosureAwareTokenVerifier(delegate, { isBlocked: async () => false });
    const blocked = new ClosureAwareTokenVerifier(delegate, { isBlocked: async (candidate) => candidate.tenantId === 'tenant_1' });

    await expect(allowed.verify('static-secret')).resolves.toEqual(principal);
    await expect(blocked.verify('static-secret')).resolves.toBeNull();
  });

  it('aplica a blocklist também às chaves estáticas do adaptador padrão', async () => {
    const environment = {
      FORGELEX_API_KEYS: JSON.stringify([{ tokenHash: hashApiKey('static-secret'), ...principal }]),
    };
    const adapter = createDefaultAuthAdapter(
      environment,
      undefined,
      undefined,
      { isBlocked: async () => true },
    );

    await expect(adapter.authenticate('Bearer static-secret')).rejects.toThrow('Credencial Bearer inválida.');
  });
});
