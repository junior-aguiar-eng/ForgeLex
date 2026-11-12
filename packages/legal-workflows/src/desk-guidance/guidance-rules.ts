import {
  createGuidanceSnapshot,
  type DecisionValue,
  type GuidanceSnapshot,
  type LegalAnswer,
  type LegalQuestion,
} from '@forgelex/domain';
import { DESK_AREAS, DESK_OTHER_AREA, parseCourt } from './desk-vocabulary.js';
import { rankPieces, type DeskPiece } from './piece-ranking.js';

const V2 = 'mesa-v2';
const V3 = 'mesa-v3';
const unanswered = { value: null, status: 'unknown', origin: 'user' } as const;
type Draft = Omit<GuidanceSnapshot, 'guidanceHash'>;
type Field = 'area' | 'action' | 'documentType' | 'court';

/**
 * O que as regras mesa-v3 precisam de fora: a lista interna de peças do catálogo (que nunca chega ao navegador) e o
 * texto que o cliente já escreveu. Sem peças, a Mesa segue sem propor peça e o pedido segue como pedido livre.
 */
export interface GuidanceEnvironment {
  readonly rulesVersion?: typeof V2 | typeof V3;
  readonly pieces?: readonly DeskPiece[];
  readonly text?: string;
}

const area = [
  { id: 'penal', label: 'Penal' },
  { id: 'civel', label: 'Cível' },
  { id: 'trabalhista', label: 'Trabalhista' },
  { id: 'administrativo', label: 'Administrativo' },
  { id: 'tributario', label: 'Tributário' },
  { id: 'outra', label: 'Outra área' },
];
const areaV3 = [...DESK_AREAS, DESK_OTHER_AREA];
const actions = [
  { id: 'create_document', label: 'Elaborar uma peça' },
  { id: 'analyze_documents', label: 'Analisar documentos' },
  { id: 'review_text', label: 'Revisar um texto' },
  { id: 'research_question', label: 'Pesquisar fundamentos' },
];
// Regras mesa-v1 e mesa-v2: a tabela de peças fixa em código. A mesa-v3 usa as peças do catálogo.
const pieces = new Map([
  ['penal', [{ id: 'resposta-acusacao', label: 'Resposta à acusação' }]],
  ['civel', [{ id: 'contestacao-civel', label: 'Contestação' }]],
]);
const hasAnswer = (value: DecisionValue) => value.value !== null || Boolean(value.questionId);
// Na mesa-v3 uma peça apenas proposta ainda espera a confirmação do cliente.
const settled = (value: DecisionValue | undefined) =>
  Boolean(value) && ((value!.value !== null && value!.status !== 'proposed') || Boolean(value!.questionId));

const isV3 = (snapshot: { rulesVersion: string }) => snapshot.rulesVersion === V3;

function nextField(snapshot: Draft): Field | null {
  if (isV3(snapshot)) {
    if (!settled(snapshot.area)) return 'area';
    if (!settled(snapshot.action)) return 'action';
    if (snapshot.action.value === 'create_document') {
      if (!settled(snapshot.documentType)) return 'documentType';
      if (!settled(snapshot.court)) return 'court';
    }
    return null;
  }
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

/** Mesa-v3: propõe a melhor peça ainda não recusada, quando há texto e catálogo que a sustentem. */
function propose(draft: Draft, environment: GuidanceEnvironment): Draft {
  if (!isV3(draft) || draft.action.value !== 'create_document' || settled(draft.documentType)) return draft;
  if (draft.documentType.status === 'proposed') return draft;
  const [top] = rankPieces({
    pieces: environment.pieces ?? [],
    text: environment.text ?? '',
    area: draft.area.value,
    rejected: draft.rejectedDocumentTypes,
  });
  return top ? { ...draft, documentType: { value: top.piece.id, status: 'proposed', origin: 'model' } } : draft;
}

function complete(draft: Draft, environment: GuidanceEnvironment = {}): GuidanceSnapshot {
  const proposed = propose(draft, environment);
  const field = nextField(proposed);
  return createGuidanceSnapshot({ ...proposed, activeQuestionId: field ? `${field}:${proposed.revision}` : null });
}

export function initialGuidance(environment: GuidanceEnvironment = {}): GuidanceSnapshot {
  const rulesVersion = environment.rulesVersion ?? V2;
  return complete(
    {
      protocolVersion: 1,
      rulesVersion,
      revision: 1,
      activeQuestionId: null,
      area: unanswered,
      action: unanswered,
      documentType: unanswered,
      partyRole: unanswered,
      stage: unanswered,
      ...(rulesVersion === V3 ? { court: unanswered } : {}),
    },
    environment,
  );
}

const pieceLabel = (id: string | null, environment: GuidanceEnvironment) =>
  environment.pieces?.find((piece) => piece.id === id)?.label ?? id ?? '';

export function guidanceQuestion(
  snapshot: GuidanceSnapshot,
  contextRevision: number,
  environment: GuidanceEnvironment = {},
): LegalQuestion | null {
  if (snapshot.rulesVersion !== V2 && snapshot.rulesVersion !== V3 && snapshot.rulesVersion !== 'mesa-v1')
    throw new Error('GUIDANCE_RULES_UNAVAILABLE');
  const field = nextField(snapshot);
  if (!field) return null;
  const base = {
    id: `${field}:${snapshot.revision}`,
    version: snapshot.revision,
    contextRevision,
    allowUnknown: true,
  };
  if (isV3(snapshot)) {
    if (field === 'court') {
      return {
        ...base,
        prompt: 'Em qual tribunal ou juízo a peça será apresentada? Exemplo: TJ-AL, TRT 4, STJ.',
        selection: 'free_text',
        options: [],
        allowFreeText: true,
        reason: 'Delimitar o pedido',
      };
    }
    if (field === 'documentType') {
      const proposed = snapshot.documentType.status === 'proposed' ? snapshot.documentType.value : null;
      return proposed
        ? {
            ...base,
            prompt: `Pelo que você informou, a peça é: ${pieceLabel(proposed, environment)}. Está correto?`,
            selection: 'single',
            options: [
              { id: 'sim', label: 'Sim, é essa' },
              { id: 'nao', label: 'Não, é outra' },
            ],
            allowFreeText: false,
            reason: 'Confirmar a peça antes de elaborar',
          }
        : {
            ...base,
            prompt: 'Explique em poucas palavras o que você precisa fazer: o tipo de peça e o que aconteceu.',
            selection: 'free_text',
            options: [],
            allowFreeText: true,
            reason: 'Delimitar o pedido',
          };
    }
    return {
      ...base,
      prompt: field === 'area' ? 'Em qual área você precisa trabalhar?' : 'O que você precisa fazer?',
      selection: 'single',
      options: field === 'area' ? areaV3 : actions,
      allowFreeText: true,
      reason: 'Delimitar o pedido',
    };
  }
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
    ...base,
    prompt,
    selection: 'single',
    options,
    allowFreeText: snapshot.rulesVersion === V2,
    reason: 'Delimitar o pedido',
  };
}

export function guidanceField(question: LegalQuestion): Field {
  for (const field of ['area', 'action', 'documentType', 'court'] as const) {
    if (question.id === `${field}:${question.version}`) return field;
  }
  throw new Error('QUESTION_EXPIRED');
}

function answerV3(
  snapshot: GuidanceSnapshot,
  draft: Draft,
  field: Field,
  question: LegalQuestion,
  answer: LegalAnswer,
  environment: GuidanceEnvironment,
): { draft: Draft; environment: GuidanceEnvironment } {
  const value = answer.selectedOptionIds[0] ?? null;
  const asked = { questionId: question.id };
  if (field === 'court') {
    const court = answer.freeText ? parseCourt(answer.freeText) : null;
    draft.court = answer.freeText
      ? { value: court?.id ?? 'outro', status: 'confirmed', origin: 'user', ...asked }
      : { ...unanswered, ...asked };
    return { draft, environment };
  }
  if (field === 'documentType') {
    if (snapshot.documentType.status === 'proposed') {
      if (value === 'sim') {
        draft.documentType = { value: snapshot.documentType.value, status: 'confirmed', origin: 'user', ...asked };
      } else if (value === 'nao') {
        draft.rejectedDocumentTypes = [...(snapshot.rejectedDocumentTypes ?? []), snapshot.documentType.value!];
        draft.documentType = unanswered;
      } else {
        draft.documentType = { ...unanswered, ...asked };
      }
      return { draft, environment };
    }
    // Resposta ao pedido de explicação: o texto novo entra no ranqueamento; sem peça de apoio, segue como pedido livre.
    const text = [environment.text, answer.freeText].filter(Boolean).join('\n');
    draft.documentType = { ...unanswered, ...asked };
    const next = { ...environment, text };
    const [top] = rankPieces({
      pieces: environment.pieces ?? [],
      text,
      area: draft.area.value,
      rejected: draft.rejectedDocumentTypes,
    });
    if (top) draft.documentType = { value: top.piece.id, status: 'proposed', origin: 'model' };
    return { draft, environment: next };
  }
  if (snapshot[field].value !== value) {
    // Mudar a área ou a ação invalida a peça proposta ou escolhida e as recusas anteriores.
    draft.documentType = unanswered;
    delete draft.rejectedDocumentTypes;
    draft.partyRole = unanswered;
    draft.stage = unanswered;
  }
  draft[field] =
    value === null ? { ...unanswered, ...asked } : { value, status: 'confirmed', origin: 'user', ...asked };
  return { draft, environment };
}

export function applyGuidanceAnswer(
  snapshot: GuidanceSnapshot,
  question: LegalQuestion,
  answer: LegalAnswer,
  environment: GuidanceEnvironment = {},
): GuidanceSnapshot {
  const { guidanceHash: _hash, ...draft } = snapshot;
  const field = guidanceField(question);
  if (isV3(snapshot)) {
    const result = answerV3(snapshot, draft, field, question, answer, environment);
    return complete({ ...result.draft, revision: snapshot.revision + 1 }, result.environment);
  }
  if (field === 'court') throw new Error('QUESTION_EXPIRED');
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
