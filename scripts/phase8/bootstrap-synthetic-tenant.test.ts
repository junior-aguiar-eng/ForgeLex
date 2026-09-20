import { describe, expect, it, vi } from 'vitest';
import { bootstrapSyntheticTenant, SYNTHETIC_SCOPES } from './bootstrap-synthetic-tenant.mjs';

describe('phase8:bootstrap-tenant', () => {
  it('cria identidade sintética, scopes e exatamente R$ 20 promocionais sem vazar token', async () => {
    const account = { user: { id: 'phase8_hml_user' }, tenant: { id: 'phase8_hml_tenant' } };
    const apiKey = { id: 'phase8_hml_key', keyPrefix: 'flx_live_prefix', token: 'flx_live_secret' };
    const deps = {
      bootstrapAccount: vi.fn(async () => account),
      createApiKey: vi.fn(async () => apiKey),
      provisionAccount: vi.fn(async () => undefined),
      writeToken: vi.fn(async () => undefined),
    };
    const result = await bootstrapSyntheticTenant(deps, 'phase8_hml_fixed');
    expect(deps.provisionAccount).toHaveBeenCalledWith(account.tenant.id, { paidBalanceCents: 0, promotionalBalanceCents: 2_000 });
    expect(deps.createApiKey).toHaveBeenCalledWith(expect.objectContaining({ scopes: SYNTHETIC_SCOPES }));
    expect(deps.writeToken).toHaveBeenCalledWith(apiKey.token);
    expect(JSON.stringify(result)).not.toContain(apiKey.token);
    expect(result).toEqual({ tenantId: account.tenant.id, userId: account.user.id, keyId: apiKey.id, keyPrefix: apiKey.keyPrefix });
  });
});
