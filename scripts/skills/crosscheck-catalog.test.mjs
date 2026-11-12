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

const itemOf = (stableId, content) => ({ stableId, category: 'materia', content });

test('menção histórica reconhecida pela própria ficha não é alerta; a citação seca de artigo revogado é', () => {
  const laws = { cc: indexLaw(lawText) };
  const historical = crosscheckItem(itemOf('h', 'O CC, art. 757 foi revogado pela Lei 15.040/2024.'), laws);
  assert.equal(historical.state, 'sem-alerta');
  assert.equal(historical.historicalReferences.length, 1);
  const stale = crosscheckItem(itemOf('s', 'Aplique o CC, art. 757 ao contrato de seguro.'), laws);
  assert.equal(stale.state, 'alerta');
  assert.equal(stale.historicalReferences.length, 0);
});

test('suplemento curado resolve com motivo, só para a ficha e o artigo indicados', () => {
  const laws = { cpp: indexLaw(lawText) };
  const supplements = {
    exists: [{ law: 'cpp', article: '999', source: 'Lei X, art. 1º' }],
    literal: [{ stableId: 'lit', law: 'cpp', article: '998', reason: 'transcreve outro artigo' }],
  };
  const exists = crosscheckItem(itemOf('x', 'Ver CPP, art. 999.'), laws, supplements);
  assert.equal(exists.state, 'sem-alerta');
  assert.equal(exists.resolvedBySupplement[0].reason, 'Lei X, art. 1º');
  assert.equal(crosscheckItem(itemOf('lit', 'Ver CPP, art. 998.'), laws, supplements).state, 'sem-alerta');
  assert.equal(crosscheckItem(itemOf('outra', 'Ver CPP, art. 998.'), laws, supplements).state, 'alerta');
});

test('lei esparsa: extrai "Lei 8.213/91, art. 59" e "art. 59 da Lei 8.213/1991" e confere no texto', () => {
  const found = (text) => extractReferences(text).map(({ law, article }) => `${law} ${article}`);
  assert.deepEqual(found('Lei 8.213/91, art. 59 e 60.'), ['lei8213 59', 'lei8213 60']);
  assert.deepEqual(found('O art. 59 da Lei nº 8.213/1991 trata do auxílio.'), ['lei8213 59']);
  assert.deepEqual(found('A Lei 99.999/2000, art. 3º, não é conferida.'), []);
  const laws = { lei8213: indexLaw('Art. 59. Auxílio-doença.\nArt. 60. Início.') };
  assert.equal(crosscheckItem(itemOf('p', 'Lei 8.213/91, art. 59.'), laws).state, 'sem-alerta');
  assert.equal(crosscheckItem(itemOf('q', 'Lei 8.213/91, art. 999.'), laws).state, 'alerta');
});

test('ficha sem artigo verificável informa o motivo', () => {
  const laws = {};
  const kind = (text) => crosscheckItem(itemOf('k', text), laws).unverifiedKind;
  assert.equal(kind('Modelo de ofício.'), 'sem-citacao');
  assert.equal(kind('Aplica a Súmula 7 do STJ.'), 'so-precedente');
  assert.equal(kind('Conforme a Lei 15.504/2026.'), 'norma-nao-carregada');
});

test('norma esparsa de qualquer tipo: LC, decreto, MP e EC; norma fora da lista não é conferida', () => {
  const found = (text, known) => extractReferences(text, known).map(({ law, article }) => `${law} ${article}`);
  const known = new Set(['lc214', 'decreto13095', 'mp1359', 'ec132']);
  assert.deepEqual(found('LC 214/2025, art. 329 e o art. 3º do Decreto 13.095/2026.', known), [
    'decreto13095 3',
    'lc214 329',
  ]);
  assert.deepEqual(found('A MP 1.359/2026, art. 2º, e a EC 132, art. 4º.', known), ['ec132 4', 'mp1359 2']);
  assert.deepEqual(found('Lei Complementar nº 999, art. 1º.', known), []);
});

test('sigla de uso corrente (LGPD) aponta para a norma; artigo sem lei vale só com a lei implícita da ficha', () => {
  const found = (text, implied) =>
    extractReferences(text, new Set(['lei13709']), implied).map(({ law, article }) => `${law} ${article}`);
  assert.deepEqual(found('LGPD, art. 33 e o art. 34 da LGPD.'), ['lei13709 33', 'lei13709 34']);
  const text = 'Impugne conforme o art. 351, o art. 430 do CPC e o art. 5º da CF.';
  assert.deepEqual(found(text), ['cf 5', 'cpc 430']);
  assert.deepEqual(found(text, 'cpc'), ['cf 5', 'cpc 351', 'cpc 430']);
});

test('lei implícita só entra por suplemento da ficha e passa pelas mesmas conferências', () => {
  const laws = { cpc: indexLaw('Art. 351. Réplica.\nArt. 350. Defesa indireta.') };
  const supplements = { impliedLaw: [{ stableId: 'replica', law: 'cpc', reason: 'só cita o CPC sem nomeá-lo' }] };
  const ok = crosscheckItem(itemOf('replica', 'Veja o art. 351 e o art. 350.'), laws, supplements);
  assert.equal(ok.state, 'sem-alerta');
  const bad = crosscheckItem(itemOf('replica', 'Veja o art. 999.'), laws, supplements);
  assert.equal(bad.state, 'alerta');
  assert.equal(
    crosscheckItem(itemOf('outra', 'Veja o art. 351.'), laws, supplements).state,
    'sem-referencia-verificavel',
  );
});

test('fonte documental conferida à mão tira a ficha de "sem referência"; precedentes ficam registrados à parte', () => {
  const supplements = {
    documentary: [{ stableId: 'oficio', source: 'Manual de Redação da Presidência, 3ª ed.', verifiedOn: '2026-11-12' }],
    precedents: [{ stableId: 'ag', verified: ['Tema 988 STJ'], unverified: ['REsp 1.803.925'] }],
  };
  const doc = crosscheckItem(itemOf('oficio', 'Modelo sem artigo.'), {}, supplements);
  assert.equal(doc.state, 'sem-alerta');
  assert.deepEqual(doc.crossChecks, ['fonte-documental']);
  assert.equal(doc.unverifiedKind, undefined);
  assert.equal(
    crosscheckItem(itemOf('outra', 'Modelo sem artigo.'), {}, supplements).state,
    'sem-referencia-verificavel',
  );
  const prec = crosscheckItem(itemOf('ag', 'Aplica o Tema 988 STJ.'), {}, supplements);
  assert.equal(prec.state, 'precedente-nao-verificado');
  assert.deepEqual(prec.precedents, { verified: ['Tema 988 STJ'], unverified: ['REsp 1.803.925'] });
});

test('precedentes todos verificados sustentam a ficha sem artigo; fonte documental soma à ficha com artigos; LSA aponta a Lei 6.404', () => {
  const supplements = {
    precedents: [{ stableId: 'p', verified: ['Tema 309 TST'], unverified: [] }],
    documentary: [{ stableId: 'd', source: 'Resolução CVM 23/2021', verifiedOn: '2026-11-12' }],
  };
  const prec = crosscheckItem(itemOf('p', 'Aplica o IRR 309.'), {}, supplements);
  assert.equal(prec.state, 'sem-alerta');
  assert.deepEqual(prec.crossChecks, ['precedente-existencia']);
  const laws = { lei6404: indexLaw('Art. 143. Diretoria.\nArt. 162. Conselho fiscal.') };
  const doc = crosscheckItem(itemOf('d', 'LSA 143 e LSA 162; RCVM 23 art. 31-B.'), laws, supplements);
  assert.equal(doc.state, 'sem-alerta');
  assert.deepEqual(doc.crossChecks, ['norma-existencia', 'norma-vigencia', 'fonte-documental']);
  assert.equal(crosscheckItem(itemOf('x', 'LSA 999.'), laws, {}).state, 'alerta');
});
