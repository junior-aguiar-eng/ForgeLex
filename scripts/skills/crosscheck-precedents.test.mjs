import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  crosscheckPrecedents,
  extractReferences,
  parseCsv,
  parseStfList,
  parseStjSumulas,
  parseStjTemas,
  verifyReference,
} from './crosscheck-precedents.mjs';

const sources = {
  stjSumulas: parseStjSumulas(
    'q SÚMULA 7 VEJA MAIS\nEnunciado x\n\nq SÚMULA 8 (SÚMULA CANCELADA) VEJA MAIS\nEnunciado y\n\nq SÚMULA 9 (SÚMULA ALTERADA) VEJA MAIS\nEnunciado z\n',
  ),
  stfSumulas: parseStfList('[Súmula 1](a)\n[Súmula 3 *(superada)*](b)\n[Súmula 4 *(cancelada)*](c)', false),
  stfSv: parseStfList('[Súmula Vinculante 1](a)\n[Súmula Vinculante 2](b)', true),
  stjTemas: parseStjTemas(
    'sequencialPrecedente,tipoPrecedente,numeroPrecedente,situacao,teseFirmada\n1,Tema,10,Trânsito em Julgado,"tese, com vírgula\ne quebra"\n2,Tema,11,Cancelado,x\n3,Controvérsia,12,Afetado,y\n',
  ),
};

test('lê as listas oficiais: súmulas do STJ, STF, vinculantes e temas, inclusive CSV com aspas e quebra de linha', () => {
  assert.deepEqual(
    [...sources.stjSumulas],
    [
      [7, { status: 'vigente' }],
      [8, { status: 'cancelada' }],
      [9, { status: 'vigente' }],
    ],
  );
  assert.equal(sources.stfSumulas.get(3).status, 'superada');
  assert.equal(sources.stfSv.size, 2);
  assert.equal(sources.stjTemas.get(10).status, 'vigente');
  assert.equal(sources.stjTemas.get(11).status, 'cancelado');
  assert.equal(sources.stjTemas.has(12), false, 'controvérsia não é tema');
  assert.deepEqual(parseCsv('a,"b,c"\n1,"x""y"\n'), [
    ['a', 'b,c'],
    ['1', 'x"y'],
  ]);
});

test('extrai súmulas em lista, o tribunal ao redor, vinculantes, temas e contexto histórico', () => {
  const refs = extractReferences(
    'Súmulas 7, 8 e 9 do STJ. Súmula Vinculante 2. STF Súmula 4. Tema 10 do STJ. Tema Repetitivo 11. Súmula 99 antiga do STJ.',
  );
  const pick = (kind, court, number) => refs.find((r) => r.kind === kind && r.court === court && r.number === number);
  assert.ok(pick('sumula', 'STJ', 7) && pick('sumula', 'STJ', 8) && pick('sumula', 'STJ', 9));
  assert.ok(pick('sv', 'STF', 2));
  assert.ok(pick('sumula', 'STF', 4));
  assert.ok(pick('tema', 'STJ', 10) && pick('tema', 'STJ', 11));
  assert.equal(pick('sumula', 'STJ', 99).historical, true);
});

test('atribui o tribunal certo e reconhece o histórico nos casos reais do catálogo', () => {
  const one = (text, kind, number) => extractReferences(text).find((r) => r.kind === kind && r.number === number);
  assert.equal(one('| STF (Tema 810) | STJ (Tema 905) |', 'tema', 810).court, 'STF');
  assert.equal(one('Confundir Tema 745 (alíquota) com Tema 986 STJ (TUST)', 'tema', 745).court, '?');
  assert.equal(
    one('A TNU revisou o Tema 206 diante do Tema 1.129 STJ e fixou no Tema 386: 1. É legal', 'tema', 386).court,
    '?',
  );
  assert.equal(one('STF Tema 815 e STJ admitem área inferior', 'tema', 815).court, 'STF');
  assert.equal(one('STF (Tema 906) + STJ (Tema 912)', 'tema', 906).court, 'STF');
  assert.equal(
    one('admissibilidade restritiva STF/STJ (HC substitutivo + Súm. 691 + esgotamento)', 'sumula', 691).court,
    '?',
  );
  assert.equal(one('restritiva\\nSTF/STJ (HC substitutivo + Súm. 691 + esgotamento)', 'sumula', 691).court, '?');
  assert.equal(one('(Temas 687-689, 1.170 e 1.252 STJ, Súm. 688 e Temas 20/985 STF)', 'sumula', 688).court, '?');
  assert.equal(one('Aplicar a Súmula 7 do STJ ao caso', 'sumula', 7).court, 'STJ');
  assert.equal(one('Súm. 394 STF e outras', 'sumula', 394).court, 'STF');
  for (const text of [
    'com cancelamento da Súm. 512 STJ',
    'STJ cancelou a Súm. 408 em 2020',
    'supera Súm. 276 STJ',
    'superando a Súm. 105 STF e a Súm. 61 STJ',
    'baliza reafirmada pelo STJ ao cancelar o Tema 479, em 2026',
  ]) {
    assert.equal(
      extractReferences(text).every((r) => r.historical),
      true,
      text,
    );
  }
});

test('“alterada” é aviso (a súmula segue em vigor com outra redação), não alerta', () => {
  const state = verifyReference({ kind: 'sumula', court: 'STF', number: 3, historical: false }, sources).state;
  assert.equal(state, 'alert');
  const altered = { ...sources, stfSumulas: parseStfList('[Súmula 359 *(alterada)*](a)', false) };
  assert.equal(
    verifyReference({ kind: 'sumula', court: 'STF', number: 359, historical: false }, altered).state,
    'warning',
  );
});

test('classifica: existe, cancelada, inexistente, histórica e não conferida', () => {
  const v = (kind, court, number, historical = false) =>
    verifyReference({ kind, court, number, historical }, sources).state;
  assert.equal(v('sumula', 'STJ', 7), 'ok');
  assert.equal(v('sumula', 'STJ', 8), 'alert');
  assert.equal(v('sumula', 'STJ', 8, true), 'historical');
  assert.equal(v('sumula', 'STJ', 500), 'alert');
  assert.equal(v('sumula', 'STF', 3), 'alert');
  assert.equal(v('sv', 'STF', 2), 'ok');
  assert.equal(v('tema', 'STJ', 11), 'alert');
  assert.equal(v('sumula', 'TST', 100), 'not-checked');
  assert.equal(v('sumula', '?', 7), 'not-checked', 'existe no STJ, mas sem tribunal declarado não confere a tese');
  assert.equal(v('sumula', '?', 100), 'warning', 'não existe nem no STJ nem no STF');
  assert.equal(v('tema', '?', 10), 'not-checked');
});

test('o relatório agrega por referência, lista só identificadores de ficha e conta o que não conferiu', async () => {
  const report = await crosscheckPrecedents(
    [
      { id: 'ficha-a', text: 'Aplique a Súmula 8 do STJ e a Súmula 7 do STJ.' },
      { id: 'ficha-b', text: 'A Súmula 8 do STJ também. Súmula 100 do TST.' },
    ],
    sources,
  );
  assert.equal(report.summary.alerta, 1);
  assert.equal(report.summary.ok, 1);
  assert.equal(report.summary.naoConferidas, 1);
  assert.deepEqual(report.alerts, [
    { kind: 'sumula', court: 'STJ', number: 8, reason: 'cancelada', fichas: ['ficha-a', 'ficha-b'] },
  ]);
  assert.ok(!JSON.stringify(report).includes('Aplique'), 'não vaza texto de ficha');
});
