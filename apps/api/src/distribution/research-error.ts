import { getErrorCode } from '@forgelex/domain';

export function classifyResearchError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown } | null;
  const code = getErrorCode(error, 'OPERATION_FAILED');
  const message = typeof candidate?.message === 'string' ? candidate.message : 'Não foi possível concluir a operação.';
  if (code === 'BILLING_INSUFFICIENT_BALANCE')
    return {
      status: 402,
      error: 'PAYMENT_REQUIRED',
      message,
      details: candidate?.details,
    };
  if (code === 'TOOL_TIMEOUT' || code === '57014')
    return {
      status: 504,
      error: 'TOOL_TIMEOUT',
      message: 'A operação excedeu o tempo de resposta. Tente novamente.',
    };
  if (code === 'UNSUPPORTED_COURT') return { status: 422, error: code, message };
  if (code.startsWith('IDEMPOTENCY_') || code === 'BILLING_ACCOUNT_NOT_PROVISIONED')
    return { status: 409, error: code, message };
  if (code.startsWith('SOURCE_PROVIDER_') || code === 'JURISPRUDENCE_DATA_PLANE_UNAVAILABLE')
    return {
      status: 503,
      error: 'SOURCE_PROVIDER_UNAVAILABLE',
      message: 'O serviço de pesquisa está temporariamente indisponível. Tente novamente.',
    };
  if (code === 'SESSION_CANCELLED')
    return { status: 408, error: code, message: 'A operação foi cancelada. Tente novamente.' };
  return {
    status: 503,
    error: 'OPERATION_UNAVAILABLE',
    message: 'Não foi possível concluir a operação. Tente novamente.',
  };
}
