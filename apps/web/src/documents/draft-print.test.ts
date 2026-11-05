import { describe, expect, it } from 'vitest';
import { draftPrintHtml } from './draft-print';

describe('impressão da peça', () => {
  it('preserva Unicode, ordem e referências e escapa HTML do conteúdo', () => {
    const html = draftPrintHtml({
      title: 'Petição & revisão',
      version: { id: 'local', versionNumber: 1, contentHash: '', status: 'DRAFT', createdAt: '' },
      sections: [
        { id: 'b', ordinal: 2, title: 'Pedidos', content: '<script>alert("x")</script>' },
        { id: 'a', ordinal: 0, title: 'Fatos', content: 'Obrigação\nSegunda linha' },
      ],
      citations: [{ sectionId: 'a', citationText: 'Fonte <não conferida>', verified: false }],
      documentReferences: [
        {
          reference: { sectionOrdinal: 0, citationText: 'Cláusula contratual' },
          documentTitle: 'Contrato',
          available: true,
        },
      ],
    });
    expect(html).toContain('Petição &amp; revisão');
    expect(html).toContain('Obrigação\nSegunda linha');
    expect(html.indexOf('<h2>Fatos')).toBeLessThan(html.indexOf('<h2>Pedidos'));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Fonte &lt;não conferida&gt;');
    expect(html).toContain('Cláusula contratual');
    expect(html).toContain('Documento pendente de revisão humana');
    expect(html).toContain('@page{size:A4');
  });
});
