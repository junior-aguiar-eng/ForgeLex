import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { GuidanceService } from './guidance-service.js';

const connections: Awaited<ReturnType<typeof createDatabase>>[] = [];
const access = {
  owner: { tenantId: 'guidance-tenant', userId: 'guidance-user' },
  canReadMatter: true,
};

async function service() {
  const connection = await createDatabase({ url: 'file::memory:' });
  connections.push(connection);
  await runPersistenceMigrations(connection.client);
  return new GuidanceService(connection.db);
}

afterEach(() => {
  for (const connection of connections.splice(0)) connection.client.close();
});

it('projeta o texto livre digitado em cada campo sem alterar o estado da decisão', async () => {
  const guidance = await service();
  const initial = await guidance.start(access, randomUUID(), { objective: 'Preciso de ajuda' });
  expect(initial.question?.id).toMatch(/^area:/);

  const typedArea = await guidance.respond(access, initial.conversationId, randomUUID(), {
    questionId: initial.question!.id,
    questionVersion: initial.question!.version,
    contextRevision: initial.contextRevision,
    selectedOptionIds: [],
    freeText: 'previdenciário',
  });
  expect(typedArea.decisions.area).toMatchObject({ value: null, status: 'unknown', detail: 'previdenciário' });
  expect(typedArea.decisions.action).not.toHaveProperty('detail');

  const typedAction = await guidance.respond(access, typedArea.conversationId, randomUUID(), {
    questionId: typedArea.question!.id,
    questionVersion: typedArea.question!.version,
    contextRevision: typedArea.contextRevision,
    selectedOptionIds: [],
    freeText: 'Preciso conferir os pontos da peça aberta.',
  });
  expect(typedAction.description).toBe('Preciso conferir os pontos da peça aberta.');
  expect(typedAction.decisions.action).not.toHaveProperty('detail');
  expect(typedAction.decisions.area).toMatchObject({ value: null, status: 'unknown', detail: 'previdenciário' });
});

it('não anexa detalhe a uma opção escolhida', async () => {
  const guidance = await service();
  const initial = await guidance.start(access, randomUUID(), { objective: 'Preciso de ajuda' });
  const withComplement = await guidance.respond(access, initial.conversationId, randomUUID(), {
    questionId: initial.question!.id,
    questionVersion: initial.question!.version,
    contextRevision: initial.contextRevision,
    selectedOptionIds: ['penal'],
    freeText: 'processo antigo',
  });
  expect(withComplement.decisions.area).toMatchObject({ value: 'penal', status: 'confirmed' });
  expect(withComplement.decisions.area).not.toHaveProperty('detail');
});

const pieces = [
  {
    id: 'resposta-acusacao',
    label: 'Resposta à acusação',
    areas: ['penal'],
    transversal: false,
    triggers: ['defesa preliminar'],
  },
  {
    id: 'contestacao-civel',
    label: 'Contestação cível',
    areas: ['processo-civil'],
    transversal: false,
    triggers: ['defesa do reu'],
  },
];

async function v3Service() {
  const connection = await createDatabase({ url: 'file::memory:' });
  connections.push(connection);
  await runPersistenceMigrations(connection.client);
  return new GuidanceService(connection.db, { rulesVersion: 'mesa-v3', pieces });
}

type Projection = Awaited<ReturnType<GuidanceService['start']>>;
const answer = (view: Projection, extra: { selectedOptionIds?: string[]; freeText?: string }) => ({
  questionId: view.question!.id,
  questionVersion: view.question!.version,
  contextRevision: view.contextRevision,
  selectedOptionIds: [],
  ...extra,
});

it('mesa-v3: da área e do texto livre à peça confirmada e ao tribunal, mostrando só a peça em uso', async () => {
  const guidance = await v3Service();
  const seen: Projection[] = [];
  let view = await guidance.start(access, randomUUID(), {
    objective: 'Preciso elaborar a resposta à acusação do meu cliente',
  });
  seen.push(view);
  expect(view.question?.options).toHaveLength(26);
  const send = async (extra: { selectedOptionIds?: string[]; freeText?: string }) => {
    view = await guidance.respond(access, view.conversationId, randomUUID(), answer(view, extra));
    seen.push(view);
  };
  await send({ selectedOptionIds: ['penal'] });
  await send({ selectedOptionIds: ['create_document'] });
  expect(view.decisions.area).toMatchObject({ value: 'penal', status: 'confirmed', label: 'Penal' });
  expect(view.decisions.documentType).toMatchObject({
    value: 'resposta-acusacao',
    status: 'proposed',
    label: 'Resposta à acusação',
  });
  expect(view.question?.prompt).toBe('Pelo que você informou, a peça é: Resposta à acusação. Está correto?');
  await send({ selectedOptionIds: ['sim'] });
  expect(view.decisions.documentType).toMatchObject({ status: 'confirmed', label: 'Resposta à acusação' });
  expect(view.question?.id).toMatch(/^court:/);
  await send({ freeText: 'TJ-AL' });
  expect(view.decisions.court).toMatchObject({ value: 'tj-al', status: 'confirmed', label: 'TJ-AL' });
  expect(view.question).toBeNull();
  const everything = JSON.stringify(seen);
  expect(everything).not.toContain('contestacao-civel');
  expect(everything).not.toContain('defesa preliminar');
});

it('mesa-v3: recusar a peça propõe outra ou segue como pedido livre, e a conversa antiga não ganha tribunal', async () => {
  const guidance = await v3Service();
  let view = await guidance.start(access, randomUUID(), { objective: 'resposta à acusação' });
  const send = async (extra: { selectedOptionIds?: string[]; freeText?: string }) => {
    view = await guidance.respond(access, view.conversationId, randomUUID(), answer(view, extra));
  };
  await send({ selectedOptionIds: ['penal'] });
  await send({ selectedOptionIds: ['create_document'] });
  await send({ selectedOptionIds: ['nao'] });
  expect(view.decisions.documentType).toMatchObject({ value: null, status: 'unknown' });
  expect(view.question?.selection).toBe('free_text');
  await send({ freeText: 'algo fora do catálogo' });
  expect(view.question?.id).toMatch(/^court:/);

  const legacy = await (await service()).start(access, randomUUID(), { objective: 'Preciso de ajuda' });
  expect(legacy.decisions).not.toHaveProperty('court');
  expect(legacy.question?.options).toHaveLength(6);
});
