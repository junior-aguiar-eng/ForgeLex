import { createHash } from 'node:crypto';
import type { AgentProvider } from '@forgelex/agent-core';
import type { AgenticOwner } from '@forgelex/domain';
import { OpenAIAgentProvider } from '@forgelex/agent-provider-openai';
import type { FinalEditorGenerationOptions, FinalEditorService } from '@forgelex/legal-workflows';
import {
  createEditorialOpenAITransport,
  COMMERCIAL_MODEL,
  type CommercialProviderOptions,
} from './commercial-provider.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** A host must first provision a durable financial authorization for this exact command.
 * Never reuse the completed v8 execution or its reservation. No bootstrap activation here. */
export function createFinalEditorOpenAIRuntime(options: {
  apiKey: string;
  executionId: string;
  owner: AgenticOwner;
  context: Awaited<ReturnType<FinalEditorService['load']>>;
  editor: Pick<FinalEditorService, 'load'>;
  finance: CommercialProviderOptions['finance'];
  transport?: typeof globalThis.fetch;
  recordCall?: CommercialProviderOptions['recordCall'];
}): FinalEditorGenerationOptions {
  if (!options.executionId.trim() || options.executionId.length > 200)
    throw new Error('EDITORIAL_AUTHORIZATION_REQUIRED');
  const context = structuredClone(options.context),
    expected = digest(context),
    owner = { ...options.owner };
  const providers = new WeakSet<AgentProvider>();
  const assertContext = async (id: string) => {
    if (id !== options.executionId) throw new Error('EDITORIAL_AUTHORIZATION_REQUIRED');
    const current = await options.editor.load(owner, context.deliveryId, context);
    if (digest(current) !== expected) throw new Error('EDITORIAL_CONTEXT_CHANGED');
    return owner;
  };
  const fetchFor = createEditorialOpenAITransport({
    apiKey: options.apiKey,
    finance: options.finance,
    transport: options.transport,
    recordCall: options.recordCall,
    assertContext,
  });
  return {
    createProvider(input) {
      if (digest(input.context) !== expected) throw new Error('EDITORIAL_CONTEXT_CHANGED');
      const provider = new OpenAIAgentProvider({
        apiKey: options.apiKey,
        model: COMMERCIAL_MODEL,
        fetch: fetchFor(options.executionId),
      });
      providers.add(provider);
      return provider;
    },
    async authorizeRealProvider(received, current, provider) {
      if (
        received.tenantId !== owner.tenantId ||
        received.userId !== owner.userId ||
        digest(current) !== expected ||
        !providers.has(provider)
      )
        throw new Error('EDITORIAL_PROVIDER_NOT_ALLOWED');
      await assertContext(options.executionId);
    },
  };
}
