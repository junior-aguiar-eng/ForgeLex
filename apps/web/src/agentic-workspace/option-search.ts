/** Busca sem acento nem caixa: "familia" encontra "Família e sucessões". */
export function matchesSearch(label: string, query: string): boolean {
  const plain = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  return plain(label).includes(plain(query.trim()));
}
