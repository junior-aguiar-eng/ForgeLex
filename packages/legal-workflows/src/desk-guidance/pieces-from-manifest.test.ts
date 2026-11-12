import { parseSkillManifest } from '@forgelex/legal-agents';
import { describe, expect, it } from 'vitest';
import { piecesFromManifest } from './pieces-from-manifest.js';

const hash = 'a'.repeat(64);
const entry = (id: string, extra: Record<string, unknown>) => ({
  id,
  version: 1,
  kind: 'FORM',
  areas: ['penal'],
  documentType: id,
  roles: ['legal-drafter'],
  contentHash: hash,
  byteLength: 10,
  provenance: {
    origin: 'MinutaIA',
    originalVersion: 1,
    originalHash: hash,
    decision: { id: 'DEC-4', date: '2026-11-12' },
  },
  reviewState: 'eligible',
  ...extra,
});
const { areas: _areas, documentType: _documentType, ...base } = entry('materia', { label: 'Matéria' });
const matter = { ...base, kind: 'MATTER', area: 'penal', topic: 'materia' };
const manifest = parseSkillManifest({
  schemaVersion: 1,
  version: 'm1',
  createdAt: '2026-11-12',
  entries: [
    entry('resposta-acusacao', { label: 'Resposta à acusação', triggers: ['defesa preliminar'] }),
    entry('oficio', { areas: [], transversal: true, label: 'Ofício' }),
    entry('sem-rotulo', {}),
    entry('pendente', { label: 'Pendente', reviewState: 'pending' }),
    matter,
    entry('repetida', { label: 'Repetida v1' }),
    entry('repetida', { label: 'Repetida v2', version: 2, reviewState: 'eligible' }),
  ],
});

describe('lista de peças do catálogo', () => {
  it('traz só Formas elegíveis com rótulo, uma por tipo, com áreas, marca transversal e expressões', () => {
    const pieces = piecesFromManifest(manifest);
    expect(pieces.map(({ id }) => id)).toEqual(['oficio', 'repetida', 'resposta-acusacao']);
    expect(pieces.find(({ id }) => id === 'resposta-acusacao')).toEqual({
      id: 'resposta-acusacao',
      label: 'Resposta à acusação',
      areas: ['penal'],
      transversal: false,
      triggers: ['defesa preliminar'],
    });
    expect(pieces.find(({ id }) => id === 'oficio')).toMatchObject({ areas: [], transversal: true, triggers: [] });
    expect(pieces.find(({ id }) => id === 'repetida')?.label).toBe('Repetida v2');
  });
});
