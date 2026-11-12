import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bindDeskSkills } from '@forgelex/legal-workflows';
import { createGuidanceSnapshot, type DecisionValue } from '@forgelex/domain';
import { loadFileSkillCatalog, skillCatalogFromEnvironment } from './file-skill-catalog.js';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const provenance = {
  origin: 'MinutaIA',
  originalVersion: 3,
  originalHash: 'a'.repeat(64),
  decision: { id: 'DEC-4', date: '2026-11-11' },
};
const entry = (id: string, version: number, text: string, reviewState: string, extra: object = {}) => ({
  id,
  version,
  kind: 'FORM',
  areas: ['penal'],
  documentType: id,
  roles: ['legal-drafter'],
  contentHash: sha(text),
  byteLength: Buffer.byteLength(text),
  provenance,
  reviewState,
  ...extra,
});

async function catalogDir(entries: ReturnType<typeof entry>[], files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'forgelex-skills-'));
  dirs.push(dir);
  await mkdir(join(dir, 'content'));
  await writeFile(
    join(dir, 'catalog.json'),
    JSON.stringify({ schemaVersion: 1, version: 'catalogo-teste-v1', createdAt: '2026-11-12', entries }),
  );
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, 'content', name), text);
  return dir;
}

const confirm = (value: string): DecisionValue => ({ value, status: 'confirmed', origin: 'user' });
const unknown: DecisionValue = { value: null, status: 'unknown', origin: 'user' };
const guidance = createGuidanceSnapshot({
  protocolVersion: 1,
  rulesVersion: 'mesa-v1',
  revision: 1,
  area: confirm('penal'),
  action: confirm('create_document'),
  documentType: confirm('resposta-acusacao'),
  partyRole: unknown,
  stage: unknown,
  activeQuestionId: null,
});

describe('catálogo de habilidades em diretório privado (M3.1)', () => {
  it('serve só a ficha elegível, conferida por hash, e ignora a que não é', async () => {
    const eligible = 'Roteiro sintético da resposta à acusação.';
    const pending = 'Texto de outra ficha, ainda pendente.';
    const dir = await catalogDir(
      [entry('resposta-acusacao', 3, eligible, 'eligible'), entry('outra-peca', 1, pending, 'pending')],
      { 'resposta-acusacao@3.md': eligible, 'outra-peca@1.md': pending },
    );
    const loaded = await loadFileSkillCatalog(dir);
    const snapshot = await bindDeskSkills({
      catalog: loaded.catalog,
      budget: loaded.budget,
      loadContent: loaded.loadContent,
      guidance,
      contextRevision: 1,
      issues: [],
      sourceIds: [],
      activeRoles: ['legal-drafter'],
    });
    expect(snapshot.binding.entries.map(({ id }) => id)).toEqual(['resposta-acusacao']);
    expect(snapshot.references).toEqual([{ id: 'resposta-acusacao', version: 3, content: eligible }]);
    expect(snapshot.binding.catalogVersion).toBe('catalogo-teste-v1');
  });

  it('versões convivem: a versão antiga continua legível depois de uma versão nova', async () => {
    const v3 = 'Versão três.';
    const v4 = 'Versão quatro, ajustada.';
    const dir = await catalogDir(
      [entry('resposta-acusacao', 3, v3, 'adjusted'), entry('resposta-acusacao', 4, v4, 'eligible')],
      { 'resposta-acusacao@3.md': v3, 'resposta-acusacao@4.md': v4 },
    );
    const { loadContent } = await loadFileSkillCatalog(dir);
    const read = (version: number, text: string) =>
      loadContent({ id: 'resposta-acusacao', version, contentHash: sha(text), byteLength: Buffer.byteLength(text) });
    await expect(read(3, v3)).resolves.toBe(v3);
    await expect(read(4, v4)).resolves.toBe(v4);
  });

  it('falha na subida se a ficha elegível não tem o arquivo com o tamanho declarado', async () => {
    const text = 'Conteúdo declarado.';
    const missing = await catalogDir([entry('a', 1, text, 'eligible')], {});
    await expect(loadFileSkillCatalog(missing)).rejects.toThrow('SKILL_CONTENT_MISSING:a@1');
    const wrong = await catalogDir([entry('a', 1, text, 'eligible')], { 'a@1.md': text + ' a mais' });
    await expect(loadFileSkillCatalog(wrong)).rejects.toThrow('SKILL_CONTENT_MISSING:a@1');
    // Ficha pendente não exige o arquivo.
    const pending = await catalogDir([entry('a', 1, text, 'pending')], {});
    await expect(loadFileSkillCatalog(pending)).resolves.toBeDefined();
  });

  it('recusa leitura com tamanho diferente do declarado', async () => {
    const text = 'Conteúdo declarado.';
    const dir = await catalogDir([entry('a', 1, text, 'pending')], { 'a@1.md': text + ' mais' });
    const { loadContent } = await loadFileSkillCatalog(dir);
    await expect(
      loadContent({ id: 'a', version: 1, contentHash: sha(text), byteLength: Buffer.byteLength(text) }),
    ).rejects.toThrow('SKILL_CONTENT_SIZE_MISMATCH');
  });

  it('sem variável de ambiente não há catálogo; com ela, o orçamento vem das variáveis ou do padrão', async () => {
    await expect(skillCatalogFromEnvironment({})).resolves.toBeUndefined();
    await expect(skillCatalogFromEnvironment({ FORGELEX_SKILL_CATALOG_DIR: '  ' })).resolves.toBeUndefined();
    const dir = await catalogDir([], {});
    const standard = await skillCatalogFromEnvironment({ FORGELEX_SKILL_CATALOG_DIR: dir });
    expect(standard?.budget).toEqual({ maxBytesPerRole: 65536, maxBytesTotal: 98304 });
    const custom = await skillCatalogFromEnvironment({
      FORGELEX_SKILL_CATALOG_DIR: dir,
      FORGELEX_SKILL_BUDGET_ROLE_BYTES: '1000',
      FORGELEX_SKILL_BUDGET_TOTAL_BYTES: '2000',
    });
    expect(custom?.budget).toEqual({ maxBytesPerRole: 1000, maxBytesTotal: 2000 });
    await expect(
      skillCatalogFromEnvironment({ FORGELEX_SKILL_CATALOG_DIR: dir, FORGELEX_SKILL_BUDGET_ROLE_BYTES: '0' }),
    ).rejects.toThrow('INVALID_FORGELEX_SKILL_BUDGET_ROLE_BYTES');
  });
});

describe('lista de peças do catálogo (U3)', () => {
  it('entrega as peças elegíveis com rótulo e expressões, sem conteúdo, ids de versão nem hashes', async () => {
    const text = 'Roteiro sintético.';
    const dir = await catalogDir(
      [
        entry('resposta-acusacao', 3, text, 'eligible', {
          label: 'Resposta à acusação',
          triggers: ['defesa preliminar'],
        }),
        entry('sem-rotulo', 1, text, 'eligible'),
        entry('pendente', 1, text, 'pending', { label: 'Pendente' }),
      ],
      { 'resposta-acusacao@3.md': text, 'sem-rotulo@1.md': text },
    );
    const loaded = await loadFileSkillCatalog(dir);
    expect(loaded.pieces).toEqual([
      {
        id: 'resposta-acusacao',
        label: 'Resposta à acusação',
        areas: ['penal'],
        transversal: false,
        triggers: ['defesa preliminar'],
      },
    ]);
    expect(JSON.stringify(loaded.pieces)).not.toMatch(/Roteiro|contentHash|sha|version/i);
  });
});
