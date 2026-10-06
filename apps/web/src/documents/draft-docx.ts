import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

export interface SavedDraftExport {
  title: string;
  version: { id: string; versionNumber: number; contentHash: string; status: string; createdAt: string };
  sections: Array<{ id: string; ordinal: number; title: string; content: string }>;
  citations: Array<{ sectionId: string; citationText: string; verified: boolean }>;
  documentReferences?: Array<{reference:{sectionOrdinal:number;citationText?:string};documentTitle?:string;versionNumber?:number;available:boolean;anchor?:{text:string}}>;
}

const statusLabels: Record<string, string> = {
  DRAFT: 'Rascunho', IN_REVIEW: 'Em revisão', APPROVAL_PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovado', REJECTED: 'Rejeitado', ARCHIVED: 'Arquivado',
};

export function draftDocxFilename(title: string, versionNumber: number): string {
  const printable = [...title].map((character) => character.charCodeAt(0) < 32 ? ' ' : character).join('');
  const name = printable.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 120).trim() || 'Rascunho';
  return `${name}-v${versionNumber}.docx`;
}

export async function buildDraftDocx(saved: SavedDraftExport): Promise<Blob> {
  const version = saved.version;
  const paragraphs: Paragraph[] = [
    new Paragraph({ text: saved.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Versão ${version.versionNumber} · ${statusLabels[version.status] ?? version.status}` }),
  ];
  if (version.status !== 'APPROVED') {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: 'Documento pendente de revisão humana antes do uso profissional.', bold: true })] }));
  }
  for (const section of [...saved.sections].sort((a, b) => a.ordinal - b.ordinal)) {
    paragraphs.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
    for (const line of section.content.split(/\r?\n/)) paragraphs.push(new Paragraph({ text: line }));
  }
  if (saved.citations.length || saved.documentReferences?.length) {
    paragraphs.push(new Paragraph({ text: 'Referências da versão', heading: HeadingLevel.HEADING_1 }));
    for (const citation of saved.citations) {
      const title = saved.sections.find((section) => section.id === citation.sectionId)?.title ?? 'Seção não identificada';
      paragraphs.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_2 }));
      paragraphs.push(new Paragraph({ text: `${citation.citationText} · ${citation.verified ? 'Verificada' : 'Pendente de conferência'}` }));
    }
    for(const document of saved.documentReferences??[]){
      const section=saved.sections.find(s=>s.ordinal===document.reference.sectionOrdinal);
      paragraphs.push(new Paragraph({text:section?.title??'Seção não identificada',heading:HeadingLevel.HEADING_2}));
      paragraphs.push(new Paragraph({text:`${document.documentTitle??'Documento indisponível'} · versão ${document.versionNumber??'indisponível'} · Pendente de conferência`}));
      if(document.reference.citationText)paragraphs.push(new Paragraph({text:document.reference.citationText}));
      if(document.anchor?.text)paragraphs.push(new Paragraph({text:document.anchor.text}));
    }
  }
  paragraphs.push(new Paragraph({ text: 'Registro da versão salva', heading: HeadingLevel.HEADING_1 }));
  for (const line of [`Versão: ${version.id}`, `Registrada em: ${version.createdAt}`, `Hash do conteúdo: ${version.contentHash}`]) paragraphs.push(new Paragraph({ text: line }));
  return Packer.toBlob(new Document({
    title: saved.title,
    creator: 'ForgeLex',
    description: `Versão salva ${version.versionNumber}`,
    styles: { default: { document: { run: { font: 'Arial', size: 24 }, paragraph: { spacing: { after: 160 } } } } },
    sections: [{ children: paragraphs }],
  }));
}

export async function downloadDraftDocx(saved: SavedDraftExport): Promise<void> {
  const blob = await buildDraftDocx(saved);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = draftDocxFilename(saved.title, saved.version.versionNumber);
  document.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    // Allow the browser to start the download before releasing the Blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
