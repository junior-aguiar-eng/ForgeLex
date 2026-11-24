import { z } from 'zod';

/**
 * E4: o que a análise identificou do documento analisado: tipo da peça e partes. Cada parte traz a citação literal do
 * texto de onde saiu; o servidor confere a citação contra a fonte e preenche `quoteStatus`.
 */
export const DocumentProfileSchema = z.strictObject({
  pieceType: z.string().trim().min(1).max(120).optional(),
  pieceTypeCertainty: z.enum(['IDENTIFICADA', 'INCERTA']),
  parties: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(200),
        role: z.string().trim().min(1).max(80),
        sourceId: z.string().min(1).max(200),
        start: z.number().int().nonnegative(),
        quote: z.string().min(1).max(400),
        quoteStatus: z.enum(['MATCHED', 'MISMATCH']).optional(),
      }),
    )
    .max(10),
});
export type DocumentProfile = z.infer<typeof DocumentProfileSchema>;
