/**
 * Executa uma ação por chave, uma de cada vez. Uma segunda chamada com a mesma chave enquanto a primeira não terminou é
 * ignorada. Serve para ações que não podem ser repetidas por clique duplo, como gravar um documento por uma rota sem chave
 * de idempotência: o estado do React só muda no próximo ciclo, e dois cliques rápidos passariam os dois.
 */
export function createSingleFlight() {
  const active = new Set<string>();
  return {
    isActive: (key: string) => active.has(key),
    /** Devolve `false` sem executar quando a chave já está em andamento. */
    async run(key: string, action: () => Promise<void>): Promise<boolean> {
      if (active.has(key)) return false;
      active.add(key);
      try {
        await action();
      } finally {
        active.delete(key);
      }
      return true;
    },
  };
}
