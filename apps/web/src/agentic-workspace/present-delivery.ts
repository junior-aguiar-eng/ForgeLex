import type { Delivery, Source } from './execution-model';

export interface PresentedSource {
  n: number;
  id: string;
  kind: string;
  label: string;
  source: Source;
}
export interface PresentedBlock {
  kind: 'heading' | 'paragraph' | 'item';
  text: string;
  tag?: string;
  /** Source numbers cited by this block, in first-appearance order. */
  citations: number[];
}
export interface PresentedDelivery {
  title: string;
  isDocument: boolean;
  blocks: PresentedBlock[];
  sources: PresentedSource[];
  /** Plain-language points the lawyer must check. Never internal codes. */
  pending: string[];
}

const KIND_LABEL: Record<string, string> = {
  USER_TEXT: 'Contexto escrito',
  DOCUMENT: 'Documento do caso',
  DRAFT: 'Minuta do caso',
  ANSWER: 'Sua resposta',
  AUTHORITY: 'Jurisprudência',
  NORM: 'Norma',
  PREVIOUS_DELIVERY: 'Trabalho anterior',
};
const TITLE: Record<string, string> = {
  analyze_documents: 'Análise dos documentos',
  research_question: 'Pesquisa',
  review_text: 'Revisão do texto',
};
const CLAIM_TAG: Record<string, string> = { ALLEGATION: 'Alegação', CONFLICT: 'Conflito', INFERENCE: 'Inferência' };

/** Fixed wording for the limitations the workflow itself raises. Others keep the statement they carry. */
const LIMITATION_TEXT: Record<string, string> = {
  SEARCH_NO_RESULTS: 'A pesquisa não retornou resultados. Isso não prova que não existam decisões sobre o tema.',
  AUTHORITY_UNCONFIRMED: 'Não foi possível confirmar a identidade de uma decisão citada.',
  SOURCE_UNAVAILABLE: 'Uma fonte não pôde ser consultada. Isso não equivale a uma pesquisa sem resultados.',
  CONFLICT_UNRESOLVED: 'Há divergência entre as fontes que permanece sem resolução.',
  REQUIRED_RESEARCH_NOT_PERFORMED: 'A pesquisa de jurisprudência necessária não foi feita neste trabalho.',
  NORMATIVE_SOURCE_MISSING: 'Não foi encontrada fonte normativa para o ponto solicitado.',
  AUTHORITY_IDENTITY_UNCONFIRMED: 'Uma decisão citada vem só do índice e não foi conferida na origem.',
  CITATION_WITHOUT_SUPPORT: 'Uma fonte citada não demonstra, por si só, a afirmação feita.',
  PROCEDURAL_REQUIREMENTS_NOT_EVALUATED: 'Não avaliei os requisitos processuais; o texto é preliminar.',
  LEGAL_APPLICABILITY_NOT_EVALUATED: 'Texto de lei citado: a vigência e a aplicação ao caso dependem da sua avaliação.',
  AUTHORITY_SCOPE_LIMIT: 'Ementa e metadados não substituem o inteiro teor da decisão.',
  DOCUMENT_NOT_PRODUCED: 'Não foi possível produzir uma minuta.',
  DOCUMENT_TYPE_UNCONFIRMED: 'O tipo de peça e o seu cabimento não foram confirmados.',
};
const PREFIXED: Record<string, string> = {
  UNSUPPORTED_CLAIM: 'Afirmação sem fonte indicada: ',
  PROCEDURAL_REQUIREMENT_UNVERIFIED: 'Requisito não verificado: ',
  EDITORIAL_REQUIREMENT_UNVERIFIED: 'Requisito de forma não verificado: ',
};
const codeOf = (f: { id: string; code?: string }) => f.code ?? f.id.split(':')[0];

export function presentDelivery(delivery: Delivery['delivery']): PresentedDelivery {
  const known = new Map<string, Source>();
  for (const source of delivery.sources) if (source.id) known.set(source.id, source);
  const order: string[] = [];
  const cite = (ids: string[]) => {
    const numbers: number[] = [];
    for (const id of new Set(ids)) {
      if (!known.has(id)) continue;
      let index = order.indexOf(id);
      if (index < 0) index = order.push(id) - 1;
      numbers.push(index + 1);
    }
    return numbers;
  };
  const blocks: PresentedBlock[] = [];
  const doc = delivery.document;
  if (doc) {
    for (const section of doc.sections) {
      blocks.push({ kind: 'heading', text: section.title, citations: [] });
      blocks.push({ kind: 'paragraph', text: section.content, citations: cite(section.sourceIds) });
    }
  } else {
    if (delivery.issues.length) {
      blocks.push({ kind: 'heading', text: 'Questões', citations: [] });
      for (const issue of delivery.issues)
        blocks.push({ kind: 'item', text: issue.statement, citations: cite(issue.sourceIds) });
    }
    if (delivery.claims.length) {
      blocks.push({ kind: 'heading', text: 'Afirmações', citations: [] });
      for (const claim of delivery.claims)
        blocks.push({
          kind: 'item',
          text: claim.statement,
          tag: CLAIM_TAG[claim.classification] ?? 'Inferência',
          citations: cite(claim.sourceIds),
        });
    }
  }
  for (const source of delivery.sources) if (source.id) cite([source.id]);
  const sources = order.map((id, i) => {
    const source = known.get(id)!;
    return { n: i + 1, id, kind: source.kind, label: KIND_LABEL[source.kind] ?? 'Fonte', source };
  });

  const pending: string[] = [];
  const add = (text: string) => {
    if (text && !pending.includes(text)) pending.push(text);
  };
  const unsupportedSections: string[] = [];
  for (const finding of delivery.findings) {
    const code = codeOf(finding);
    if (code === 'UNSUPPORTED_SECTION') unsupportedSections.push(finding.statement);
    else if (LIMITATION_TEXT[code]) add(LIMITATION_TEXT[code]);
    else add((PREFIXED[code] ?? '') + finding.statement);
  }
  if (unsupportedSections.length)
    add(
      unsupportedSections.length === 1
        ? `A seção “${unsupportedSections[0]}” não tem fonte indicada.`
        : `As seções ${unsupportedSections.map((s) => `“${s}”`).join(', ')} não têm fonte indicada.`,
    );
  for (const requirement of delivery.requirements)
    if (!requirement.verified) add(`Requisito não verificado: ${requirement.statement}`);
  return {
    // A deliverable promised as a draft but produced without a document is a gap analysis, never a "minuta".
    title:
      doc?.title ??
      (delivery.action === 'create_document'
        ? 'Análise de lacunas e limites'
        : (TITLE[delivery.action] ?? 'Resultado')),
    isDocument: Boolean(doc),
    blocks,
    sources,
    pending,
  };
}

/** The delivery as plain text for the clipboard: no citation markers, no panel content. */
export function deliveryPlainText(view: PresentedDelivery): string {
  return [
    view.title,
    ...view.blocks.map((b) => (b.kind === 'heading' ? `\n${b.text}` : b.tag ? `${b.tag}: ${b.text}` : b.text)),
  ]
    .join('\n')
    .trim();
}
