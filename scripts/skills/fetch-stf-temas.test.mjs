import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStfTemaPage } from './fetch-stf-temas.mjs';

const page = (repercussao, situacao) =>
  `<div class="tema-campo">Repercussão geral:</div>\n<p> \n  ${repercussao}\n </p>\n<div class="tema-campo">Data da Repercussão geral:</div>\n<p> 08/05/2020</p>\n` +
  (situacao ? `<div class="tema-campo">Situação:</div>\n<p> ${situacao}</p>` : '');

test('lê a repercussão geral e a situação, sem confundir com a “Data da Repercussão geral”', () => {
  assert.deepEqual(
    parseStfTemaPage(
      page('Não há repercussão geral (questão infraconstitucional)', 'Trânsito em Julgado - 26/08/2020'),
    ),
    {
      existe: true,
      repercussao: 'Não há repercussão geral (questão infraconstitucional)',
      situacao: 'Trânsito em Julgado - 26/08/2020',
    },
  );
});

test('página de tema inexistente não traz a situação', () => {
  const result = parseStfTemaPage('<html><body><p>Descrição:</p></body></html>');
  assert.equal(result.existe, false);
  assert.equal(result.situacao, undefined);
});

test('tolera a acentuação quebrada e as tags dentro do valor', () => {
  const html = '<div class="tema-campo">Situa��o:</div><p><b>Cancelado</b> - em 01/01/2020</p>';
  assert.equal(parseStfTemaPage(html).situacao, 'Cancelado - em 01/01/2020');
});
