import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogId, citations, mapCatalog } from './map-catalog.mjs';

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
    catalogId: 'abandono-funcao-cp-323',
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

test('identificador do catálogo: igual ao stableId quando seguro, sem acento e com sufixo de hash quando não', () => {
  assert.equal(catalogId('acao-alimentos'), 'acao-alimentos');
  const safe = catalogId('federalismo-fiscal-repartição-receitas');
  assert.match(safe, /^federalismo-fiscal-reparticao-receitas-[0-9a-f]{8}$/);
  assert.equal(catalogId('federalismo-fiscal-repartição-receitas'), safe);
  assert.notEqual(catalogId('x-ç'), catalogId('x-ã'));
});

test('decisão de Boni tira a Forma da fila: áreas explícitas ou transversal, com motivo, autor e data', () => {
  const base = [item('forma', 'oficio'), item('forma', 'procuracao')];
  const decide = (extra) => ({
    stableId: 'oficio',
    reason: 'moldura',
    decidedBy: 'Boni',
    date: '2026-11-12',
    ...extra,
  });
  const open = mapCatalog(inventory(base));
  assert.equal(open.results[0].status, 'queue');
  const decided = mapCatalog(inventory(base), [decide({ transversal: true })]);
  assert.equal(decided.results[0].status, 'mapped');
  assert.equal(decided.results[0].transversal, true);
  assert.deepEqual(decided.results[0].areas, []);
  assert.equal(decided.results[0].confidence, 'decisao');
  assert.equal(decided.results[0].evidence.decision.decidedBy, 'Boni');
  assert.equal(decided.report.duplicateKeys.length, 0);
  const withAreas = mapCatalog(inventory(base), [decide({ areas: ['civil', 'trabalho'] })]);
  assert.deepEqual(withAreas.results[0].areas, ['civil', 'trabalho']);
});

test('decisão inválida é recusada: sem áreas nem transversal, com os dois, sem autor, duplicada ou para ficha desconhecida', () => {
  const inv = inventory([item('forma', 'oficio'), item('materia', 'tema-x', { area: 'penal' })]);
  const ok = { stableId: 'oficio', reason: 'r', decidedBy: 'Boni', date: '2026-11-12' };
  assert.throws(() => mapCatalog(inv, [{ ...ok }]), /áreas ou de transversal/);
  assert.throws(() => mapCatalog(inv, [{ ...ok, transversal: true, areas: ['civil'] }]), /áreas ou de transversal/);
  assert.throws(() => mapCatalog(inv, [{ ...ok, transversal: true, decidedBy: '' }]), /motivo, autor ou data/);
  assert.throws(
    () =>
      mapCatalog(inv, [
        { ...ok, transversal: true },
        { ...ok, transversal: true },
      ]),
    /duplicada/,
  );
  assert.throws(() => mapCatalog(inv, [{ ...ok, stableId: 'nao-existe', transversal: true }]), /desconhecida/);
  assert.throws(() => mapCatalog(inv, [{ ...ok, stableId: 'tema-x', transversal: true }]), /só vale para Forma/);
});

test('duas Formas transversais para o mesmo tipo de peça aparecem como chave duplicada', () => {
  const inv = inventory([item('forma', 'oficio'), item('forma', 'oficio-b', { documentType: 'oficio' })]);
  const d = (stableId) => ({ stableId, transversal: true, reason: 'r', decidedBy: 'Boni', date: '2026-11-12' });
  assert.equal(mapCatalog(inv, [d('oficio'), d('oficio-b')]).report.duplicateKeys.length, 0);
});
