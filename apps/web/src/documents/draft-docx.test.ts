import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDraftDocx, draftDocxFilename } from './draft-docx';

describe('saved draft DOCX', () => {
  it('inclui a versão documental fixada sem afirmar conferência humana', async () => {
    const blob=await buildDraftDocx({title:'Texto recebido',version:{id:'v',versionNumber:1,contentHash:'h',status:'DRAFT',createdAt:'2026-10-06T10:00:00.000Z'},sections:[{id:'s',ordinal:7,title:'Fatos',content:'Texto'}],citations:[],documentReferences:[{reference:{sectionOrdinal:7,citationText:'Cláusula contratual'},documentTitle:'Contrato selecionado',versionNumber:2,available:true,anchor:{text:'Trecho da versão original'}}]});
    const zip=await JSZip.loadAsync(await blob.arrayBuffer());const xml=await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Contrato selecionado · versão 2');expect(xml).toContain('Cláusula contratual');expect(xml).toContain('Pendente de conferência');
  });
  it('produces OOXML with ordered sections, escaped text, version identity and citation verification', async () => {
    const blob = await buildDraftDocx({
      title: 'Petição & obrigação',
      version: { id: 'version-1', versionNumber: 3, contentHash: 'hash-saved', status: 'DRAFT', createdAt: '2026-10-02T12:00:00Z' },
      sections: [{ id: 'b', ordinal: 2, title: 'Pedidos', content: 'Pagamento < integral >.' }, { id: 'a', ordinal: 0, title: 'Fatos', content: 'Obrigação contratual.\nSegunda linha.' }],
      citations: [{ sectionId: 'a', citationText: 'REsp conferido', verified: true }, { sectionId: 'b', citationText: 'Documento a conferir', verified: false }],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.indexOf('Fatos')).toBeLessThan(xml.indexOf('Pedidos'));
    expect(xml).toContain('Petição &amp; obrigação');
    expect(xml).toContain('Pagamento &lt; integral &gt;.');
    expect(xml).toContain('Segunda linha.');
    expect(xml).toContain('Versão 3');
    expect(xml).toContain('hash-saved');
    expect(xml).toContain('Rascunho');
    expect(xml).toContain('revisão humana');
    expect(xml).toContain('REsp conferido · Verificada');
    expect(xml).toContain('Documento a conferir · Pendente de conferência');
  });

  it('labels the stored approved status without a pending-review warning', async () => {
    const blob = await buildDraftDocx({ title: 'Peça', version: { id: 'v', versionNumber: 1, contentHash: 'h', status: 'APPROVED', createdAt: '2026-10-02T12:00:00Z' }, sections: [], citations: [] });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Aprovado');
    expect(xml).not.toContain('pendente de revisão humana');
  });

  it('keeps Portuguese filenames while removing Windows path characters', () => {
    expect(draftDocxFilename('Petição inicial', 1)).toBe('Petição inicial-v1.docx');
    expect(draftDocxFilename('  Pedido: A/B?  ', 2)).toBe('Pedido A B-v2.docx');
    expect(draftDocxFilename('...', 4)).toBe('Rascunho-v4.docx');
  });
});
