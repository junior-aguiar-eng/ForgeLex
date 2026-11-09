/**
 * Dicas de descoberta das ferramentas no `tools/list`.
 *
 * Hosts como o Claude escondem as ferramentas de conectores e as encontram por busca de palavras sobre o nome e a
 * descrição, sem ignorar acento e com o servidor do conector exibido por um identificador sem sentido. Os nomes
 * das ferramentas do ForgeLex são em inglês (`research.search_case_law`), então uma busca em português como
 * "buscar jurisprudencia furto" achava só o `enam-estudo` (`buscar_jurisprudencia`) e o ForgeLex parecia
 * indisponível. Aqui cada descrição ganha um prefixo que diz "ForgeLex" e usa o vocabulário em português, com e
 * sem acento, sem renomear nada (nomes são contrato com hosts e prompts já existentes).
 *
 * Cada dica descreve só o que a ferramenta faz hoje; a descrição original segue depois, intacta.
 */
export const MCP_TOOL_DISCOVERY_HINTS: Readonly<Record<string, string>> = {
  'research.search_case_law':
    'ForgeLex: buscar e pesquisar jurisprudência (jurisprudencia), precedentes e julgados do STJ por tema, tese ou processo.',
  'research.get_authority':
    'ForgeLex: abrir uma autoridade (precedente ou julgado) da jurisprudência (jurisprudencia) do STJ, com verificação e proveniência.',
  'research.verify_authority':
    'ForgeLex: verificar e conferir uma citação de jurisprudência (jurisprudencia) do STJ, expondo divergências.',
  'research.present_decisions':
    'ForgeLex: apresentar decisões e resultados de pesquisa de jurisprudência (jurisprudencia) em painel visual.',
  'research.save_search': 'ForgeLex: salvar uma pesquisa de jurisprudência (jurisprudencia) quando o usuário pedir.',
  'research.get_saved_search': 'ForgeLex: reabrir uma pesquisa de jurisprudência (jurisprudencia) salva.',
  'research.list_saved_searches': 'ForgeLex: listar as pesquisas de jurisprudência (jurisprudencia) salvas.',
  'workflow.legal_research_memo':
    'ForgeLex: memorando de pesquisa jurídica (pesquisa juridica) sobre um caso, com fontes e verificação.',
};

/**
 * Devolve a descrição com o prefixo de descoberta. Sem dica própria, a ferramenta só ganha "ForgeLex:" na frente,
 * para que a busca pelo nome do produto (`@forgelex`) ache todas, não só a verificação de conexão.
 * Idempotente: não repete o prefixo se a descrição já o tiver.
 */
export function withDiscoveryHint(toolName: string, description: string): string {
  const hint = MCP_TOOL_DISCOVERY_HINTS[toolName] ?? 'ForgeLex:';
  if (description.startsWith(hint)) return description;
  if (!(toolName in MCP_TOOL_DISCOVERY_HINTS) && /forgelex/i.test(description)) return description;
  return `${hint} ${description}`;
}

/**
 * Texto único, servido no `tools/list` a qualquer cliente (Claude, ChatGPT ou outro): o mesmo servidor, o mesmo
 * contrato. Nenhuma regra muda; as descrições só dizem ao modelo o que o servidor já exige ou oferece.
 */
export const IDEMPOTENCY_KEY_DESCRIPTION =
  'Obrigatório nesta ferramenta: envie um identificador novo e único (por exemplo, um UUID) a cada operação nova; sem ele a chamada falha. Reenvie o mesmo valor só ao repetir exatamente a mesma operação. Use este argumento quando o host MCP não permitir enviar o header Idempotency-Key.';
export const PRESENT_AFTER_SEARCH_HINT =
  'Concluída a pesquisa, chame research.present_decisions com o operationId devolvido para mostrar as decisões ao usuário no painel.';
