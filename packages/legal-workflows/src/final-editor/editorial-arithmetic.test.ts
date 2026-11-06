import { describe, expect, it } from 'vitest';
import { editorialArithmeticFindings } from './editorial-arithmetic.js';
const doc = (content: string) => ({
  title: 'Peça sintética',
  documentType: 'Manifestação',
  sections: [{ title: 'Fatos', content, sourceIds: [] }],
});
const actualText =
  'As parte informa que os documento foi recebido em 3 de novembro de 2026. A Cliente Modelo solicitou à Empresa Aurora, ambas fictícias, a conferência de três parcelas de R$ 100,00 cada. O total indicado no relato é R$ 200,00.';
it('aponta a divergência do ensaio sem corrigir o documento ou afirmar o valor devido', () => {
  const document = doc(actualText),
    before = structuredClone(document);
  const findings = editorialArithmeticFindings(document);
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({ code: 'EDITORIAL_ARITHMETIC_MISMATCH', severity: 'WARNING', sourceIds: [] });
  expect(findings[0].statement).toContain('3 × R$ 100,00 = R$ 300,00');
  expect(findings[0].statement).toContain('R$ 200,00');
  expect(findings[0].statement).toContain('Sem acréscimos ou abatimentos');
  expect(findings[0].statement).toContain('não valida');
  expect(document).toEqual(before);
});
describe('relações explícitas de parcelas e total', () => {
  it.each([
    ['2 parcelas de R$ 0,10 cada. Total: R$ 0,30.', 'R$ 0,20'],
    ['12 parcelas de R$ 1.234,56 cada, totalizando R$ 14.000,00.', 'R$ 14.814,72'],
    ['duas parcelas de R$ 25 cada. Total informado de R$ 40.', 'R$ 50,00'],
    ['vinte parcelas de R$ 100,01 cada. O total declarado é R$ 2.000,00.', 'R$ 2.000,20'],
  ])('confere %s em centavos inteiros', (text, expected) => {
    expect(editorialArithmeticFindings(doc(text))[0]?.statement).toContain(expected);
  });
  it.each([
    '3 parcelas de R$ 100,00 cada. O total indicado no relato é R$ 300,00.',
    '3 parcelas de R$ 0,10 cada. Total: R$ 0,30.',
    'duas parcelas de R$ 1.000,05 cada, totalizando R$ 2.000,10.',
    '3 parcelas de R$ 100,00 cada. Total com desconto: R$ 200,00.',
    '3 parcelas de R$ 100,00 cada, descontados R$ 100,00. Total: R$ 200,00.',
    'até 3 parcelas de R$ 100,00 cada. Total: R$ 200,00.',
    'aproximadamente 3 parcelas de R$ 100,00 cada. Total: R$ 200,00.',
    '3 parcelas de R$ 100,00 cada. Outro contrato tem total de R$ 200,00.',
    '3 parcelas de R$ 100,00 cada.\n\nO total é R$ 200,00.',
    '3 parcelas de R$ 100.50 cada. Total: R$ 200,00.',
    '3 parcelas de R$ -100,00 cada. Total: R$ 200,00.',
    '-3 parcelas de R$ 100,00 cada. Total: R$ 200,00.',
  ])('não inventa divergência em %s', (text) => expect(editorialArithmeticFindings(doc(text))).toEqual([]));
});
it('não associa quantidades e totais de seções diferentes e usa IDs estáveis', () => {
  const d = doc('3 parcelas de R$ 100,00 cada.');
  d.sections.push({ title: 'Outro contrato', content: 'O total é R$ 200,00.', sourceIds: [] });
  expect(editorialArithmeticFindings(d)).toEqual([]);
  expect(editorialArithmeticFindings(doc(actualText))).toEqual(editorialArithmeticFindings(doc(actualText)));
});
it('informa explicitamente o limite de alertas sem truncar findings existentes', () => {
  const findings = editorialArithmeticFindings(doc('2 parcelas de R$ 10,00 cada. Total: R$ 15,00. '.repeat(51)));
  expect(findings).toHaveLength(51);
  expect(findings.at(-1)?.code).toBe('EDITORIAL_ARITHMETIC_LIMIT');
});
