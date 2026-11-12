import { parseSkillManifest } from '@forgelex/legal-agents';
import { describe, expect, it } from 'vitest';
import { matterToken, mattersFromManifest, suggestMatter, type DeskMatter } from './matter-suggestions.js';

const hash = 'a'.repeat(64);
const provenance = {
  origin: 'MinutaIA',
  originalVersion: 1,
  originalHash: hash,
  decision: { id: 'DEC-4', date: '2026-11-12' },
};
const matter = (topic: string, area: string, extra: Record<string, unknown> = {}) => ({
  id: topic,
  version: 1,
  kind: 'MATTER',
  area,
  topic,
  roles: ['matter-analyst'],
  contentHash: hash,
  byteLength: 10,
  provenance,
  reviewState: 'eligible',
  ...extra,
});

describe('sugestão de matéria (U4)', () => {
  const manifest = parseSkillManifest({
    schemaVersion: 1,
    version: 'm1',
    createdAt: '2026-11-12',
    entries: [
      matter('prescricao-intercorrente', 'civil', { label: 'Prescrição intercorrente' }),
      matter('prova-ilicita', 'processo-penal', { label: 'Prova ilícita' }),
      matter('sem-rotulo', 'civil'),
      matter('pendente', 'civil', { label: 'Pendente', reviewState: 'pending' }),
    ],
  });
  const matters = mattersFromManifest(manifest);

  it('lista só Matérias elegíveis com rótulo', () => {
    expect(matters.map(({ id }) => id)).toEqual(['prescricao-intercorrente', 'prova-ilicita']);
  });

  it('sugere uma matéria por vez, com código opaco e sem expor o id interno', () => {
    const first = suggestMatter({ matters, text: 'o réu alega prescrição intercorrente' });
    expect(first).toEqual({ token: matterToken('prescricao-intercorrente'), label: 'Prescrição intercorrente' });
    expect(JSON.stringify(first)).not.toContain('prescricao-intercorrente');
    expect(first?.token).toMatch(/^[a-f0-9]{16}$/);
  });

  it('respeita a área e as recusas, e não sugere nada sem correspondência', () => {
    const text = 'prescrição intercorrente e prova ilícita';
    expect(suggestMatter({ matters, text, area: 'processo-penal' })?.label).toBe('Prova ilícita');
    const refused = [matterToken('prescricao-intercorrente'), matterToken('prova-ilicita')];
    expect(suggestMatter({ matters, text, rejected: refused })).toBeNull();
    expect(suggestMatter({ matters, text: 'quero entender como proceder' })).toBeNull();
    expect(suggestMatter({ matters: [] as DeskMatter[], text })).toBeNull();
  });
});
