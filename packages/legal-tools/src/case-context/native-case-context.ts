import { NativeCaseTaskRepository } from '@forgelex/persistence';
import { z } from 'zod';
import type { AgentTool } from '@forgelex/agent-core';
import { TaskSourceSchema, type TaskBinding, type TaskSource } from '@forgelex/domain';
/** Native context boundary over shared persistence/selection; no synthetic OAuth identity. */
export class NativeCaseContextService extends NativeCaseTaskRepository {}
export type { AuthorizeNativeTask } from '@forgelex/persistence';
export function createNativeSelectedSourceTool(
  service: NativeCaseContextService,
  binding: TaskBinding,
): AgentTool<{ id: string }, TaskSource> {
  return {
    name: 'case.read_selected',
    description:
      'Lê somente uma fonte da seleção nativa já autorizada para esta execução; IDs fora do snapshot são rejeitados.',
    impactLevel: 'L0_OBSERVATION',
    inputSchema: z.strictObject({ id: z.string().min(1).max(200) }),
    outputSchema: TaskSourceSchema,
    execute: async ({ id }) => {
      const packet = await service.load(binding);
      const source = packet.sources.find((s) => s.id === id);
      if (!source) throw new Error('SOURCE_NOT_SELECTED');
      return { success: true, data: source };
    },
  };
}
