import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareCatalogLot } from './prepare-catalog-lot.mjs';

const items = [
  { stableId: 'resposta-acusacao', version: 3, category: 'forma', documentType: 'resposta-acusacao' },
  { stableId: 'cadeia-custodia-cpp-158', version: 3, category: 'materia', area: 'processo-penal' },
  { stableId: 'contestacao-civel', version: 3, category: 'forma', documentType: 'contestacao-civel' },
  { stableId: 'adimplemento-pagamento-cc-304', version: 2, category: 'materia', area: 'civil' },
].map((item) => ({
  ...item,
  sha256Content: 'a'.repeat(64),
  contentBytes: 42,
  content: 'Texto capturado fora do lote',
  reviewReasons: item.area === 'civil' ? ['AREA_OR_SUBAREA_UNDECLARED'] : [],
}));
const inventory = { archiveSha256: 'b'.repeat(64), source: 'Fixture', counts: { forma: 2, materia: 2 }, items };

test('projeta origem, versão e escopo para avaliação e exclui os corpos das fichas', () => {
  const lot = prepareCatalogLot(inventory);
  assert.equal(lot.inventory.archiveSha256, inventory.archiveSha256);
  assert.equal(lot.inventory.total, 4);
  assert.deepEqual(
    lot.candidates.map(({ area, category, eligibility }) => [area, category, eligibility]),
    [
      ['penal', 'forma', 'pending'],
      ['penal', 'materia', 'pending'],
      ['civel', 'forma', 'pending'],
      ['civel', 'materia', 'pending'],
    ],
  );
  assert.deepEqual(lot.candidates[3].reviewReasons, ['AREA_OR_SUBAREA_UNDECLARED']);
  assert.equal(lot.candidates[3].sha256Content, 'a'.repeat(64));
  assert.doesNotMatch(JSON.stringify(lot), /Texto capturado fora do lote/);
});

test('rejeita versão ausente, candidato ambíguo e mudança na área declarada', () => {
  for (const changed of [
    items.filter(({ stableId }) => stableId !== 'contestacao-civel'),
    [...items, items[0]],
    items.map((item) => (item.area === 'civil' ? { ...item, area: 'empresarial' } : item)),
  ]) {
    assert.throws(() => prepareCatalogLot({ ...inventory, items: changed }), /Candidato divergente/);
  }
});
