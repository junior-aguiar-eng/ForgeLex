import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthenticatedPrincipal } from '@forgelex/domain';
import type { AccountClosureRepository, AccountClosureStatus } from '@forgelex/persistence';
import {
  AuthAdapter,
  AuthenticationError,
  extractBearerToken,
  SupabaseIdentityVerifier,
} from '../auth/fastify-auth.js';
import { digestClosureValue } from './account-closure-crypto.js';
import { ACCOUNT_CLOSURE_POLICY } from './account-closure-policy.js';
import { AccountClosureService } from './account-closure-service.js';

export interface AccountClosurePolicyResponse {
  enabled: boolean;
  version: typeof ACCOUNT_CLOSURE_POLICY.version;
  confirmation: typeof ACCOUNT_CLOSURE_POLICY.confirmation;
  reauthenticationMaxAgeSeconds: number;
  deadlines: { identityHours: number; privateContentDays: number; backupDays: number };
  consequences: readonly string[];
  retention: readonly { category: string; disposition: string; deadline: string }[];
  personalTenantOnly: true;
}

export interface AccountClosureAcceptedResponse {
  closureId: string;
  statusToken: string;
  status: 'ACCESS_BLOCKED';
  requestedAt: string;
  policyVersion: typeof ACCOUNT_CLOSURE_POLICY.version;
}

export interface AccountClosureStatusResponse {
  closureId: string;
  status: AccountClosureStatus;
  requestedAt: string;
  updatedAt: string;
  accessBlockedAt?: string;
  identityRemovedAt?: string;
  completedAt?: string;
  lastErrorCode?: string;
}

export interface AccountClosureRouteDependencies {
  enabled: boolean;
  authAdapter: AuthAdapter;
  identityVerifier?: SupabaseIdentityVerifier;
  service?: AccountClosureService;
  repository?: AccountClosureRepository;
  subjectHashSecret?: string;
}

function fail(reply: FastifyReply, status: number, error: string, message: string) {
  return reply.code(status).send({ error, message });
}

function safeHashMatch(expected: string, received: string): boolean {
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(received, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerAccountClosureRoutes(
  app: FastifyInstance,
  dependencies: AccountClosureRouteDependencies,
): void {
  const { enabled, authAdapter, identityVerifier, service, repository, subjectHashSecret } = dependencies;
  if (enabled && (!identityVerifier || !service || !repository || !subjectHashSecret)) {
    throw new Error('ACCOUNT_CLOSURE_ROUTE_CONFIG_REQUIRED');
  }
  if (enabled && Buffer.byteLength(subjectHashSecret!, 'utf8') < 32) {
    throw new Error('ACCOUNT_CLOSURE_SUBJECT_HASH_SECRET_INVALID');
  }

  app.get('/api/v2/account/closure-policy', { preHandler: authAdapter.createPreHandler() }, async (request, reply) => {
    if (request.principal.authMethod !== 'session') {
      return fail(reply, 403, 'SESSION_REQUIRED', 'Entre na sua conta para consultar a política.');
    }
    const response: AccountClosurePolicyResponse = {
      enabled,
      version: ACCOUNT_CLOSURE_POLICY.version,
      confirmation: ACCOUNT_CLOSURE_POLICY.confirmation,
      reauthenticationMaxAgeSeconds: ACCOUNT_CLOSURE_POLICY.reauthenticationMaxAgeSeconds,
      deadlines: {
        identityHours: ACCOUNT_CLOSURE_POLICY.supabaseIdentityDeadlineHours,
        privateContentDays: ACCOUNT_CLOSURE_POLICY.privateContentDeadlineDays,
        backupDays: ACCOUNT_CLOSURE_POLICY.backupRetentionDays,
      },
      consequences: [
        'O acesso é bloqueado imediatamente e o encerramento é irreversível.',
        'Conteúdo privado e identidade são eliminados nos prazos informados; registros sujeitos a retenção são minimizados.',
        'Créditos e comprovantes seguem a política de retenção e reembolso aplicável.',
      ],
      retention: [
        { category: 'identity', disposition: 'delete', deadline: '24h' },
        { category: 'private_content', disposition: 'delete', deadline: '7d' },
        { category: 'access_logs', disposition: 'minimize', deadline: '180d' },
        { category: 'financial_records', disposition: 'minimize_and_retain', deadline: 'provisional_5y' },
        { category: 'backups', disposition: 'expire', deadline: '35d' },
      ],
      personalTenantOnly: true,
    };
    return response;
  });

  app.post('/api/v2/account/closure', async (request, reply) => {
    let accessToken: string;
    try {
      accessToken = extractBearerToken(request.headers.authorization);
    } catch {
      return fail(reply, 401, 'UNAUTHENTICATED', 'Sessão inválida ou ausente.');
    }
    let principal: AuthenticatedPrincipal | undefined;
    try {
      principal = await authAdapter.authenticate(request.headers.authorization);
    } catch (error) {
      if (!(error instanceof AuthenticationError)) throw error;
      // O bloqueio imediato impede a autenticação normal, mas o mesmo JWT
      // ainda pode reproduzir a solicitação enquanto a identidade existir.
      if (enabled && identityVerifier && repository && subjectHashSecret) {
        const identity = await identityVerifier.verify(accessToken);
        if (identity?.emailConfirmed) {
          const existing = await repository.findBySubjectHash(digestClosureValue(subjectHashSecret, identity.id));
          if (existing) {
            principal = {
              subjectId: identity.id,
              userId: existing.userId ?? '',
              tenantId: existing.tenantId ?? '',
              roles: [],
              scopes: [],
              authMethod: 'session',
            };
          }
        }
      }
      if (!principal) return fail(reply, 401, 'UNAUTHENTICATED', 'Sessão inválida ou ausente.');
    }
    if (principal.authMethod !== 'session') {
      return fail(reply, 403, 'SESSION_REQUIRED', 'Entre na sua conta para encerrar a conta.');
    }
    if (!enabled) return fail(reply, 404, 'ACCOUNT_CLOSURE_DISABLED', 'O encerramento ainda não está habilitado.');
    const identity = await identityVerifier!.verify(accessToken);
    if (!identity?.emailConfirmed || identity.id !== principal.subjectId) {
      return fail(reply, 401, 'UNAUTHENTICATED', 'Não foi possível confirmar a identidade da sessão.');
    }
    const personalIdSuffix = createHash('sha256').update(identity.id, 'utf8').digest('hex').slice(0, 32);
    const priorClosure = await repository!.findBySubjectHash(digestClosureValue(subjectHashSecret!, identity.id));
    if (
      !priorClosure &&
      (principal.userId !== `user_${personalIdSuffix}` || principal.tenantId !== `tenant_${personalIdSuffix}`)
    ) {
      return fail(
        reply,
        409,
        'ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER',
        'Somente o espaço pessoal pode ser encerrado por esta operação.',
      );
    }
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return fail(reply, 400, 'ACCOUNT_CLOSURE_IDEMPOTENCY_KEY_REQUIRED', 'Informe Idempotency-Key.');
    }
    const payload = request.body && typeof request.body === 'object' ? (request.body as Record<string, unknown>) : {};
    try {
      const result = await service!.request({
        principal,
        confirmation: typeof payload.confirmation === 'string' ? payload.confirmation : '',
        policyVersion: typeof payload.policyVersion === 'string' ? payload.policyVersion : '',
        idempotencyKey,
        accessToken,
      });
      const response: AccountClosureAcceptedResponse = {
        closureId: result.closure.id,
        statusToken: result.statusToken,
        status: 'ACCESS_BLOCKED',
        requestedAt: result.closure.requestedAt,
        policyVersion: ACCOUNT_CLOSURE_POLICY.version,
      };
      return reply.code(202).send(response);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'ACCOUNT_CLOSURE_CONFIRMATION_MISMATCH') {
        return fail(reply, 400, 'ACCOUNT_CLOSURE_CONFIRMATION_INVALID', 'O texto de confirmação não confere.');
      }
      if (code === 'ACCOUNT_CLOSURE_REAUTHENTICATION_REQUIRED') {
        return fail(
          reply,
          409,
          'ACCOUNT_CLOSURE_REAUTH_REQUIRED',
          'Autentique-se novamente com senha para prosseguir.',
        );
      }
      if (code === 'ACCOUNT_CLOSURE_POLICY_VERSION_MISMATCH') {
        return fail(reply, 409, code, 'Consulte a versão atual da política.');
      }
      if (code === 'ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER') {
        return fail(reply, 409, code, 'Transfira os vínculos do espaço compartilhado antes do encerramento.');
      }
      if (code === 'ACCOUNT_CLOSURE_IDEMPOTENCY_CONFLICT' || code === 'ACCOUNT_CLOSURE_STATUS_TOKEN_MISMATCH') {
        return fail(
          reply,
          409,
          'ACCOUNT_CLOSURE_IDEMPOTENCY_CONFLICT',
          'Esta conta já possui outra solicitação de encerramento.',
        );
      }
      if (code === 'ACCOUNT_CLOSURE_ACCOUNT_NOT_ACTIVE' || code === 'ACCOUNT_CLOSURE_CONCURRENT_ACCOUNT_CHANGE') {
        return fail(reply, 409, 'ACCOUNT_CLOSURE_ACCOUNT_NOT_ACTIVE', 'A conta não está ativa.');
      }
      throw error;
    }
  });

  app.get<{ Params: { closureId: string } }>('/api/v2/account/closure/:closureId', async (request, reply) => {
    if (!repository) return fail(reply, 404, 'ACCOUNT_CLOSURE_DISABLED', 'O acompanhamento não está disponível.');
    const statusToken = request.headers['x-closure-token'];
    if (typeof statusToken !== 'string' || !/^flx_close_[A-Za-z0-9_-]{43}$/.test(statusToken)) {
      return fail(reply, 401, 'ACCOUNT_CLOSURE_TOKEN_INVALID', 'Token de acompanhamento inválido.');
    }
    const closure = await repository.findById(request.params.closureId);
    const candidateHash = createHash('sha256').update(statusToken, 'utf8').digest('hex');
    if (!closure || !safeHashMatch(closure.statusTokenHash, candidateHash)) {
      return fail(reply, 401, 'ACCOUNT_CLOSURE_TOKEN_INVALID', 'Token de acompanhamento inválido.');
    }
    const response: AccountClosureStatusResponse = {
      closureId: closure.id,
      status: closure.status,
      requestedAt: closure.requestedAt,
      updatedAt: closure.updatedAt,
      ...(closure.accessBlockedAt ? { accessBlockedAt: closure.accessBlockedAt } : {}),
      ...(closure.identityRemovedAt ? { identityRemovedAt: closure.identityRemovedAt } : {}),
      ...(closure.completedAt ? { completedAt: closure.completedAt } : {}),
      ...(closure.lastErrorCode ? { lastErrorCode: closure.lastErrorCode } : {}),
    };
    return response;
  });
}
