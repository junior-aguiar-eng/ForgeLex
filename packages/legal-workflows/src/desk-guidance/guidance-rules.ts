import {
  createGuidanceSnapshot,
  type DecisionValue,
  type GuidanceSnapshot,
  type LegalAnswer,
  type LegalQuestion,
} from '@forgelex/domain';

const rulesVersion = 'mesa-v2';
const unanswered = { value: null, status: 'unknown', origin: 'user' } as const;
type Draft = Omit<GuidanceSnapshot, 'guidanceHash'>;
type Field = 'area' | 'action' | 'documentType';

const area = [
  { id: 'penal', label: 'Penal' },
  { id: 'civel', label: 'Cível' },
  { id: 'trabalhista', label: 'Trabalhista' },
  { id: 'administrativo', label: 'Administrativo' },
  { id: 'tributario', label: 'Tributário' },
  { id: 'outra', label: 'Outra área' },
];
const actions = [
  { id: 'create_document', label: 'Elaborar uma peça' },
  { id: 'analyze_documents', label: 'Analisar documentos' },
  { id: 'review_text', label: 'Revisar um texto' },
  { id: 'research_question', label: 'Pesquisar fundamentos' },
];
const pieces = new Map([
  ['penal', [{ id: 'resposta-acusacao', label: 'Resposta à acusação' }]],
  ['civel', [{ id: 'contestacao-civel', label: 'Contestação' }]],
]);
const hasAnswer = (value: DecisionValue) => value.value !== null || Boolean(value.questionId);

function nextField(snapshot: Draft): Field | null {
  if (!hasAnswer(snapshot.area)) return 'area';
  if (!hasAnswer(snapshot.action)) return 'action';
  if (
    snapshot.action.value === 'create_document' &&
    pieces.has(snapshot.area.value ?? '') &&
    !hasAnswer(snapshot.documentType)
  )
    return 'documentType';
  return null;
}

function complete(draft: Draft): GuidanceSnapshot {
  const field = nextField(draft);
  return createGuidanceSnapshot({ ...draft, activeQuestionId: field ? `${field}:${draft.revision}` : null });
}

export function initialGuidance(): GuidanceSnapshot {
  return complete({
    protocolVersion: 1,
    rulesVersion,
    revision: 1,
    activeQuestionId: null,
    area: unanswered,
    action: unanswered,
    documentType: unanswered,
    partyRole: unanswered,
    stage: unanswered,
  });
}

export function guidanceQuestion(snapshot: GuidanceSnapshot, contextRevision: number): LegalQuestion | null {
  if (snapshot.rulesVersion !== rulesVersion && snapshot.rulesVersion !== 'mesa-v1')
    throw new Error('GUIDANCE_RULES_UNAVAILABLE');
  const field = nextField(snapshot);
  if (!field) return null;
  const options =
    field === 'area'
      ? area
      : field === 'action'
        ? actions
        : [...pieces.get(snapshot.area.value ?? '')!, { id: 'outra', label: 'Outra peça' }];
  const prompt =
    field === 'area'
      ? 'Em qual área você precisa trabalhar?'
      : field === 'action'
        ? 'O que você precisa fazer?'
        : 'Qual peça você precisa elaborar?';
  return {
    id: `${field}:${snapshot.revision}`,
    version: snapshot.revision,
    contextRevision,
    prompt,
    selection: 'single',
    options,
    allowFreeText: snapshot.rulesVersion === rulesVersion,
    allowUnknown: true,
    reason: 'Delimitar o pedido',
  };
}

export function guidanceField(question: LegalQuestion): Field {
  for (const field of ['area', 'action', 'documentType'] as const) {
    if (question.id === `${field}:${question.version}`) return field;
  }
  throw new Error('QUESTION_EXPIRED');
}

export function applyGuidanceAnswer(
  snapshot: GuidanceSnapshot,
  question: LegalQuestion,
  answer: LegalAnswer,
): GuidanceSnapshot {
  const { guidanceHash: _hash, ...draft } = snapshot;
  const field = guidanceField(question);
  const value = answer.selectedOptionIds[0] ?? null;
  if (snapshot[field].value !== value) {
    if (field !== 'documentType') draft.documentType = unanswered;
    draft.partyRole = unanswered;
    draft.stage = unanswered;
  }
  draft[field] =
    value === null
      ? { ...unanswered, questionId: question.id }
      : { value, status: 'confirmed', origin: 'user', questionId: question.id };
  return complete({ ...draft, revision: snapshot.revision + 1 });
}
