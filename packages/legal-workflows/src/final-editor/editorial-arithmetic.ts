import type { TaskDocumentSchema, TaskFindingSchema } from '@forgelex/domain';
import type { z } from 'zod';

const counts: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  três: 3,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezassete: 17,
  dezoito: 18,
  dezenove: 19,
  dezanove: 19,
  vinte: 20,
};
const money = String.raw`(?:\d{1,3}(?:\.\d{3})+|\d{1,12})(?:,\d{2})?(?![\d,]|\.\d)`;
const cents = (text: string) => {
  const [whole, fraction = '00'] = text.replaceAll('.', '').split(',');
  return BigInt(whole) * 100n + BigInt(fraction);
};
const brl = (value: bigint) =>
  `R$ ${(value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${(value % 100n).toString().padStart(2, '0')}`;

/** Checks explicit, adjacent installment/total statements only; no legal assessment or text replacement. */
export function editorialArithmeticFindings(
  document: z.infer<typeof TaskDocumentSchema>,
): z.infer<typeof TaskFindingSchema>[] {
  const findings: z.infer<typeof TaskFindingSchema>[] = [];
  const relation = new RegExp(
    String.raw`(?<![\p{L}\p{N}.,+−-])(?<count>\d{1,6}|${Object.keys(counts).join('|')})\s+parcelas?\s+de\s+R\$\s*(?<unit>${money})\s+cada\s*[.,;]?\s*(?:o\s+)?(?:totalizando|total(?:\s+(?:indicado|informado|declarado))?(?:\s+no\s+(?:relato|texto))?\s*(?:é|de|:|=))\s+R\$\s*(?<total>${money})`,
    'giu',
  );
  for (const [sectionIndex, section] of document.sections.entries()) {
    // Blank lines and section boundaries separate statements; never combine unrelated paragraphs.
    let paragraphOffset = 0;
    for (const paragraph of section.content.split(/(\n\s*\n)/)) {
      for (const match of paragraph.matchAll(relation)) {
        const prefix = paragraph.slice(Math.max(0, match.index - 40), match.index);
        if (/(?:até|cerca de|aproximadamente|entre|mais de|menos de)\s*$/iu.test(prefix)) continue;
        const countText = match.groups!.count.toLocaleLowerCase('pt-BR');
        const count = BigInt(counts[countText] ?? countText);
        if (count === 0n) continue;
        const unit = cents(match.groups!.unit),
          declared = cents(match.groups!.total),
          expected = count * unit;
        if (expected === declared) continue;
        if (findings.length === 50) {
          findings.push({
            id: 'editorial-arithmetic:v1:limit',
            code: 'EDITORIAL_ARITHMETIC_LIMIT',
            severity: 'WARNING',
            sourceIds: [],
            statement:
              'Foram encontrados mais de 50 pontos aritméticos a conferir. Os demais não foram detalhados; a conferência do documento não está completa.',
          });
          return findings;
        }
        findings.push({
          id: `editorial-arithmetic:v1:${sectionIndex}:${paragraphOffset + match.index}`,
          code: 'EDITORIAL_ARITHMETIC_MISMATCH',
          severity: 'WARNING',
          sourceIds: [],
          statement: `Seção “${section.title}”: possível divergência no total das parcelas. Sem acréscimos ou abatimentos, ${count} × ${brl(unit)} = ${brl(expected)}, mas o total informado é ${brl(declared)}. Confira os valores e eventuais ajustes; esta conta não valida fatos nem o valor devido e não altera o texto.`,
        });
      }
      paragraphOffset += paragraph.length;
    }
  }
  return findings;
}
