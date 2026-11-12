import { createHash } from 'node:crypto';
import { createGuidanceSnapshot, type DecisionValue } from '@forgelex/domain';
import { describe, expect, it } from 'vitest';
import { createSkillCatalog } from './skill-catalog.js';
import { parseSkillManifest, manifestToCatalog } from './skill-manifest.js';
import { resolveDeskSkills } from './skill-resolver.js';

const confirm = (value: string): DecisionValue => ({ value, status: 'confirmed', origin: 'user' });
const unknown: DecisionValue = { value: null, status: 'unknown', origin: 'user' };
const guide = (area: DecisionValue, documentType: DecisionValue = confirm('peticao')) =>
  createGuidanceSnapshot({
    protocolVersion: 1,
    rulesVersion: 'mesa-v1',
    revision: 1,
    area,
    action: confirm('create_document'),
    documentType,
    partyRole: unknown,
    stage: unknown,
    activeQuestionId: null,
  });
const text = 'Moldura de teste.';
const base = {
  version: 1,
  status: 'eligible',
  kind: 'FORM',
  documentType: 'peticao',
  roles: ['legal-drafter'],
  contentHash: createHash('sha256').update(text, 'utf8').digest('hex'),
  byteLength: Buffer.byteLength(text),
} as const;
const frame = { ...base, id: 'moldura-peticao', areas: [], transversal: true } as const;
const civil = { ...base, id: 'peticao-civel', areas: ['civel'] } as const;
const request = (entries: unknown[], area: DecisionValue, documentType?: DecisionValue) => ({
  catalog: createSkillCatalog({ version: 'v1', entries }),
  guidance: guide(area, documentType),
  activeRoles: ['legal-drafter'] as const,
  issues: [],
  sourceIds: [],
});

describe('Forma transversal ("coringa")', () => {
  it('serve ao tipo de peça em qualquer área quando não há Forma da área', () => {
    const result = resolveDeskSkills(request([frame], confirm('penal')));
    expect(result.limitations).toEqual([]);
    expect(result.selections[0].reason).toEqual({
      kind: 'FORM',
      area: 'penal',
      documentType: 'peticao',
      transversal: true,
    });
  });

  it('serve também enquanto a área não foi definida, pois a moldura não depende dela', () => {
    const result = resolveDeskSkills(request([frame], unknown));
    expect(result.selections.map(({ skill }) => skill.id)).toEqual(['moldura-peticao']);
    expect(result.selections[0].reason).toMatchObject({ area: 'transversal', transversal: true });
  });

  it('a Forma da área vence a transversal; nunca entram as duas', () => {
    const result = resolveDeskSkills(request([frame, civil], confirm('civel')));
    expect(result.selections.map(({ skill }) => skill.id)).toEqual(['peticao-civel']);
    expect(result.selections[0].reason).not.toHaveProperty('transversal');
  });

  it('sem Forma da área nem transversal, o limite continua o de antes', () => {
    expect(resolveDeskSkills(request([civil], confirm('penal'))).limitations).toEqual([
      { code: 'FORM_UNAVAILABLE', area: 'penal', documentType: 'peticao' },
    ]);
    expect(resolveDeskSkills(request([civil], unknown)).limitations).toEqual([{ code: 'FORM_SCOPE_UNRESOLVED' }]);
  });

  it('duas transversais para o mesmo tipo de peça são conflito, não escolha por ordem', () => {
    const result = resolveDeskSkills(request([frame, { ...frame, id: 'moldura-outra' }], confirm('penal')));
    expect(result.selections).toEqual([]);
    expect(result.limitations).toEqual([
      { code: 'FORM_CONFLICT', area: 'penal', documentType: 'peticao', skillIds: ['moldura-outra', 'moldura-peticao'] },
    ]);
  });

  it('o tipo de peça continua obrigatório', () => {
    expect(resolveDeskSkills(request([frame], confirm('penal'), unknown)).limitations).toEqual([
      { code: 'FORM_SCOPE_UNRESOLVED' },
    ]);
  });

  it('o catálogo recusa Forma sem área e sem marca de transversal, e transversal com áreas', () => {
    expect(() => createSkillCatalog({ version: 'v1', entries: [{ ...frame, transversal: undefined }] })).toThrow();
    expect(() => createSkillCatalog({ version: 'v1', entries: [{ ...frame, areas: ['civel'] }] })).toThrow();
  });

  it('o manifesto carrega a marca até o catálogo do resolvedor', () => {
    const manifest = parseSkillManifest({
      schemaVersion: 1,
      version: 'm1',
      createdAt: '2026-11-12',
      entries: [
        {
          id: 'moldura-peticao',
          version: 1,
          kind: 'FORM',
          areas: [],
          transversal: true,
          documentType: 'peticao',
          roles: ['legal-drafter'],
          contentHash: base.contentHash,
          byteLength: base.byteLength,
          provenance: {
            origin: 'minutaia',
            originalVersion: 1,
            originalHash: base.contentHash,
            decision: { id: 'DEC-4', date: '2026-11-10' },
          },
          reviewState: 'eligible',
        },
      ],
    });
    expect(manifestToCatalog(manifest).entries[0]).toMatchObject({ kind: 'FORM', transversal: true, areas: [] });
  });
});
