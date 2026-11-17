const LIMIT = 80;

/**
 * Nome sugerido para o caso criado a partir da conversa: a primeira frase do pedido, curta. É só uma sugestão: o
 * cliente edita antes de criar, e o caso nasce somente com o nome (nada do pedido vai junto).
 */
export function caseNameFrom(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const sentence = firstLine.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? '';
  const clean = sentence.replace(/[.!?:;,\s]+$/u, '');
  if (clean.length <= LIMIT) return clean;
  const cut = clean.slice(0, LIMIT);
  const lastSpace = cut.lastIndexOf(' ');
  const base = (lastSpace > LIMIT / 2 ? cut.slice(0, lastSpace) : cut).replace(/[.!?:;,\s]+$/u, '');
  return `${base}…`;
}
