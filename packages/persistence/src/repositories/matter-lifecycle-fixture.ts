import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { MatterRepository } from './matter-repository.js';
import { CaseAiAccessRepository } from './case-ai-access-repository.js';

/** Destructive lifecycle tests require a separate database per test. */
export async function caseAccessFixture() {
  const path = join(tmpdir(), `forgelex-lifecycle-fixture-${randomUUID()}.db`);
  const c = await createDatabase({ url: pathToFileURL(path).toString() });
  const close = c.client.close.bind(c.client);
  c.client.close = () => { close(); try { rmSync(path, { force: true }); } catch { /* Windows may retain a handle until worker exit. */ } };
  await runPersistenceMigrations(c.client);
  const owner = { tenantId: 'case-owner', userId: 'author' };
  const matters = new MatterRepository(c.db);
  const matter = await matters.createMatter({ ...owner, createdBy: owner.userId, title: 'Caso autorizado' });
  const foreign = await matters.createMatter({ tenantId: 'foreign', createdBy: 'other', title: 'Caso sigiloso' });
  const doc = await matters.ingestTextDocument({ ...owner, matterId: matter.id, createdBy: owner.userId, title: 'Contrato', originalFilename: 'contrato.txt', mimeType: 'text/plain', content: 'Texto do contrato autorizado.' });
  const repo = new CaseAiAccessRepository(c.db);
  const selection = { documents: [{ documentId: doc.document.id, versionId: doc.version.id }], factIds: [], evidenceIds: [], thesisIds: [], authorityIds: [] };
  const input = { oauthClientId: 'app-one', oauthGrantedAt: '2026-10-05T10:00:00.000Z', expectedRevision: 0, selection };
  const reader = { ...owner, oauthConnection: { clientId: input.oauthClientId, grantedAt: input.oauthGrantedAt } };
  return { ...c, owner, reader, matters, matter, foreign, doc, repo, selection, input };
}
