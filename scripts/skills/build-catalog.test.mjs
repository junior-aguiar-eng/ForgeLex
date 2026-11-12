import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildCatalog } from './build-catalog.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const row = (stableId, version, content) => ({
  stableId,
  version,
  content,
  sha256Content: sha(content),
  contentBytes: Buffer.byteLength(content),
});
const rows = [
  row('resposta-acusacao', 3, 'Texto original da resposta.'),
  row('acao-alimentos', 2, 'Texto de alimentos.'),
  row('agravo-interno', 1, 'Texto genérico.'),
  row('cadeia-custodia-cpp-158', 3, 'Texto da cadeia de custódia.'),
  row('sem-artigo', 1, 'Sem referência a artigo.'),
  row('com-alerta', 1, 'Cita artigo inexistente.'),
];
const map = {
  results: [
    {
      stableId: 'resposta-acusacao',
      kind: 'FORM',
      documentType: 'resposta-acusacao',
      areas: ['penal', 'processo-penal'],
      status: 'mapped',
    },
    {
      stableId: 'acao-alimentos',
      kind: 'FORM',
      documentType: 'acao-alimentos',
      areas: ['familia-sucessoes'],
      status: 'mapped',
    },
    {
      stableId: 'agravo-interno',
      kind: 'FORM',
      documentType: 'agravo-interno',
      areas: ['processo-civil'],
      status: 'queue',
      queueReason: 'PROCEDURAL_AREA_UNCONFIRMED',
    },
    {
      stableId: 'cadeia-custodia-cpp-158',
      kind: 'MATTER',
      area: 'penal',
      topic: 'cadeia-custodia-cpp-158',
      status: 'mapped',
    },
    { stableId: 'sem-artigo', kind: 'MATTER', area: 'penal', topic: 'sem-artigo', status: 'mapped' },
    { stableId: 'com-alerta', kind: 'MATTER', area: 'civil', topic: 'com-alerta', status: 'mapped' },
  ],
};
const crossed = (stableId, state, alerts = []) => ({
  stableId,
  state,
  alerts,
  crossChecks: state === 'sem-alerta' ? ['norma-existencia', 'norma-vigencia'] : [],
});
const crosscheck = {
  results: [
    crossed('resposta-acusacao', 'sem-alerta'),
    crossed('acao-alimentos', 'sem-alerta'),
    crossed('agravo-interno', 'sem-alerta'),
    crossed('cadeia-custodia-cpp-158', 'sem-alerta'),
    crossed('sem-artigo', 'sem-referencia-verificavel'),
    crossed('com-alerta', 'alerta', [{ code: 'ARTICLE_REVOKED', law: 'cc', article: '757' }]),
  ],
};
const build = (extra = {}) =>
  buildCatalog({ rows, map, crosscheck, version: 'catalogo-teste', date: '2026-11-12', ...extra });
const byKey = (built) =>
  Object.fromEntries(built.manifest.entries.map((entry) => [`${entry.id}@${entry.version}`, entry]));

test('só a ficha mapeada e cruzada sem alerta fica elegível; o resto fica pendente e continua no catálogo', () => {
  const built = build();
  const entries = byKey(built);
  assert.equal(entries['acao-alimentos@2'].reviewState, 'eligible');
  assert.deepEqual(entries['acao-alimentos@2'].crossChecks, ['norma-existencia', 'norma-vigencia']);
  assert.equal(entries['agravo-interno@1'].reviewState, 'pending');
  assert.deepEqual(entries['agravo-interno@1'].alerts, ['MAP:PROCEDURAL_AREA_UNCONFIRMED']);
  assert.equal(entries['sem-artigo@1'].reviewState, 'pending');
  assert.deepEqual(entries['sem-artigo@1'].crossChecks, []);
  assert.deepEqual(entries['com-alerta@1'].alerts, ['ARTICLE_REVOKED:cc:757']);
  assert.equal(built.manifest.entries.length, 6);
  assert.equal(built.files.size, 6);
});

test('proveniência registra origem, versão e hash originais, a decisão e a data', () => {
  const entry = byKey(build())['acao-alimentos@2'];
  assert.deepEqual(entry.provenance, {
    origin: 'MinutaIA',
    originalVersion: 2,
    originalHash: sha('Texto de alimentos.'),
    decision: { id: 'DEC-4', date: '2026-11-12' },
  });
  assert.deepEqual(entry.roles, ['legal-drafter']);
  assert.equal(byKey(build())['cadeia-custodia-cpp-158@3'].roles[0], 'matter-analyst');
});

test('Lote 0: a original vira ajustada e a redação ajustada nasce elegível, ligada à original', () => {
  const adjusted = 'Redação ajustada pela conferência amostral.';
  const built = build({ lot0: new Map([['resposta-acusacao', adjusted]]) });
  const entries = byKey(built);
  assert.equal(entries['resposta-acusacao@3'].reviewState, 'adjusted');
  const next = entries['resposta-acusacao@4'];
  assert.equal(next.reviewState, 'eligible');
  assert.equal(next.contentHash, sha(adjusted));
  assert.deepEqual(next.provenance.adjustedFrom, { version: 3, hash: sha('Texto original da resposta.') });
  assert.deepEqual(next.crossChecks, ['conferencia-amostral']);
  assert.equal(built.files.get('resposta-acusacao@4.md'), adjusted);
  assert.equal(built.files.get('resposta-acusacao@3.md'), 'Texto original da resposta.');
  assert.equal(built.counts['eligible-lote-0'], 1);
});

test('alias de área vale só para a redação do Lote 0 e acrescenta, sem trocar a original', () => {
  const lot0 = new Map([
    ['resposta-acusacao', 'Ajustada A.'],
    ['cadeia-custodia-cpp-158', 'Ajustada B.'],
  ]);
  const aliases = new Map([['penal', 'penal-piloto']]);
  const entries = byKey(build({ lot0, areaAliases: aliases }));
  assert.deepEqual(entries['resposta-acusacao@3'].areas, ['penal', 'processo-penal']);
  assert.deepEqual(entries['resposta-acusacao@4'].areas, ['penal', 'processo-penal', 'penal-piloto']);
  assert.equal(entries['cadeia-custodia-cpp-158@3'].area, 'penal');
  assert.equal(entries['cadeia-custodia-cpp-158@4'].area, 'penal-piloto');
});

test('ficha sem mapa, sem cruzamento ou com identificador fora do formato é recusada', () => {
  assert.throws(() => build({ map: { results: [] } }), /sem mapa/);
  assert.throws(
    () =>
      build({
        rows: [row('Ação inválida!', 1, 'x')],
        map: { results: [{ stableId: 'Ação inválida!', kind: 'MATTER', area: 'a', topic: 'a', status: 'mapped' }] },
        crosscheck: { results: [{ stableId: 'Ação inválida!', state: 'sem-alerta', alerts: [], crossChecks: [] }] },
      }),
    /formato/,
  );
});

test('Forma transversal sai no manifesto sem áreas e com a marca; o alias não a transforma em área', () => {
  const transversal = {
    ...map,
    results: map.results.map((result) =>
      result.stableId === 'agravo-interno'
        ? { ...result, areas: [], transversal: true, status: 'mapped', queueReason: undefined }
        : result,
    ),
  };
  const { manifest } = buildCatalog({
    rows,
    map: transversal,
    crosscheck,
    version: 'v1',
    date: '2026-11-12',
  });
  const entry = manifest.entries.find((candidate) => candidate.id === 'agravo-interno');
  assert.deepEqual(entry.areas, []);
  assert.equal(entry.transversal, true);
  assert.equal(entry.documentType, 'agravo-interno');
});

test('precedente não verificado e fonte documental: o primeiro fica pendente com a marca, o segundo elegível', () => {
  const state = (result) =>
    buildCatalog({
      rows,
      map,
      crosscheck: {
        results: crosscheck.results.map((item) =>
          item.stableId === 'resposta-acusacao' ? { ...item, ...result } : item,
        ),
      },
      version: 'v1',
      date: '2026-11-12',
    }).manifest.entries.find((entry) => entry.id === 'resposta-acusacao');
  const pending = state({ state: 'precedente-nao-verificado', crossChecks: [] });
  assert.equal(pending.reviewState, 'pending');
  assert.deepEqual(pending.alerts, ['PRECEDENT_UNVERIFIED']);
  const documentary = state({ state: 'sem-alerta', crossChecks: ['fonte-documental'] });
  assert.equal(documentary.reviewState, 'eligible');
  assert.deepEqual(documentary.crossChecks, ['fonte-documental']);
});

test('Lote 1: a original com alerta vira ajustada, guarda o alerta e a redação atualizada nasce elegível com a conferência', () => {
  const alerted = {
    results: crosscheck.results.map((item) =>
      item.stableId === 'resposta-acusacao'
        ? {
            ...item,
            state: 'alerta',
            alerts: [{ code: 'ARTICLE_REVOKED', law: 'cc', article: '757' }],
            crossChecks: [],
          }
        : item,
    ),
  };
  const built = buildCatalog({
    rows,
    map,
    crosscheck: alerted,
    lot1: new Map([['resposta-acusacao', 'Texto atualizado.']]),
    lot1Checks: new Map([['resposta-acusacao', ['norma-existencia', 'norma-vigencia', 'norma-atualizada']]]),
    version: 'v1',
    date: '2026-11-12',
  });
  const [original, updated] = built.manifest.entries.filter((entry) => entry.id === 'resposta-acusacao');
  assert.equal(original.reviewState, 'adjusted');
  assert.deepEqual(original.alerts, ['ARTICLE_REVOKED:cc:757']);
  assert.equal(updated.reviewState, 'eligible');
  assert.deepEqual(updated.alerts, []);
  assert.deepEqual(updated.crossChecks, ['norma-existencia', 'norma-vigencia', 'norma-atualizada']);
  assert.equal(updated.provenance.adjustedFrom.version, original.version);
  assert.equal(built.counts['eligible-lote-1'], 1);
});
