export type ActionId = 'analyze_documents' | 'research_question' | 'create_document' | 'review_text';
export interface Question {
  id: string;
  version: number;
  contextRevision: number;
  prompt: string;
  selection: 'single' | 'multiple' | 'free_text';
  options: { id: string; label: string }[];
  allowFreeText: boolean;
  allowUnknown: boolean;
  reason: string;
}
export interface Answer {
  questionId: string;
  questionVersion: number;
  contextRevision: number;
  selectedOptionIds: string[];
  freeText?: string;
  unknown?: boolean;
}
export interface Context {
  text: string;
  origin: 'USER' | 'DOCUMENT' | 'MIXED';
  documents: { documentId: string; versionId: string }[];
  answers?: Answer[];
  draft?: { draftId: string; versionId: string };
}
export interface Message {
  id: string;
  role: string;
  text?: string;
  question?: Question;
  answer?: Answer;
  createdAt: string;
}
export interface Execution {
  id: string;
  objective: string;
  actionId: ActionId | null;
  conversationId: string;
  matterId: string | null;
  contextRevision: number;
  status: string;
  deliveryIds: string[];
  question: Question | null;
  requiresReevaluation: boolean;
  currentExecutionId?: string | null;
  successorId: string | null;
  context: Context;
  messages: Message[];
  permissions?: { editDraft: boolean };
  history?: { executionId: string; deliveryIds: string[]; createdAt: string }[];
}
export interface PublicAction {
  id: ActionId;
  label: string;
  dialogue: { prompt: string; options: string[] }[];
}
export interface Source {
  id?: string;
  kind: string;
  documentId?: string;
  versionId?: string;
  url?: string;
  contentHash?: string;
  extent?: string;
  identityStatus?: string;
}
export interface Delivery {
  id: string;
  draftId?: string;
  versionId?: string;
  delivery: {
    action: ActionId;
    status: string;
    humanReviewRequired: true;
    legalAssessment: string;
    issues: { id: string; statement: string; sourceIds: string[] }[];
    claims: { id: string; statement: string; classification: string; sourceIds: string[] }[];
    requirements: { id: string; statement: string; verified: boolean; sourceIds: string[] }[];
    findings: { id: string; statement: string; severity: string; sourceIds: string[] }[];
    sources: Source[];
    document?: {
      title: string;
      documentType: string;
      sections: { title: string; content: string; sourceIds: string[] }[];
    };
  };
}
export interface EventState {
  executionId: string;
  cursor: number;
  status: string;
  deliveryIds: string[];
  question: Question | null;
  error: string;
  reconciliation: boolean;
}
export const emptyEvents = (executionId: string): EventState => ({
  executionId,
  cursor: 0,
  status: '',
  deliveryIds: [],
  question: null,
  error: '',
  reconciliation: false,
});
export function applyEvent(state: EventState, raw: unknown): EventState {
  const e = raw as { executionId?: string; sequence?: number; type?: string; payload?: Record<string, unknown> };
  if (
    !e ||
    e.executionId !== state.executionId ||
    !Number.isSafeInteger(e.sequence) ||
    e.sequence! <= state.cursor ||
    !e.payload
  )
    return state;
  const next = { ...state, cursor: e.sequence! };
  if (e.type === 'STATUS' && typeof e.payload.status === 'string') {
    next.status = e.payload.status;
    if (next.status !== 'WAITING_USER') next.question = null;
  }
  if (e.type === 'QUESTION') next.question = e.payload.question as Question;
  if (e.type === 'DELIVERY' && typeof e.payload.deliveryId === 'string')
    next.deliveryIds = [...new Set([...state.deliveryIds, e.payload.deliveryId])];
  if (e.type === 'ERROR' && typeof e.payload.code === 'string') {
    next.error = e.payload.reason === 'BUDGET_EXHAUSTED' ? 'BUDGET_EXHAUSTED' : e.payload.code;
    next.reconciliation = state.reconciliation || e.payload.code === 'RECONCILIATION_REQUIRED';
  }
  return next;
}
export function parseEventFrames(input: string): { events: unknown[]; rest: string; error?: string } {
  const normalized = input.replace(/\r\n/g, '\n'),
    frames = normalized.split('\n\n'),
    rest = frames.pop()!;
  const events: unknown[] = [];
  let error: string | undefined;
  for (const frame of frames) {
    const data = frame
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    try {
      const parsed = JSON.parse(data);
      if (frame.split('\n').includes('event: error') && parsed.code) error = String(parsed.code);
      else events.push(parsed);
    } catch {
      error = 'EXECUTION_UNAVAILABLE';
    }
  }
  return { events, rest, error };
}
export function answerFor(q: Question, selected: string[], text: string, unknown: boolean): Answer | null {
  const base = {
    questionId: q.id,
    questionVersion: q.version,
    contextRevision: q.contextRevision,
    selectedOptionIds: [] as string[],
  };
  if (unknown) return q.allowUnknown ? { ...base, unknown: true } : null;
  if (
    selected.some((id) => !q.options.some((o) => o.id === id)) ||
    (q.selection === 'single' && selected.length > 1) ||
    (!q.allowFreeText && text.trim()) ||
    (q.selection === 'free_text' && selected.length)
  )
    return null;
  if (!selected.length && !text.trim()) return null;
  return { ...base, selectedOptionIds: selected, ...(text.trim() ? { freeText: text.trim() } : {}) };
}
export function sourceLink(
  source: Source,
  matterId: string | null,
): string | { matterId: string; documentId: string; versionId: string } | null {
  if (source.kind === 'DOCUMENT' && matterId && source.documentId && source.versionId)
    return { matterId, documentId: source.documentId, versionId: source.versionId };
  try {
    const url = new URL(source.url ?? '');
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
export function statusText(status: string, code = ''): string {
  if (/BUDGET|BALANCE|FUNDS/.test(code))
    return 'O orçamento disponível não permite continuar. Seu texto foi preservado.';
  if (/ACCESS_REVOKED|NOT_FOUND/.test(code))
    return 'O acesso ao contexto mudou. Confira as fontes autorizadas; seu texto foi preservado.';
  return (
    (
      {
        QUEUED: 'Aguardando processamento',
        RUNNING: 'Processando seu pedido',
        WAITING_USER: 'Precisamos de uma informação',
        COMPLETED: 'Trabalho concluído — entrega preliminar',
        FAILED: 'Não foi possível concluir o trabalho',
        CANCELLED: 'Processamento interrompido',
      } as Record<string, string>
    )[status] ?? 'Preparar trabalho'
  );
}
export function editorLink(run: Execution, delivery: Delivery): string | null {
  if (run.permissions?.editDraft === false) return null;
  if (!delivery.delivery.document) return null;
  if (!run.matterId)
    return `/app/rascunhos?${new URLSearchParams({ deliveryId: delivery.id, returnExecution: run.id })}`;
  if (!delivery.draftId || !delivery.versionId) return null;
  const query = new URLSearchParams({
    matterId: run.matterId,
    draftId: delivery.draftId,
    versionId: delivery.versionId,
    returnExecution: run.id,
  });
  return `/app/rascunhos?${query}`;
}
