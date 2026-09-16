import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedPrincipal, TokenVerifier } from '@forgelex/domain';
import type { ApiKeyRepository } from '@forgelex/persistence';

declare module 'fastify' {
  interface FastifyRequest {
    principal: AuthenticatedPrincipal;
  }
}

export class AuthenticationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export interface ApiKeyPrincipalRecord {
  tokenHash: string;
  subjectId: string;
  tenantId: string;
  userId: string;
  roles?: string[];
  scopes?: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function normalizeTokenHash(value: string): string {
  return value.toLowerCase().replace(/^sha256:/, '');
}

function isApiKeyPrincipalRecord(value: unknown): value is ApiKeyPrincipalRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<ApiKeyPrincipalRecord>;
  const tokenHash = typeof record.tokenHash === 'string' ? normalizeTokenHash(record.tokenHash) : '';

  return (
    /^[a-f0-9]{64}$/.test(tokenHash) &&
    isNonEmptyString(record.subjectId) &&
    isNonEmptyString(record.tenantId) &&
    isNonEmptyString(record.userId) &&
    (record.roles === undefined || isStringArray(record.roles)) &&
    (record.scopes === undefined || isStringArray(record.scopes))
  );
}

export class EnvironmentTokenVerifier implements TokenVerifier {
  private readonly records: readonly ApiKeyPrincipalRecord[];

  public constructor(records: readonly ApiKeyPrincipalRecord[]) {
    this.records = records.map((record) => ({
      ...record,
      tokenHash: normalizeTokenHash(record.tokenHash),
      roles: [...(record.roles ?? [])],
      scopes: [...(record.scopes ?? [])],
    }));
  }

  public static fromEnvironment(environment: Record<string, string | undefined>): EnvironmentTokenVerifier {
    const rawConfiguration = environment.FORGELEX_API_KEYS;
    if (!rawConfiguration) {
      return new EnvironmentTokenVerifier([]);
    }

    try {
      const parsedConfiguration: unknown = JSON.parse(rawConfiguration);
      const records = Array.isArray(parsedConfiguration)
        ? parsedConfiguration.filter(isApiKeyPrincipalRecord)
        : [];

      return new EnvironmentTokenVerifier(records);
    } catch {
      // Uma configuração inválida não deve habilitar uma rota protegida.
      return new EnvironmentTokenVerifier([]);
    }
  }

  public async verify(token: string): Promise<AuthenticatedPrincipal | null> {
    const tokenDigest = createHash('sha256').update(token, 'utf8').digest();

    for (const record of this.records) {
      const configuredDigest = Buffer.from(record.tokenHash, 'hex');
      if (configuredDigest.length !== tokenDigest.length) {
        continue;
      }

      if (timingSafeEqual(tokenDigest, configuredDigest)) {
        return {
          subjectId: record.subjectId,
          tenantId: record.tenantId,
          userId: record.userId,
          roles: [...(record.roles ?? [])],
          scopes: [...(record.scopes ?? [])],
          authMethod: 'api_key',
        };
      }
    }

    return null;
  }
}

export class DatabaseApiKeyVerifier implements TokenVerifier {
  public constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  public async verify(token: string): Promise<AuthenticatedPrincipal | null> {
    const record = await this.apiKeyRepository.findActiveByTokenHash(hashApiKey(token));
    if (!record) return null;

    return {
      subjectId: record.subjectId,
      tenantId: record.tenantId,
      userId: record.userId,
      roles: [...record.roles],
      scopes: [...record.scopes],
      authMethod: 'api_key',
    };
  }
}

export class CompositeTokenVerifier implements TokenVerifier {
  public constructor(private readonly verifiers: readonly TokenVerifier[]) {}

  public async verify(token: string): Promise<AuthenticatedPrincipal | null> {
    for (const verifier of this.verifiers) {
      const principal = await verifier.verify(token);
      if (principal) return principal;
    }
    return null;
  }
}

function isAuthenticatedPrincipal(value: unknown): value is AuthenticatedPrincipal {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const principal = value as Partial<AuthenticatedPrincipal>;
  return (
    isNonEmptyString(principal.subjectId) &&
    isNonEmptyString(principal.tenantId) &&
    isNonEmptyString(principal.userId) &&
    isStringArray(principal.roles) &&
    isStringArray(principal.scopes) &&
    (principal.authMethod === 'session' ||
      principal.authMethod === 'api_key' ||
      principal.authMethod === 'oauth_access_token')
  );
}

function extractBearerToken(authorization: string | undefined): string {
  if (!authorization) {
    throw new AuthenticationError('Credencial Bearer ausente.');
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  if (!match) {
    throw new AuthenticationError('Credencial Bearer inválida.');
  }

  return match[1];
}

export class AuthAdapter {
  private readonly tokenVerifier: TokenVerifier;

  public constructor(tokenVerifier: TokenVerifier) {
    this.tokenVerifier = tokenVerifier;
  }

  public async authenticate(authorization: string | undefined): Promise<AuthenticatedPrincipal> {
    const token = extractBearerToken(authorization);
    const principal = await this.tokenVerifier.verify(token);

    if (!principal || !isAuthenticatedPrincipal(principal)) {
      throw new AuthenticationError('Credencial Bearer inválida.');
    }

    return principal;
  }

  public createPreHandler(requiredScopes: readonly string[] = []) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        const principal = await this.authenticate(request.headers.authorization);
        const missingScopes = requiredScopes.filter((scope) => !principal.scopes.includes(scope));

        if (missingScopes.length > 0) {
          reply.code(403).send({
            error: 'INSUFFICIENT_SCOPE',
            message: 'A credencial não possui os escopos necessários para esta operação.',
            requiredScopes,
            missingScopes,
          });
          return;
        }

        request.principal = principal;
      } catch (error) {
        if (!(error instanceof AuthenticationError)) {
          throw error;
        }

        reply.header('WWW-Authenticate', 'Bearer realm="forgelex-api"');
        reply.code(401).send({
          error: 'UNAUTHENTICATED',
          message: error.message,
        });
      }
    };
  }
}

export function createDefaultAuthAdapter(
  environment: Record<string, string | undefined>,
  apiKeyRepository?: ApiKeyRepository,
): AuthAdapter {
  const verifiers: TokenVerifier[] = [EnvironmentTokenVerifier.fromEnvironment(environment)];
  if (apiKeyRepository) verifiers.push(new DatabaseApiKeyVerifier(apiKeyRepository));
  return new AuthAdapter(verifiers.length === 1 ? verifiers[0] : new CompositeTokenVerifier(verifiers));
}

export function resolveAllowedOrigins(environment: Record<string, string | undefined>): string[] {
  const configuredOrigins = environment.FORGELEX_ALLOWED_ORIGINS;
  if (configuredOrigins !== undefined) {
    return configuredOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  if (environment.NODE_ENV === 'production') {
    return [];
  }

  return ['http://localhost:3000', 'http://localhost:3001'];
}

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
