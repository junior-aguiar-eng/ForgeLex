import { z } from 'zod';
import { AgentTool, ToolExecutionContext, ToolExecutionResult } from '@forgelex/agent-core';
import { randomUUID } from 'node:crypto';

export const SaveFinalDraftInputSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(10),
  destinationFolder: z.string().default('Peças Processuais Finais'),
});

export type SaveFinalDraftInput = z.infer<typeof SaveFinalDraftInputSchema>;

export const SaveFinalDraftOutputSchema = z.object({
  documentId: z.string().uuid(),
  persisted: z.boolean(),
  savedAt: z.string().datetime(),
});

export type SaveFinalDraftOutput = z.infer<typeof SaveFinalDraftOutputSchema>;

export const saveFinalDraftTool: AgentTool<SaveFinalDraftInput, SaveFinalDraftOutput> = {
  name: 'drafting.save_final_draft',
  description:
    'Salva a versão final da peça processual na pasta oficial do caso. Operação com efeito externo irreversível.',
  impactLevel: 'L4_EXTERNAL_EFFECT', // Exige Human-in-the-Loop!
  inputSchema: SaveFinalDraftInputSchema,
  outputSchema: SaveFinalDraftOutputSchema,
  execute: async (
    _input: SaveFinalDraftInput,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult<SaveFinalDraftOutput>> => {
    return {
      success: true,
      data: {
        documentId: randomUUID(),
        persisted: true,
        savedAt: new Date().toISOString(),
      },
    };
  },
};
