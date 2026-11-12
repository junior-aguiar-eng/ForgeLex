# ForgeLex — apresentação clara, seis pesquisas salvas e leitor MCP

Plano aprovado por Boni na conversa em 11/10/2026; execução local autorizada.

## Objetivo e decisões

Apresentar jurisprudência dos tribunais superiores e consulta processual,
com linguagem clara. Até seis pesquisas jurisprudenciais completas escolhidas
pelo usuário, compartilhadas entre site e ChatGPT/Claude. Sem salvamento ou
substituição automática. Reabrir é gratuito; nova pesquisa mantém a cobrança.
Consulta processual não ocupa vagas. Leitor na conversa, expansão/painel
quando suportados; explicação jurídica pertence à IA externa.

## Etapas

- [x] 1. Apresentação pública, guias e avisos sem host/hash/índice próprio;
  cobertura real junto da pesquisa e consulta; tribunal derivado das capacidades.
- [x] 2. Identidade exata registro/versão, critérios e operação concluída;
  coleção persistente de seis vagas transacionais, isolada por conta/usuário,
  cópia confiável do resultado da operação, encerramento/restauração integrados.
  GET/POST `/api/v2/research/saved`; GET/DELETE `/:id`; todas gratuitas.
- [x] 3. Leitor compartilhado de decisões atuais e salvas: navegação, ementa,
  relatoria, órgão, julgamento/publicação, citação e Origem e fonte; texto parcial
  explícito, sem completar conteúdo por inferência ou alterar versão conservada.
- [x] 4. `research.present_decisions` e operações de salvas no MCP;
  autorização Gerenciar pesquisas salvas por conexão, revogável e inicialmente
  ausente; escrita declarada corretamente; sem exclusão decidida pelo modelo.
  Recurso/bridge MCP Apps isolado e fallback textual; um leitor por seleção.

## Aviso compartilhado

Você pode manter até 6 pesquisas salvas. Reabrir os resultados salvos é gratuito.
Novas pesquisas, inclusive além das salvas ou repetindo os mesmos termos, serão
cobradas normalmente. A consulta processual continua gratuita.

## Aceitação

Testar limite e concorrência real PostgreSQL, duplicatas, isolamento/revogação,
exclusão/cancelamento/falhas, retenção operacional e encerramento da conta,
ausência de nova cobrança na navegação, duas decisões do mesmo processo,
versões indisponíveis, texto malicioso/longo/parcial, falha de cópia, teclado,
320 px e temas. Regressão de pesquisa/consulta/conta/callbacks/API/MCP.
Prévia com dados de teste não substitui ensaio real no ChatGPT/Claude.

Implementação local das quatro etapas registrada em
[validação e limites](2026-10-11-saved-research-mcp-reader-validation.md).
O ensaio nos aplicativos reais continua pendente, sem publicação autorizada.

## Limites

Main atualizada em checkout isolado, trabalhos anteriores preservados.
Flags de salvas/leitor inicialmente desligadas; migração aditiva sem preencher
coleções nem conceder permissões. Desabilitar preserva conteúdo salvo.
Sem novos fornecedores/acervos/LLM próprio/retomada de casos ou V2 agêntico.
Na execução local inicial, commit, push, integração, migração de produção e
deploy permaneceram sem autorização. Em 11/10/2026, após a aprovação visual,
Boni autorizou expressamente essa cadeia para esta entrega, condicionada à
última vistoria: “Faça uma última vistoria e, se estiver tudo certo, autorizo
commit, push, integração em main, migração de produção e deploy desta entrega.”
Boni é o único aprovador humano. O resultado da operação deve ser registrado
com evidência efetiva; autorização não equivale a publicação concluída.
