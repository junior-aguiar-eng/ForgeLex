import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedPrincipal, TokenVerifier } from '@forgelex/domain';
import type { AccountRepository, ApiKeyRepository } from '@forgelex/persistence';

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

export interface SupabaseIdentity {
  id: string;
  email: string;
  emailConfirmed: boolean;
  displayName?: string;
}

export interface SupabaseIdentityVerifierOptions {
  baseUrl: string;
  publishableKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readSupabaseIdentity(value: unknown): SupabaseIdentity | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.email !== 'string') {
    return null;
  }

  const id = value.id.trim();
  const email = value.email.trim().toLowerCase();
  if (!id || !email) return null;

  const metadata = isRecord(value.user_metadata) ? value.user_metadata : undefined;
  const displayName = metadata && typeof metadata.full_name === 'string'
    ? metadata.full_name.trim()
    : undefined;
  const confirmedAt = value.email_confirmed_at ?? value.confirmed_at;

  return {
    id,
    email,
    emailConfirmed: typeof confirmedAt === 'string' && confirmedAt.length > 0,
    displayName: displayName || undefined,
  };
}

export class SupabaseIdentityVerifier {
  private readonly baseUrl: string;
  private readonly publishableKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: SupabaseIdentityVerifierOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.publishableKey = options.publishableKey;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async verify(token: string): Promise<SupabaseIdentity | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return readSupabaseIdentity(await response.json().catch(() => null));
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class SupabaseTokenVerifier implements TokenVerifier {
  public constructor(
    private readonly identityVerifier: SupabaseIdentityVerifier,
    private readonly accountRepository: AccountRepository,
  ) {}

  public async verify(token: string): Promise<AuthenticatedPrincipal | null> {
    const identity = await this.identityVerifier.verify(token);
    if (!identity?.emailConfirmed) return null;

    const account = await this.accountRepository.findBySupabaseUserId(identity.id);
    if (
      !account ||
      account.user.status !== 'ACTIVE' ||
      account.tenant.status !== 'ACTIVE' ||
      account.membership.status !== 'ACTIVE'
    ) {
      return null;
    }

    return {
      subjectId: identity.id,
      tenantId: account.tenant.id,
      userId: account.user.id,
      roles: [account.membership.role.toLowerCase()],
      scopes: ['mcp', 'research:read', 'matter:read', 'matter:write', 'draft:write', 'billing:read', 'billing:write'],
      authMethod: 'session',
    };
  }
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

export interface PrincipalBlocklist {
  isBlocked(principal: AuthenticatedPrincipal): Promise<boolean>;
}

export class ClosureAwareTokenVerifier implements TokenVerifier {
  public constructor(
    private readonly delegate: TokenVerifier,
    private readonly blocklist: PrincipalBlocklist,
  ) {}

  public async verify(token: string): Promise<AuthenticatedPrincipal | null> {
    const principal = await this.delegate.verify(token);
    if (!principal || await this.blocklist.isBlocked(principal)) return null;
    return principal;
  }
}

export function readVerifiedPasswordAuthenticationAt(token: string): number | undefined {
  const payloadPart = token.split('.')[1];
  if (!payloadPart) return undefined;
  try {
    const payload: unknown = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (!isRecord(payload) || !Array.isArray(payload.amr)) return undefined;
    const timestamps = payload.amr.flatMap((entry) => {
      if (!isRecord(entry) || entry.method !== 'password') return [];
      return typeof entry.timestamp === 'number' && Number.isSafeInteger(entry.timestamp) && entry.timestamp >= 0
        ? [entry.timestamp]
        : [];
    });
    return timestamps.length > 0 ? Math.max(...timestamps) : undefined;
  } catch {
    return undefined;
  }
}

export function isRecentPasswordAuthentication(
  token: string,
  now: Date,
  maxAgeSeconds = 300,
): boolean {
  const authenticatedAt = readVerifiedPasswordAuthenticationAt(token);
  if (authenticatedAt === undefined || maxAgeSeconds < 0) return false;
  const ageSeconds = Math.floor(now.getTime() / 1_000) - authenticatedAt;
  return ageSeconds >= 0 && ageSeconds <= maxAgeSeconds;
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

export function extractBearerToken(authorization: string | undefined): string {
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
  accountRepository?: AccountRepository,
  blocklist?: PrincipalBlocklist,
): AuthAdapter {
  const verifiers: TokenVerifier[] = [EnvironmentTokenVerifier.fromEnvironment(environment)];
  if (apiKeyRepository) verifiers.push(new DatabaseApiKeyVerifier(apiKeyRepository));
  const supabaseIdentityVerifier = createSupabaseIdentityVerifier(environment);
  if (supabaseIdentityVerifier && accountRepository) {
    verifiers.push(new SupabaseTokenVerifier(supabaseIdentityVerifier, accountRepository));
  }
  const verifier = verifiers.length === 1 ? verifiers[0] : new CompositeTokenVerifier(verifiers);
  return new AuthAdapter(blocklist ? new ClosureAwareTokenVerifier(verifier, blocklist) : verifier);
}

export function createSupabaseIdentityVerifier(
  environment: Record<string, string | undefined>,
): SupabaseIdentityVerifier | undefined {
  const baseUrl = environment.FORGELEX_SUPABASE_URL?.trim();
  const publishableKey = environment.FORGELEX_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!baseUrl || !publishableKey) return undefined;
  return new SupabaseIdentityVerifier({ baseUrl, publishableKey });
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
