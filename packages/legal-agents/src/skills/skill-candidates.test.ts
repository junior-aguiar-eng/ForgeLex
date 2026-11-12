import { describe, expect, it } from 'vitest';
import { matterCandidates, pickMatterTopic, type MatterCandidateSource } from './skill-candidates.js';

const catalog: MatterCandidateSource[] = [
  { area: 'penal', topic: 'abandono-funcao-cp-323', triggers: ['CP 323', 'abandono função', 'dever de função'] },
  { area: 'penal', topic: 'cadeia-custodia', triggers: ['cadeia de custódia', 'CPP 158-A', 'quebra da cadeia'] },
  { area: 'penal', topic: 'prova-ilicita', triggers: ['prova ilícita', 'CPP 157', 'derivação da prova'] },
  { area: 'civil', topic: 'adimplemento', triggers: ['adimplemento', 'CC 304', 'pagamento por terceiro'] },
  { area: 'civil', topic: 'cadeia-custodia', triggers: ['cadeia de custódia'] },
];

describe('candidatos de Matéria (M3.0)', () => {
  it('só considera fichas da mesma área, sem aceitar tópico igual de outra área', () => {
    const penal = matterCandidates(catalog, { area: 'penal', text: 'A cadeia de custódia foi quebrada.' });
    expect(penal.map(({ topic }) => topic)).toEqual(['cadeia-custodia']);
    const civil = matterCandidates(catalog, { area: 'civil', text: 'A cadeia de custódia foi quebrada.' });
    expect(civil.map(({ topic }) => topic)).toEqual(['cadeia-custodia']);
    expect(matterCandidates(catalog, { area: 'tributario', text: 'cadeia de custódia' })).toEqual([]);
  });

  it('ignora acento e caixa e ordena por pontuação, depois pelo tópico', () => {
    const text = 'PROVA ILICITA por quebra da cadeia de custodia (CPP 157)';
    const result = matterCandidates(catalog, { area: 'penal', text });
    expect(result.map(({ topic }) => topic)).toEqual(['cadeia-custodia', 'prova-ilicita']);
    expect(result[0].matched).toContain('quebra da cadeia');
    expect(result.every((candidate) => candidate.score > 0)).toBe(true);
    expect(matterCandidates([...catalog].reverse(), { area: 'penal', text })).toEqual(result);
  });

  it('sem gatilho no texto não há candidato, e palavras soltas comuns não bastam', () => {
    expect(matterCandidates(catalog, { area: 'penal', text: 'O réu pede a absolvição por falta de provas.' })).toEqual(
      [],
    );
    expect(matterCandidates(catalog, { area: 'penal', text: 'função' })).toEqual([]);
  });

  it('respeita o limite e recusa limite inválido', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      area: 'penal',
      topic: `tema-${String(index).padStart(2, '0')}`,
      triggers: ['prova ilícita'],
    }));
    expect(matterCandidates(many, { area: 'penal', text: 'prova ilícita' }, 3).map(({ topic }) => topic)).toEqual([
      'tema-00',
      'tema-01',
      'tema-02',
    ]);
    expect(() => matterCandidates(many, { area: 'penal', text: 'x' }, 0)).toThrow('INVALID_CANDIDATE_LIMIT');
  });

  it('a escolha de quem classifica só vale se estiver entre os candidatos oferecidos', () => {
    const candidates = matterCandidates(catalog, { area: 'penal', text: 'prova ilícita' });
    expect(pickMatterTopic(candidates, 'prova-ilicita')).toBe('prova-ilicita');
    expect(pickMatterTopic(candidates, 'adimplemento')).toBeUndefined();
    expect(pickMatterTopic(candidates, 'inventado')).toBeUndefined();
    expect(pickMatterTopic(candidates, undefined)).toBeUndefined();
    expect(pickMatterTopic([], 'prova-ilicita')).toBeUndefined();
  });
});

// Verificação contra o catálogo real (2.077 fichas), só quando o inventário local do R1 está indicado:
//   $env:FORGELEX_CATALOG_INVENTORY = '<caminho do catalog-inventory.json>'; pnpm exec vitest run skill-candidates
// O inventário fica fora do Git. Cada Matéria é consultada pelo próprio título e por dois dos seus gatilhos.
const inventoryPath = process.env.FORGELEX_CATALOG_INVENTORY;
describe.skipIf(!inventoryPath)('candidatos de Matéria no catálogo real', () => {
  it('a própria ficha aparece entre os oito candidatos em quase todas as consultas', async () => {
    const { readFile } = await import('node:fs/promises');
    const inventory = JSON.parse(await readFile(inventoryPath!, 'utf8')) as {
      items: { category: string; area: string; stableId: string; title: string; triggers: string[] }[];
    };
    const matters = inventory.items.filter((item) => item.category === 'materia');
    const sources = matters.map(({ area, stableId, triggers }) => ({ area, topic: stableId, triggers }));
    let found = 0;
    let top1 = 0;
    for (const matter of matters) {
      const text = [matter.title, ...matter.triggers.slice(0, 2)].join('. ');
      const result = matterCandidates(sources, { area: matter.area, text }, 8);
      if (result.some(({ topic }) => topic === matter.stableId)) found += 1;
      if (result[0]?.topic === matter.stableId) top1 += 1;
    }
    console.log(`Matérias: ${matters.length}; própria ficha entre 8: ${found}; em 1º: ${top1}`);
    expect(found / matters.length).toBeGreaterThan(0.9);
  }, 120_000);
});
