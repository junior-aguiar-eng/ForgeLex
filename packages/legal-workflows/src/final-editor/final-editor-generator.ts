import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ToolRegistry, type AgentProvider } from '@forgelex/agent-core';
import type { AgenticOwner } from '@forgelex/domain';
import {
  FINAL_EDITOR_GENERATION_PROFILE,
  FinalEditorialProposalSchema,
  validateFinalEditorialProposal,
  type FinalEditorialContext,
  type FinalEditorialProposal,
} from '@forgelex/legal-agents';
import type { FinalEditorService } from './final-editor-service.js';

export interface FinalEditorGenerationOptions {
  /** Trusted server injection, never request data. Real providers also require authorization below. */
  createProvider: (input: {
    registry: ToolRegistry;
    context: FinalEditorialContext;
    sectionAnchors: { sectionIndex: number; sectionHash: string; utf16Length: number }[];
    profile: typeof FINAL_EDITOR_GENERATION_PROFILE;
  }) => AgentProvider;
  authorizeRealProvider?: (
    owner: AgenticOwner,
    context: FinalEditorialContext,
    provider: AgentProvider,
  ) => Promise<void>;
}

export class FinalEditorGenerator {
  constructor(
    private readonly editor: Pick<FinalEditorService, 'load'>,
    private readonly options?: FinalEditorGenerationOptions,
  ) {}

  async generate(
    owner: AgenticOwner,
    deliveryId: string,
    target: { draftId: string; versionId: string },
    signal?: AbortSignal,
  ) {
    if (!this.options) throw new Error('EDITORIAL_GENERATION_DISABLED');
    if (signal?.aborted) throw new Error('EDITORIAL_GENERATION_CANCELLED');
    const profile = FINAL_EDITOR_GENERATION_PROFILE;
    const controller = new AbortController(),
      sessionId = randomUUID();
    let closed = false,
      provider: AgentProvider | undefined,
      authorizedProvider = false;
    let rejectStop!: (reason: Error) => void;
    const stopped = new Promise<never>((_resolve, reject) => {
      rejectStop = reject;
    });
    const stop = (code: string) => {
      closed = true;
      controller.abort();
      rejectStop(new Error(code));
    };
    const onAbort = () => stop('EDITORIAL_GENERATION_CANCELLED');
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => stop('EDITORIAL_GENERATION_TIMEOUT'), profile.maxDurationMs);
    const assertOpen = () => {
      if (closed || controller.signal.aborted) throw new Error('EDITORIAL_GENERATION_CANCELLED');
    };
    const work = async () => {
      const context = await this.editor.load(owner, deliveryId, target);
      assertOpen();
      const original = JSON.stringify(context);
      const sectionAnchors = context.document.sections.map((section, sectionIndex) => ({
        sectionIndex,
        sectionHash: createHash('sha256').update(section.content, 'utf8').digest('hex'),
        utf16Length: section.content.length,
      }));
      const prompt = JSON.stringify({ context, sectionAnchors });
      if (Buffer.byteLength(prompt, 'utf8') + Buffer.byteLength(profile.instructions, 'utf8') > profile.maxPromptBytes)
        throw new Error('EDITORIAL_CONTEXT_LIMIT');
      let proposal: FinalEditorialProposal | undefined,
        submissions = 0,
        attempts = 0,
        submissionRejected = false;
      const registry = new (class extends ToolRegistry {
        override async executeTool(...args: Parameters<ToolRegistry['executeTool']>) {
          try {
            assertOpen();
            // Count before schema validation, including rejected or swallowed attempts.
            if (++attempts > 1 || submissions > 0) throw new Error('EDITORIAL_GENERATION_FAILED');
            return await super.executeTool(...args);
          } catch (error) {
            submissionRejected = true;
            throw error;
          }
        }
      })();
      registry.register({
        name: 'editorial.submit',
        description: 'Entrega uma proposta editorial; não aplica alterações nem aprova conteúdo.',
        impactLevel: 'L0_OBSERVATION',
        inputSchema: FinalEditorialProposalSchema,
        outputSchema: z.strictObject({ accepted: z.literal(true) }),
        execute: async (input) => {
          assertOpen();
          if (++submissions > 1 || Buffer.byteLength(JSON.stringify(input), 'utf8') > profile.maxProposalBytes)
            throw new Error('EDITORIAL_GENERATION_FAILED');
          proposal = validateFinalEditorialProposal(context, input);
          return { success: true, data: { accepted: true as const } };
        },
      });
      try {
        provider = this.options!.createProvider({
          registry,
          context: structuredClone(context),
          sectionAnchors: structuredClone(sectionAnchors),
          profile,
        });
      } catch {
        throw new Error('EDITORIAL_GENERATION_FAILED');
      }
      if (provider.id !== 'fake') {
        if (provider.id !== 'openai' || !this.options?.authorizeRealProvider)
          throw new Error('EDITORIAL_PROVIDER_NOT_ALLOWED');
        await this.options.authorizeRealProvider(owner, structuredClone(context), provider);
      }
      authorizedProvider = true;
      if (registry.list().length !== 1) throw new Error('EDITORIAL_GENERATION_FAILED');
      assertOpen();
      let events = 0,
        toolCalls = 0;
      try {
        for await (const event of provider.run({
          ...owner,
          sessionId,
          prompt,
          systemPolicy: profile.instructions,
          // Real SDKs own another registry. Route execution back through our attempt counter.
          tools: registry.list().map((tool) => ({
            ...tool,
            execute: (input, toolContext) => registry.executeTool(tool.name, input, toolContext),
          })),
          maxTurns: profile.maxTurns,
          finishOnTools: ['editorial.submit'],
          abortSignal: controller.signal,
        })) {
          assertOpen();
          if (
            ++events > profile.maxEvents ||
            event.type === 'error' ||
            event.type === 'tool:waiting_approval' ||
            event.type === 'tool:rejected'
          )
            throw new Error('EDITORIAL_GENERATION_FAILED');
          if (event.type === 'tool:invoked' && (event.toolName !== 'editorial.submit' || ++toolCalls > 1))
            throw new Error('EDITORIAL_GENERATION_FAILED');
          if (proposal) break;
        }
        if (!proposal || submissions !== 1 || attempts !== 1 || submissionRejected)
          throw new Error('EDITORIAL_GENERATION_FAILED');
      } catch {
        throw new Error('EDITORIAL_GENERATION_FAILED');
      }
      assertOpen();
      const current = await this.editor.load(owner, deliveryId, target);
      assertOpen();
      if (submissions !== 1 || attempts !== 1 || submissionRejected) throw new Error('EDITORIAL_GENERATION_FAILED');
      if (JSON.stringify(current) !== original) throw new Error('EDITORIAL_CONTEXT_CHANGED');
      return {
        mode: provider.id === 'fake' ? ('SIMULATED' as const) : ('REAL' as const),
        profileVersion: profile.version,
        proposal: validateFinalEditorialProposal(current, proposal),
      };
    };
    try {
      return await Promise.race([work(), stopped]);
    } finally {
      closed = true;
      controller.abort();
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      // A non-cooperative cancel must not extend the request deadline.
      if (provider && authorizedProvider)
        void Promise.resolve()
          .then(() => provider!.cancel(sessionId))
          .catch(() => {});
    }
  }
}
