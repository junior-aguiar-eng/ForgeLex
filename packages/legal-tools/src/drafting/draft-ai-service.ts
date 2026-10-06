import type { ToolExecutionContext } from '@forgelex/agent-core';
import type { DraftSaveFromAiInput, DraftAiReceipt } from '@forgelex/domain';
import { DraftAiReceiptRepository } from '@forgelex/persistence';
export class DraftAiService {
  constructor(private readonly repository: DraftAiReceiptRepository) {}
  async receive(context: ToolExecutionContext, input: DraftSaveFromAiInput): Promise<DraftAiReceipt> {
    if (context.source !== 'MCP' || !context.oauthConnection || !context.revalidateConnection)
      throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
    await context.revalidateConnection();
    return this.repository.receive(
      { tenantId: context.tenantId, userId: context.userId, oauthConnection: context.oauthConnection },
      input,
      { signal: context.abortSignal },
    );
  }
}
