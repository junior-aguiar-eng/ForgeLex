import { it, expect, vi } from 'vitest';
import type { DraftAiReceiptRepository } from '@forgelex/persistence';
import { DraftAiService } from './draft-ai-service.js';
import { getForgeLexBillingPolicy } from '@forgelex/billing-ledger';
it('exige OAuth MCP, revalida antes de escrever e encaminha cancelamento', async () => {
  const receive = vi.fn().mockResolvedValue({ id: 'receipt' });
  const service = new DraftAiService({ receive } as unknown as DraftAiReceiptRepository);
  const context = { sessionId:'s',tenantId:'t',userId:'u',source:'MCP' as const,abortSignal:new AbortController().signal,oauthConnection:{clientId:'app',grantedAt:'2026-10-06T10:00:00.000Z'},revalidateConnection:vi.fn().mockResolvedValue(undefined) };
  const input = { matterId:'10000000-0000-4000-8000-000000000001',expectedGrantRevision:1,idempotencyKey:'abcdefghijklmnop',title:'Texto recebido',sections:[{ordinal:0,title:'Fatos',content:'Texto'}],references:[] };
  await expect(service.receive({...context,source:'REST'},input)).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
  await expect(service.receive({...context,revalidateConnection:async()=>{throw new Error('revogado');}},input)).rejects.toThrow('revogado');
  expect(receive).not.toHaveBeenCalled();
  await service.receive(context,input);
  expect(receive).toHaveBeenCalledWith({tenantId:'t',userId:'u',oauthConnection:context.oauthConnection},input,{signal:context.abortSignal});
  expect(getForgeLexBillingPolicy('draft.save_from_ai')).toEqual({mode:'FREE'});
});
