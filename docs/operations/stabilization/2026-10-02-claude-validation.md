# Claude e validação manual — 02/10/2026

Checkout `C:\Users\Boni Jr\.antigravity-ide\SDK`, base documental
`0b4b3a8a010530094843d182bdb2a2e9053f3a10`; runtime publicado
`80ef69a5417431b190bb7320350ed2e44ee8b933`.

## Instalação real no Claude

Claude Web Pro no Edge, modelo Sonnet 5.5 Médio. O menu antigo de configurações
encaminhou para Personalizar → Conectores. Adicionar → Adicionar conector
personalizado recebeu ForgeLex e `https://nexojuris.ia.br/mcp`.
A verificação inicial não identificou o login; sua causa não foi demonstrada.
O próprio Claude ofereceu configuração manual. Foram selecionados Entrar agora
e Registrar automaticamente (DCR), sem cabeçalhos fixos, Client ID ou segredo
manual. A identidade publicada CIMD não foi utilizada.

A ficha passou a mostrar Desvincular e cinco ferramentas. Ao retomar após
Vincular, a UI já estava conectada; não foi realizado novo clique de concessão
na tela ForgeLex pela automação. O ForgeLex confirmou o grant Claude às
11:19:46, com email, profile e offline_access. A conexão ChatGPT foi preservada.

No chat, somente `forgelex.connection_status` com `{}` foi solicitada e
executada. O painel de atividade exibiu a ferramenta e sua resposta bruta:
`authenticated=true`, `authMethod=oauth_access_token`, recurso canônico,
`verifiedAt=2026-10-02T14:21:01.046Z` e `billable=false`.
A UI ForgeLex confirmou último uso auditável às 11:21:01 local, corroborando
execução no servidor. Nenhuma pesquisa jurídica, compra, chave manual ou troca
de credencial da conta original. Capturas locais foram preservadas fora do Git.

O roteiro compartilhado pelas páginas Conectar IA e Guia foi corrigido para
os controles observados e para DCR. Referência primária atual:
[documentação de conectores Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
Esta referência descreve as opções de autenticação e cliente OAuth; a seleção
compatível com ForgeLex foi comprovada nesta instalação.

## Validação manual declarada por Boni

Em 02/10/2026, Boni informou: “testei o leitor de zoom e está funcionando como
esperado”. A declaração é aceita como validação manual do leitor e do zoom pelo
responsável do produto. Não presumir NVDA, versão, percentual de zoom, conjunto
de páginas ou execução por revisor independente: esses detalhes não foram
informados. Não reapresentar esses testes declarados como não realizados.
Não constitui certificação ou declaração de conformidade WCAG AA.

## Limites da fase 7

Conexão e chamada gratuita comprovadas nos dois hosts. A cadeia faturável
`search → get authority → verify authority`, replay, saldo e evento único no
ChatGPT real prevista no plano não foi executada nesta frente. A auditoria
completa de critérios WCAG permanece limitada à matriz automática e aos testes
manuais declarados. A fase 7 não é marcada integralmente concluída por este
adendo; o estudo externo de cinco participantes continua opcional conforme a
alteração anterior aceita por Boni.

Recibo saneado: [2026-10-02-claude-proof.json](2026-10-02-claude-proof.json).

## Validação do roteiro

Três testes de renderização de Conectar IA e Guia aprovados (dois arquivos);
`git diff --check` sem erros. A alteração do roteiro é editorial e não altera
o servidor OAuth nem as conexões existentes. Sua publicação requer imagem
posterior; o teste real Claude acima ocorreu no runtime já publicado 80ef69a5.
