import { describe, expect, it, vi } from 'vitest';
import { BILLING_SCOPES, bootstrapBillingTenant } from './bootstrap-billing-tenant.mjs';

describe('phase14:bootstrap-billing', () => {
  it('cria identidade de billing sem saldo e sem scope jurídico', async () => {
    const account = { user: { id: 'user_14' }, tenant: { id: 'tenant_14' } };
    const apiKey = { id: 'key_14', keyPrefix: 'flx_live_prefix', token: 'flx_live_value' };
    const deps = {
      bootstrapAccount: vi.fn(async () => account),
      provisionAccount: vi.fn(async () => undefined),
      createApiKey: vi.fn(async () => apiKey),
      writeToken: vi.fn(async () => undefined),
    };

    const result = await bootstrapBillingTenant(deps, 'phase14_billing_fixed');

    expect(BILLING_SCOPES).toEqual(['billing:read', 'billing:write']);
    expect(deps.provisionAccount).toHaveBeenCalledWith(account.tenant.id, { paidBalanceCents: 0, promotionalBalanceCents: 0 });
    expect(deps.createApiKey).toHaveBeenCalledWith(expect.objectContaining({ scopes: BILLING_SCOPES }));
    expect(deps.writeToken).toHaveBeenCalledWith(apiKey.token);
    expect(JSON.stringify(result)).not.toContain(apiKey.token);
    expect(result).toEqual({ tenantId: account.tenant.id, userId: account.user.id, keyId: apiKey.id, keyPrefix: apiKey.keyPrefix });
  });

  it('rejeita prefixo que não pertence à fase 14', async () => {
    await expect(bootstrapBillingTenant({}, 'phase8_hml_fixed')).rejects.toThrow('PHASE14_ID_PREFIX_REQUIRED');
  });
});
