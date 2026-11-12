import { GuidanceSnapshotSchema, type GuidanceSnapshot, type LegalQuestion } from '@forgelex/domain';
import { describe, expect, it } from 'vitest';
import { applyGuidanceAnswer, guidanceQuestion, initialGuidance, type GuidanceEnvironment } from './guidance-rules.js';
import type { DeskPiece } from './piece-ranking.js';

const piece = (
  id: string,
  label: string,
  areas: string[],
  triggers: string[] = [],
  transversal = false,
): DeskPiece => ({
  id,
  label,
  areas,
  transversal,
  triggers,
});
const pieces = [
  piece('resposta-acusacao', 'Resposta à acusação', ['penal', 'processo-penal'], ['defesa preliminar']),
  piece('contestacao-civel', 'Contestação cível', ['processo-civil'], ['defesa do reu']),
  piece('oficio', 'Ofício', [], [], true),
];
const env = (text = ''): GuidanceEnvironment => ({ rulesVersion: 'mesa-v3', pieces, text });

function step(
  snapshot: GuidanceSnapshot,
  answer: { options?: string[]; text?: string; unknown?: boolean },
  environment: GuidanceEnvironment,
): GuidanceSnapshot {
  const question = guidanceQuestion(snapshot, 1, environment) as LegalQuestion;
  const next = applyGuidanceAnswer(
    snapshot,
    question,
    {
      questionId: question.id,
      questionVersion: question.version,
      contextRevision: 1,
      selectedOptionIds: answer.options ?? [],
      ...(answer.text ? { freeText: answer.text } : {}),
      ...(answer.unknown ? { unknown: true } : {}),
    },
    environment,
  );
  expect(GuidanceSnapshotSchema.parse(next)).toEqual(next);
  return next;
}

describe('orientação mesa-v3', () => {
  it('começa pela área com as 25 grandes áreas e "Outra área", e já guarda o tribunal como desconhecido', () => {
    const start = initialGuidance(env());
    expect(start.rulesVersion).toBe('mesa-v3');
    expect(start.court).toEqual({ value: null, status: 'unknown', origin: 'user' });
    const question = guidanceQuestion(start, 1, env())!;
    expect(question.id).toBe('area:1');
    expect(question.options).toHaveLength(26);
    expect(question.allowFreeText).toBe(true);
  });

  it('da área e do texto livre chega à peça proposta, e o cliente confirma em três interações', () => {
    const environment = env('Preciso elaborar a resposta à acusação do meu cliente');
    let snapshot = initialGuidance(environment);
    snapshot = step(snapshot, { options: ['penal'] }, environment);
    snapshot = step(snapshot, { options: ['create_document'] }, environment);
    expect(snapshot.documentType).toEqual({ value: 'resposta-acusacao', status: 'proposed', origin: 'model' });
    const hypothesis = guidanceQuestion(snapshot, 1, environment)!;
    expect(hypothesis.prompt).toBe('Pelo que você informou, a peça é: Resposta à acusação. Está correto?');
    expect(hypothesis.options.map(({ id }) => id)).toEqual(['sim', 'nao']);
    expect(hypothesis.allowFreeText).toBe(false);
    snapshot = step(snapshot, { options: ['sim'] }, environment);
    expect(snapshot.documentType).toMatchObject({ value: 'resposta-acusacao', status: 'confirmed', origin: 'user' });
    const court = guidanceQuestion(snapshot, 1, environment)!;
    expect(court.selection).toBe('free_text');
    snapshot = step(snapshot, { text: 'TJ-AL' }, environment);
    expect(snapshot.court).toMatchObject({ value: 'tj-al', status: 'confirmed' });
    expect(snapshot.activeQuestionId).toBeNull();
    expect(guidanceQuestion(snapshot, 1, environment)).toBeNull();
  });

  it('tribunal não reconhecido fica como "outro" e "não sei" deixa o tribunal em aberto', () => {
    const environment = env('resposta à acusação');
    const ready = (): GuidanceSnapshot => {
      let snapshot = initialGuidance(environment);
      snapshot = step(snapshot, { options: ['penal'] }, environment);
      snapshot = step(snapshot, { options: ['create_document'] }, environment);
      return step(snapshot, { options: ['sim'] }, environment);
    };
    expect(step(ready(), { text: 'Vara criminal de Maceió' }, environment).court?.value).toBe('outro');
    const unknown = step(ready(), { unknown: true }, environment);
    expect(unknown.court).toMatchObject({ value: null, status: 'unknown' });
    expect(unknown.activeQuestionId).toBeNull();
  });

  it('ao recusar a peça, propõe a próxima candidata; sem mais candidatas, pede para explicar e segue como pedido livre', () => {
    const environment = env('resposta à acusação, defesa preliminar e ofício');
    let snapshot = initialGuidance(environment);
    snapshot = step(snapshot, { options: ['penal'] }, environment);
    snapshot = step(snapshot, { options: ['create_document'] }, environment);
    expect(snapshot.documentType.value).toBe('resposta-acusacao');
    snapshot = step(snapshot, { options: ['nao'] }, environment);
    expect(snapshot.rejectedDocumentTypes).toEqual(['resposta-acusacao']);
    expect(snapshot.documentType).toEqual({ value: 'oficio', status: 'proposed', origin: 'model' });
    snapshot = step(snapshot, { options: ['nao'] }, environment);
    expect(snapshot.rejectedDocumentTypes).toEqual(['resposta-acusacao', 'oficio']);
    expect(snapshot.documentType).toEqual({ value: null, status: 'unknown', origin: 'user' });
    const ask = guidanceQuestion(snapshot, 1, environment)!;
    expect(ask.selection).toBe('free_text');
    snapshot = step(snapshot, { text: 'algo que não está no catálogo' }, environment);
    expect(snapshot.documentType).toMatchObject({ value: null, status: 'unknown' });
    expect(snapshot.documentType.questionId).toBe('documentType:5');
    expect(guidanceQuestion(snapshot, 1, environment)?.id).toBe('court:6');
  });

  it('sem texto que identifique a peça, pergunta pelo objetivo sem mostrar lista e propõe uma peça por vez', () => {
    const environment = env('');
    let snapshot = initialGuidance(environment);
    snapshot = step(snapshot, { options: ['processo-civil'] }, environment);
    snapshot = step(snapshot, { options: ['create_document'] }, environment);
    const ask = guidanceQuestion(snapshot, 1, environment)!;
    expect(ask).toMatchObject({ selection: 'free_text', options: [] });
    snapshot = step(snapshot, { text: 'o réu precisa da defesa do réu' }, environment);
    expect(snapshot.documentType).toEqual({ value: 'contestacao-civel', status: 'proposed', origin: 'model' });
  });

  it('"não sei" na peça segue como pedido livre, sem peça', () => {
    const environment = env('resposta à acusação');
    let snapshot = initialGuidance(environment);
    snapshot = step(snapshot, { options: ['penal'] }, environment);
    snapshot = step(snapshot, { options: ['create_document'] }, environment);
    snapshot = step(snapshot, { unknown: true }, environment);
    expect(snapshot.documentType).toMatchObject({ value: null, status: 'unknown' });
    expect(guidanceQuestion(snapshot, 1, environment)?.id).toMatch(/^court:/);
  });

  it('mudar a área apaga a peça proposta e as recusas', () => {
    const environment = env('resposta à acusação');
    let snapshot = initialGuidance(environment);
    snapshot = step(snapshot, { options: ['penal'] }, environment);
    snapshot = step(snapshot, { options: ['create_document'] }, environment);
    snapshot = step(snapshot, { options: ['nao'] }, environment);
    expect(snapshot.rejectedDocumentTypes).toEqual(['resposta-acusacao']);
    const area = applyGuidanceAnswer(
      snapshot,
      {
        id: `area:${snapshot.revision}`,
        version: snapshot.revision,
        contextRevision: 1,
        prompt: 'x',
        selection: 'single',
        options: [{ id: 'processo-penal', label: 'x' }],
        allowFreeText: true,
        allowUnknown: true,
        reason: 'x',
      },
      {
        questionId: `area:${snapshot.revision}`,
        questionVersion: snapshot.revision,
        contextRevision: 1,
        selectedOptionIds: ['processo-penal'],
      },
      environment,
    );
    expect(area.rejectedDocumentTypes).toBeUndefined();
    expect(area.documentType.value).toBe('resposta-acusacao');
    expect(area.documentType.status).toBe('proposed');
  });

  it('sem catálogo de peças, não propõe nada e pergunta pelo objetivo', () => {
    const environment: GuidanceEnvironment = { rulesVersion: 'mesa-v3', text: 'resposta à acusação' };
    let snapshot = initialGuidance(environment);
    snapshot = step(snapshot, { options: ['penal'] }, environment);
    snapshot = step(snapshot, { options: ['create_document'] }, environment);
    expect(snapshot.documentType.status).toBe('unknown');
    expect(guidanceQuestion(snapshot, 1, environment)?.selection).toBe('free_text');
  });

  it('as outras ações não pedem peça nem tribunal', () => {
    const environment = env();
    let snapshot = initialGuidance(environment);
    snapshot = step(snapshot, { options: ['penal'] }, environment);
    snapshot = step(snapshot, { options: ['research_question'] }, environment);
    expect(snapshot.activeQuestionId).toBeNull();
  });
});

describe('compatibilidade das regras anteriores', () => {
  it('a mesa-v2 segue com seis áreas e a tabela fixa, e não pergunta tribunal', () => {
    const start = initialGuidance();
    expect(start.rulesVersion).toBe('mesa-v2');
    expect(start.court).toBeUndefined();
    expect(guidanceQuestion(start, 1)?.options).toHaveLength(6);
  });
});
