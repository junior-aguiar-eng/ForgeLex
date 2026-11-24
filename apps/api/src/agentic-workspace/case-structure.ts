import { createHash } from 'node:crypto';
import { parseAttachmentBlocks } from '@forgelex/domain';
import type { CurrentStructureDeps, CurrentStructureExecution, CurrentStructureOwner } from './current-structure.js';

// E4: todas as análises de fatos e provas vivas do caso, para a estrutura somada. A mais nova de cada texto vence.
export interface CaseStructureExecution extends CurrentStructureExecution {
  conversationId: string;
  contextRevision: number;
  createdAt: string;
}
export interface CaseStructureDeps<E extends CaseStructureExecution = CaseStructureExecution> extends Omit<
  CurrentStructureDeps<E>,
  'store'
> {
  store: {
    workspace: {
      /** Conversations of this case only (hidden ones included), newest first, one page at a time. */
      listMatterConversations(
        owner: CurrentStructureOwner,
        matterId: string,
        page: { limit: number; offset: number; includeHidden?: boolean },
      ): Promise<Array<{ matterId?: string | null; execution: E }>>;
      getConversationReadOnly(
        owner: CurrentStructureOwner,
        id: string,
      ): Promise<{ contexts: Array<{ revision: number; text?: string }> } | undefined>;
    };
  };
}

export interface CaseStructureEntry {
  executionId: string;
  deliveryId: string;
  updatedAt: string;
  /** sha256 of the written context of the conversation: two analyses of the same text are one document. */
  contextTextHash: string;
  /** Code in the attachment header that groups the parts of one long PDF. */
  documentKey?: string;
  /** First attachment of the written context (name and, for a long PDF, which part and pages). */
  attachment?: {
    name: string;
    part?: { index: number; total: number; pageFrom?: number; pageTo?: number };
  };
}

const PAGE = 50;
const MAX_PAGES = 20;
export const MAX_CASE_ANALYSES = 60;

export async function findCaseStructure<E extends CaseStructureExecution>(
  deps: CaseStructureDeps<E>,
  owner: CurrentStructureOwner,
  matterId: string,
): Promise<CaseStructureEntry[]> {
  const byText = new Map<string, CaseStructureEntry & { createdAt: string }>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const conversations = await deps.store.workspace.listMatterConversations(owner, matterId, {
      limit: PAGE,
      offset: page * PAGE,
      includeHidden: true,
    });
    for (const conversation of conversations) {
      const execution = conversation.execution;
      if (conversation.matterId !== matterId || execution.status !== 'COMPLETED') continue;
      if (deps.manages && !deps.manages(execution)) continue;
      const deliveryId = execution.deliveryIds.at(-1);
      if (!deliveryId) continue;
      const delivery = await deps.native.getDelivery(owner, deliveryId);
      if (delivery.delivery.action !== 'analyze_evidence') continue;
      const stored = await deps.store.workspace.getConversationReadOnly(owner, execution.conversationId);
      const text = stored?.contexts.find((context) => context.revision === execution.contextRevision)?.text ?? '';
      const contextTextHash = createHash('sha256').update(text).digest('hex');
      const blocks = parseAttachmentBlocks(text);
      const documentKey = blocks.find((block) => block.part)?.part?.documentCode;
      const first = blocks[0];
      const attachment = first
        ? {
            name: first.name,
            ...(first.part
              ? {
                  part: {
                    index: first.part.index,
                    total: first.part.total,
                    ...(first.part.pageFrom !== undefined ? { pageFrom: first.part.pageFrom } : {}),
                    ...(first.part.pageTo !== undefined ? { pageTo: first.part.pageTo } : {}),
                  },
                }
              : {}),
          }
        : undefined;
      const entry = {
        executionId: execution.id,
        deliveryId,
        updatedAt: execution.updatedAt,
        createdAt: execution.createdAt,
        contextTextHash,
        ...(documentKey ? { documentKey } : {}),
        ...(attachment ? { attachment } : {}),
      };
      const known = byText.get(contextTextHash);
      if (!known || known.createdAt < entry.createdAt) byText.set(contextTextHash, entry);
    }
    if (conversations.length < PAGE) break;
  }
  return [...byText.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_CASE_ANALYSES)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(({ createdAt: _createdAt, ...entry }) => entry);
}
