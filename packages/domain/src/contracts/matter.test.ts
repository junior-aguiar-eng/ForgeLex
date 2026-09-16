import { describe, expect, it } from 'vitest';
import { DocumentAnchorSchema, MatterSchema } from './matter.js';

describe('Matter e documentos forenses', () => {
  it('deve exigir tenant e preservar o status do matter', () => {
    const matter = MatterSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: 'tenant_a',
      title: 'Ação de responsabilidade civil',
      status: 'OPEN',
      createdBy: 'user_a',
      createdAt: '2026-09-16T12:00:00.000Z',
      updatedAt: '2026-09-16T12:00:00.000Z',
    });

    expect(matter.status).toBe('OPEN');
    expect(() => MatterSchema.parse({ ...matter, tenantId: '' })).toThrow();
  });

  it('deve validar âncoras como intervalos positivos da versão do documento', () => {
    const anchor = DocumentAnchorSchema.parse({
      id: '22222222-2222-4222-8222-222222222222',
      documentVersionId: '33333333-3333-4333-8333-333333333333',
      anchorKey: 'p1',
      anchorType: 'PARAGRAPH',
      ordinal: 0,
      startOffset: 0,
      endOffset: 18,
      text: 'Fato relevante.',
      contentHash: 'a'.repeat(64),
      createdAt: '2026-09-16T12:00:00.000Z',
    });

    expect(anchor.endOffset).toBeGreaterThan(anchor.startOffset);
  });
});
