import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('limites de coleções antes da validação de elementos', () => {
  it('rejeita uma lista acima do limite sem acumular um erro por elemento', () => {
    const schema = z.array(z.object({ value: z.string() })).max(2);
    const result = schema.safeParse(Array.from({ length: 10_000 }, () => ({ value: 0 })));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]).toMatchObject({ code: 'too_big', maximum: 2 });
    }
    expect(schema.parse([{ value: 'válido' }])).toEqual([{ value: 'válido' }]);
    expect(schema.safeParse([{ value: 0 }]).success).toBe(false);
  });
});
