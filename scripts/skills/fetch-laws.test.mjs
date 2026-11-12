import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateUrls, parseCode } from './fetch-laws.mjs';

test('código de norma: tipo e número; formato inválido é recusado', () => {
  assert.deepEqual(parseCode('lei9430'), { kind: 'lei', number: '9430' });
  assert.deepEqual(parseCode('lc214'), { kind: 'lc', number: '214' });
  assert.deepEqual(parseCode('decreto13095'), { kind: 'decreto', number: '13095' });
  assert.throws(() => parseCode('portaria18'), /inválido/);
  assert.throws(() => parseCode('lei'), /inválido/);
});

test('URLs candidatas do Planalto seguem o período do mandato e o tipo da norma', () => {
  assert.equal(
    candidateUrls('lei', '15352', 2026)[0],
    'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15352.htm',
  );
  assert.equal(
    candidateUrls('decreto', '13095', 2026)[0],
    'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/D13095.htm',
  );
  assert.ok(candidateUrls('lei', '9430', 1996).includes('https://www.planalto.gov.br/ccivil_03/leis/L9430.htm'));
  assert.ok(candidateUrls('lc', '214', 2025).includes('https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm'));
  assert.ok(
    candidateUrls('ec', '132', 2023).includes(
      'https://www.planalto.gov.br/ccivil_03/constituicao/Emendas/Emc/emc132.htm',
    ),
  );
});
