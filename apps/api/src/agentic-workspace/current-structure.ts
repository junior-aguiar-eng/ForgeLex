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
      listRecentConversations(
        owner: CurrentStructureOwner,
        limit: number,
        trash: boolean,
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
}

export async function findCurrentStructure<E extends CurrentStructureExecution>(
  deps: CurrentStructureDeps<E>,
  owner: CurrentStructureOwner,
  matterId: string,
): Promise<CurrentStructure | null> {
  const conversations = await deps.store.workspace.listRecentConversations(owner, 50, false);
  for (const conversation of conversations) {
    const execution = conversation.execution;
    if (conversation.matterId !== matterId || execution.status !== 'COMPLETED') continue;
    if (deps.manages && !deps.manages(execution)) continue;
    const deliveryId = execution.deliveryIds.at(-1);
    if (!deliveryId) continue;
    const found = await deps.native.getDelivery(owner, deliveryId);
    if (found.delivery.action !== 'analyze_evidence') continue;
    return { executionId: execution.id, deliveryId, updatedAt: execution.updatedAt };
  }
  return null;
}
