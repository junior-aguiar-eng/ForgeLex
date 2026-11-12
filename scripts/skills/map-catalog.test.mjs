import assert from 'node:assert/strict';
import test from 'node:test';
import { citations, mapCatalog } from './map-catalog.mjs';

const item = (category, stableId, extra = {}) => ({
  category,
  stableId,
  title: stableId,
  documentType: category === 'forma' ? stableId : null,
  area: null,
  subarea: null,
  triggers: [],
  description: '',
  ...extra,
});
const inventory = (items) => ({ archiveSha256: 'x'.repeat(64), items });

test('Matéria usa a área declarada e o stableId como tópico', () => {
  const map = mapCatalog(inventory([item('materia', 'abandono-funcao-cp-323', { area: 'penal', subarea: null })]));
  assert.deepEqual(map.results[0], {
    stableId: 'abandono-funcao-cp-323',
    kind: 'MATTER',
    area: 'penal',
    topic: 'abandono-funcao-cp-323',
    subarea: null,
    confidence: 'alta',
    status: 'mapped',
  });
});

test('Forma: a regra por nome atribui a área e o stableId vira o tipo de peça', () => {
  const map = mapCatalog(inventory([item('forma', 'acao-alimentos'), item('forma', 'reclamacao-trabalhista')]));
  const [alimentos, trabalhista] = map.results;
  assert.deepEqual(alimentos.areas, ['familia-sucessoes']);
  assert.equal(alimentos.documentType, 'acao-alimentos');
  assert.deepEqual(trabalhista.areas, ['trabalho']);
  assert.equal(alimentos.status, 'mapped');
});

test('dois tipos de origem iguais deixam de colidir: a chave é o stableId', () => {
  const map = mapCatalog(
    inventory([
      item('forma', 'notificacao-extrajudicial', { documentType: 'notificacao-extrajudicial' }),
      item('forma', 'notificacao-extrajudicial-civel', { documentType: 'notificacao-extrajudicial' }),
    ]),
  );
  assert.deepEqual(map.report.duplicateKeys, []);
  assert.deepEqual(map.report.forma.sharedSourceDocumentType, ['notificacao-extrajudicial']);
  assert.notEqual(map.results[0].documentType, map.results[1].documentType);
});

test('peça processual sem ramo vai para a fila e nenhuma ficha fica sem resultado', () => {
  const map = mapCatalog(inventory([item('forma', 'agravo-interno'), item('forma', 'zzz-sem-pista')]));
  assert.equal(map.report.withResult, 2);
  assert.equal(map.report.queued, 2);
  assert.deepEqual(map.queue.map((q) => q.queueReason).sort(), ['NO_AREA_EVIDENCE', 'PROCEDURAL_AREA_UNCONFIRMED']);
  assert.equal(map.report.mapped + map.report.queued, map.counts.total);
});

test('sobrescrita explícita fixa a área e registra o motivo', () => {
  const map = mapCatalog(inventory([item('forma', 'agravo-peticao')]));
  assert.deepEqual(map.results[0].areas, ['trabalho']);
  assert.match(map.results[0].evidence.override, /CLT/);
  assert.equal(map.results[0].status, 'mapped');
});

test('votos por citações confirmam a regra; discordância vai para a fila como conflito', () => {
  const materias = [1, 2, 3].map((n) =>
    item('materia', `m-${n}`, { area: 'familia-sucessoes', triggers: ['CPC 528', 'CC 1.696'] }),
  );
  const confirmado = item('forma', 'acao-alimentos', { triggers: ['CPC 528', 'CC 1.696'] });
  const conflitante = item('forma', 'recurso-especial', { triggers: ['CPC 528', 'CC 1.696'] });
  const map = mapCatalog(inventory([...materias, confirmado, conflitante]));
  const byId = Object.fromEntries(map.results.map((r) => [r.stableId, r]));
  assert.equal(byId['acao-alimentos'].confidence, 'alta');
  assert.equal(byId['recurso-especial'].confidence, 'conflito');
  assert.equal(byId['recurso-especial'].status, 'queue');
});

test('stableId duplicado no inventário é recusado', () => {
  assert.throws(
    () => mapCatalog(inventory([item('forma', 'a'), item('materia', 'a', { area: 'penal' })])),
    /duplicado/,
  );
});

test('extrai citações normativas e súmulas', () => {
  const found = citations('Súmula 309 STJ; CPC 528; CC 1.696 e Lei 5.478/1968');
  assert.ok(found.has('cpc 528'));
  assert.ok(found.has('cc 1.696'));
  assert.ok(found.has('sumula 309 stj'));
  assert.ok(found.has('lei 5.478/1968'));
});
