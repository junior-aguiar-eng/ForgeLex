import { describe, expect, it } from 'vitest';
import { manifestToCatalog, parseSkillManifest, REVIEW_STATES } from './skill-manifest.js';
import { resolveDeskSkills } from './skill-resolver.js';
import { createGuidanceSnapshot, type DecisionValue } from '@forgelex/domain';

const hash = (char: string) => char.repeat(64);
const provenance = {
  origin: 'MinutaIA',
  originalVersion: 3,
  originalHash: hash('a'),
  decision: { id: 'DEC-4', date: '2026-11-11' },
};
const form = (overrides: Record<string, unknown> = {}) => ({
  id: 'resposta-acusacao',
  version: 3,
  kind: 'FORM',
  areas: ['penal', 'processo-penal'],
  documentType: 'resposta-acusacao',
  roles: ['legal-drafter'],
  contentHash: hash('b'),
  byteLength: 100,
  provenance,
  reviewState: 'eligible',
  crossChecks: ['norma-existencia'],
  alerts: [],
  ...overrides,
});
const matter = (overrides: Record<string, unknown> = {}) => ({
  id: 'cadeia-custodia',
  version: 3,
  kind: 'MATTER',
  area: 'penal',
  topic: 'cadeia-custodia',
  roles: ['matter-analyst'],
  contentHash: hash('c'),
  byteLength: 200,
  provenance,
  reviewState: 'pending',
  ...overrides,
});
const manifest = (entries: unknown[]) => ({
  schemaVersion: 1,
  version: 'catalogo-2026-11-12',
  createdAt: '2026-11-12',
  entries,
});

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

describe('manifesto do catálogo incorporado (M3.1)', () => {
  it('os seis estados de revisão existem', () => {
    expect([...REVIEW_STATES]).toEqual(['pending', 'in_review', 'adjusted', 'eligible', 'ineligible', 'deferred']);
  });

  it('só a ficha elegível chega ao resolvedor; as demais ficam no catálogo, nunca selecionadas', () => {
    const parsed = parseSkillManifest(manifest([form(), matter()]));
    const catalog = manifestToCatalog(parsed);
    expect(catalog.entries.map(({ id, status }) => [id, status])).toEqual([
      ['resposta-acusacao', 'eligible'],
      ['cadeia-custodia', 'pending'],
    ]);
    const result = resolveDeskSkills({
      catalog,
      guidance,
      issues: [{ id: 'q1', area: 'penal', topic: 'cadeia-custodia', sourceIds: ['s1'] }],
      sourceIds: ['s1'],
      activeRoles: ['legal-drafter', 'matter-analyst'],
    });
    expect(result.selections.map(({ skill }) => skill.id)).toEqual(['resposta-acusacao']);
    expect(result.limitations).toEqual([{ code: 'MATTER_UNAVAILABLE', issueId: 'q1' }]);
  });

  it('versão ajustada registra de onde veio e a original deixa de ser elegível sem sair do catálogo', () => {
    const adjusted = form({
      version: 4,
      provenance: { ...provenance, adjustedFrom: { version: 3, hash: hash('b') } },
      contentHash: hash('d'),
    });
    const original = form({ reviewState: 'adjusted' });
    const catalog = manifestToCatalog(parseSkillManifest(manifest([original, adjusted])));
    expect(catalog.entries.map(({ version, status }) => [version, status])).toEqual([
      [3, 'pending'],
      [4, 'eligible'],
    ]);
  });

  it('recusa linha duplicada, ficha elegível com alerta e estado desconhecido', () => {
    expect(() => parseSkillManifest(manifest([form(), form()]))).toThrow('DUPLICATE_MANIFEST_ENTRY');
    expect(() => parseSkillManifest(manifest([form({ alerts: ['ARTICLE_REVOKED'] })]))).toThrow(
      'ELIGIBLE_ENTRY_WITH_ALERTS',
    );
    expect(() => parseSkillManifest(manifest([form({ reviewState: 'aprovada' })]))).toThrow();
    expect(() => parseSkillManifest(manifest([form({ areas: [] })]))).toThrow();
  });

  it('exige proveniência completa e papéis conhecidos', () => {
    expect(() => parseSkillManifest(manifest([form({ provenance: { ...provenance, originalHash: 'x' } })]))).toThrow();
    expect(() => parseSkillManifest(manifest([form({ roles: ['papel-inventado'] })]))).toThrow();
    expect(() => parseSkillManifest({ ...manifest([]), schemaVersion: 2 })).toThrow();
  });
});
