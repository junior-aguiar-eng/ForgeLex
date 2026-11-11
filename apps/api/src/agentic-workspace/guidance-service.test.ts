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
