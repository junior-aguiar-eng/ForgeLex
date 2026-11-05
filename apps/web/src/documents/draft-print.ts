import type { SavedDraftExport } from './draft-docx';

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function draftPrintHtml(draft: SavedDraftExport): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(draft.title)}</title><style>
  @page{size:A4;margin:24mm}body{font:12pt/1.6 Georgia,serif;color:#171717;max-width:170mm;margin:24mm auto}h1{font-size:22pt}h2{font-size:14pt;break-after:avoid}p{white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}.notice{font:10pt/1.5 system-ui;color:#555}button{padding:12px 18px;cursor:pointer}@media print{body{margin:0;max-width:none}button{display:none}}
  </style></head><body><button onclick="window.print()">Salvar como PDF ou imprimir</button><h1>${escape(draft.title)}</h1>
  ${draft.version.status !== 'APPROVED' ? '<p class="notice">Documento pendente de revisão humana antes do uso profissional.</p>' : ''}
  ${[...draft.sections]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((s) => `<section><h2>${escape(s.title)}</h2><p>${escape(s.content)}</p></section>`)
    .join('')}
  ${draft.citations.length ? `<h2>Referências</h2>${draft.citations.map((c) => `<p>${escape(c.citationText)} — ${c.verified ? 'Verificada' : 'Pendente de conferência'}</p>`).join('')}` : ''}
  ${(draft.documentReferences ?? []).map((r) => `<p>${escape(r.documentTitle ?? 'Documento')} — ${escape(r.reference.citationText ?? r.anchor?.text ?? '')}</p>`).join('')}
  </body></html>`;
}

export function printDraftPdf(draft: SavedDraftExport): void {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Permita abrir a janela de impressão para salvar o PDF.');
  popup.opener = null;
  popup.document.open();
  popup.document.write(draftPrintHtml(draft));
  popup.document.close();
  popup.focus();
  popup.print();
}
