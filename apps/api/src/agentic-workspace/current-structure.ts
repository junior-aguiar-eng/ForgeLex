// Localiza a análise de fatos e provas (analyze_evidence) concluída mais recente de um caso, no recorte das conversas
// do próprio usuário. Ponto único: a rota de estrutura e os ajustes por conversa usam o mesmo critério de "vigente".
export interface CurrentStructureOwner {
  tenantId: string;
  userId: string;
}

export interface CurrentStructureExecution {
  id: string;
  status: string;
  updatedAt: string;
  deliveryIds: readonly string[];
}

export interface CurrentStructureDeps<E extends CurrentStructureExecution = CurrentStructureExecution> {
  store: {
    workspace: {
      /** Conversations of this case only, newest first, one page at a time (each with its newest execution). */
      listMatterConversations(
        owner: CurrentStructureOwner,
        matterId: string,
        page: { limit: number; offset: number },
      ): Promise<Array<{ matterId?: string | null; execution: E }>>;
    };
  };
  native: {
    getDelivery(owner: CurrentStructureOwner, deliveryId: string): Promise<{ delivery: { action: string } }>;
  };
  manages?: (execution: E) => boolean;
}

export interface CurrentStructure {
  executionId: string;
  deliveryId: string;
  updatedAt: string;
  /** The analysis the current one replaced, if any: its corrections made through the conversation were not carried over. */
  previousDeliveryId?: string;
}

/** Page size and the per-case bound of the scan (every correction opens a conversation of its own). */
const PAGE = 50;
const MAX_PAGES = 20;

export async function findCurrentStructure<E extends CurrentStructureExecution>(
  deps: CurrentStructureDeps<E>,
  owner: CurrentStructureOwner,
  matterId: string,
): Promise<CurrentStructure | null> {
  const found: Array<{ executionId: string; deliveryId: string; updatedAt: string }> = [];
  for (let page = 0; page < MAX_PAGES && found.length < 2; page++) {
    const conversations = await deps.store.workspace.listMatterConversations(owner, matterId, {
      limit: PAGE,
      offset: page * PAGE,
    });
    const ordered = [...conversations].sort((a, b) => b.execution.updatedAt.localeCompare(a.execution.updatedAt));
    for (const conversation of ordered) {
      if (found.length >= 2) break;
      const execution = conversation.execution;
      if (conversation.matterId !== matterId || execution.status !== 'COMPLETED') continue;
      if (deps.manages && !deps.manages(execution)) continue;
      const deliveryId = execution.deliveryIds.at(-1);
      if (!deliveryId) continue;
      const delivery = await deps.native.getDelivery(owner, deliveryId);
      if (delivery.delivery.action !== 'analyze_evidence') continue;
      found.push({ executionId: execution.id, deliveryId, updatedAt: execution.updatedAt });
    }
    if (conversations.length < PAGE) break;
  }
  found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [current, previous] = found;
  if (!current) return null;
  return { ...current, ...(previous ? { previousDeliveryId: previous.deliveryId } : {}) };
}
