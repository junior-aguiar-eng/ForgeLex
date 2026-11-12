import assert from 'node:assert/strict';
import test from 'node:test';
import { crosscheckCatalog, crosscheckItem, extractReferences, indexLaw } from './crosscheck-catalog.mjs';

const lawText = [
  'Art. 396. Nos procedimentos ordinário e sumário.',
  'Art. 396-A. Na resposta, o acusado poderá argüir preliminares.',
  '**A**rt. 107 - Extingue-se a punibilidade:',
  'Art.',
  '129. O disposto nesta Seção aplica-se por igual.',
  'Art. . 189 -',
  'Serão consideradas atividades insalubres.',
  'Art. 757.',
  '[(Revogado pela Lei nº 15.040, de 2024)](x.htm)',
  'Art. 758. Texto vigente do artigo seguinte.',
  'Art. 1.015. Cabe agravo de instrumento.',
  'Art. 59 - O juiz, atendendo à culpabilidade.',
].join('\n');

test('indexa cabeçalhos com negrito solto, quebra de linha e ponto extra, sem confundir "- O" com sufixo', () => {
  const index = indexLaw(lawText);
  for (const key of ['396', '396-A', '107', '129', '189', '757', '758', '1015', '59']) assert.ok(index.has(key), key);
  assert.ok(!index.has('59-O'));
});

test('o "(Revogado)" vale só para o artigo em que aparece', () => {
  const index = indexLaw(lawText);
  assert.equal(index.get('757').revoked, true);
  assert.equal(index.get('758').revoked, false);
  assert.equal(index.get('396').revoked, false);
});

test('extrai artigos nas duas formas, com intervalo, lista e milhar', () => {
  const found = (text) => extractReferences(text).map(({ law, article }) => `${law} ${article}`);
  assert.deepEqual(found('Ver CPP, arts. 158-A a 158-F e 563.'), ['cpp 158-A', 'cpp 158-F', 'cpp 563']);
  assert.deepEqual(found('Os arts. 396 e 396-A do CPP organizam a defesa.'), ['cpp 396', 'cpp 396-A']);
  assert.deepEqual(found('Cabe agravo (CPC art. 1.015).'), ['cpc 1015']);
  assert.deepEqual(found('O art. 5º, LVII, da CF veda.'), ['cf 5']);
  assert.deepEqual(found('Conforme CC 304 e CP 323.'), ['cc 304', 'cp 323']);
});

test('ignora número de processo, ano e artigo do ADCT', () => {
  const found = (text) => extractReferences(text).map(({ law, article }) => `${law} ${article}`);
  assert.deepEqual(found('Conflito de competência CC 219.826/SP.'), []);
  assert.deepEqual(found('Lei do CPC 2015 e CPC/2015.'), []);
  assert.deepEqual(found('Ver art. 10 do ADCT.'), []);
});

test('artigo inexistente e revogado viram alerta; sem referência verificável fica à parte', () => {
  const laws = { cpp: indexLaw(lawText), cc: indexLaw(lawText) };
  const item = (stableId, content) => ({ stableId, category: 'materia', content });
  const ok = crosscheckItem(item('a', 'Ver CPP, art. 396.'), laws);
  assert.equal(ok.state, 'sem-alerta');
  assert.deepEqual(ok.crossChecks, ['norma-existencia', 'norma-vigencia']);
  const missing = crosscheckItem(item('b', 'Ver CPP, art. 999.'), laws);
  assert.deepEqual(missing.alerts, [{ code: 'ARTICLE_NOT_FOUND', law: 'cpp', article: '999' }]);
  assert.deepEqual(missing.crossChecks, []);
  const revoked = crosscheckItem(item('c', 'Ver CC, art. 757.'), laws);
  assert.deepEqual(revoked.alerts, [{ code: 'ARTICLE_REVOKED', law: 'cc', article: '757' }]);
  const nothing = crosscheckItem(item('d', 'Texto sem artigo.'), laws);
  assert.equal(nothing.state, 'sem-referencia-verificavel');
  assert.deepEqual(nothing.crossChecks, []);
});

test('o relatório conta o que foi e o que não foi verificado', () => {
  const laws = { cpp: indexLaw(lawText) };
  const report = crosscheckCatalog(
    [
      { stableId: 'a', category: 'forma', content: 'CPP, art. 396. Súmula 309 STJ.' },
      { stableId: 'b', category: 'materia', content: 'CPP, art. 999.' },
      { stableId: 'c', category: 'materia', content: 'Sem referência.' },
    ],
    laws,
  );
  assert.equal(report.summary.crossed, 1);
  assert.equal(report.summary.withAlert, 1);
  assert.equal(report.summary.withoutVerifiableReference, 1);
  assert.equal(report.summary.precedentsNotChecked, 1);
  assert.ok(report.checksNotPerformed.includes('precedente-indice-stj'));
  assert.ok(report.checksNotPerformed.includes('contradicao-forma-materia'));
});
