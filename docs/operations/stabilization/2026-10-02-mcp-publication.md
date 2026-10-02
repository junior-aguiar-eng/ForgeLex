# Publicação do onboarding MCP — 02/10/2026

Execução autorizada por Boni: “pode promover. commit e push”. Checkout
`C:\Users\Boni Jr\.antigravity-ide\SDK`; projeto GCP
`project-bbbe1209-c295-4720-867`, região `southamerica-east1`.

## Identidade do runtime

PR [#22](https://github.com/junior-aguiar-eng/ForgeLex/pull/22) integrada após
seis checks verdes. Origem da imagem:
`80ef69a5417431b190bb7320350ed2e44ee8b933`.
[CI desse SHA](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/36974638203)
aprovada na tentativa 2; a primeira tentativa foi cancelada enquanto o último
job estava sem progresso no download de fontes do Ubuntu, antes dos testes.
Apenas o job incompleto foi repetido.

Cloud Build `2a7ade8a-7e26-4042-8488-1c0090f9454b`: `SUCCESS`.
Imagem `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api`
com digest `sha256:5778b9a594b6bab950b77778f088a41f546ac1ef9de7f63494d5f7bd634cda4d`.
Revisão `forgelex-api-prod-mcp-80ef69a5-r2`, serviço `forgelex-api-prod`.
Fallback `forgelex-api-prod-phase6-0268ffcb` preservado.

O commit documental posterior registra a publicação; não altera o SHA de origem
da imagem em execução.

## Configuração e validação anterior

Supabase produtivo `mmywgqttfthtwntjkqgh`: servidor OAuth ativo, Site URL
`https://nexojuris.ia.br`, consentimento em `/oauth/consent` e registro dinâmico
nativo desativado. O gateway ForgeLex registra clientes confidenciais, retém
segredos e tokens nativos e entrega envelopes restritos ao recurso
`https://nexojuris.ia.br/mcp`. A chave está no Secret Manager
`forgelex-prod-mcp-oauth-envelope-key:1`, acessível pela runtime SA produtiva.
Nenhum valor de segredo integra este registro.

Lint, build e typecheck aprovados. Unitários: 546 aprovados e quatro ignorados.
Matriz Chromium/axe e onboarding: 63/63; seis verificações posteriores aprovadas,
incluindo recusa, login direto no consentimento e resultado indeterminado após
falha no retorno. Smoke com gateway local e Supabase hospedado: 34 verificações
aprovadas. Esse smoke anterior não comprova o gateway HTTP publicado.

## Incidentes preservados

A primeira revisão candidata falhou ao iniciar porque o argumento de variáveis
foi concatenado incorretamente pelo PowerShell. A revisão `-r2` recebeu os
argumentos completos como uma única string; código e digest permaneceram iguais.

Na primeira promoção, as etapas 5/25/100 passaram, mas a verificação final da
página `/app/conectar` retornou 404. O verificador não enviava `Accept: text/html`,
necessário para o fallback da aplicação; esse comportamento já está previsto
em `apps/api/src/static-web.ts` e seus testes. O procedimento restaurou o
fallback a 100% em `2026-10-02T07:24:52.6767756Z`. O cabeçalho do verificador foi
corrigido antes de repetir a promoção, sem mudança do produto.

## Resultado da promoção

Segunda execução concluída às `2026-10-02T07:32:57.0881489Z`: a nova revisão
atende 100% do tráfego. As etapas 5/25/100 tiveram janelas mínimas de 120 segundos,
com 146, 143 e 144 respostas `/readyz` HTTP 200. Os logs correlacionados confirmam
atendimento pela candidata em cada etapa; na última, somente ela foi observada.
As oito rotas finais responderam 200, com recurso, issuer, registro e S256
corretos na descoberta pública. Ingress, balanceador, DNS e configuração de
billing/encerramento foram preservados. Nenhuma migration remota executada.

Consulta de logs realizada às `2026-10-02T07:33:03.5054401Z`, desde
`07:25:39Z`: nenhum HTTP 5xx encontrado para a nova revisão. Isso delimita a
janela observada; não constitui garantia de ausência de falhas posteriores.

Ensaio OAuth pelo gateway HTTPS público (`07:31:23.985Z`–`07:31:32.499Z`):
**50 verificações aprovadas**. Incluiu registro, consentimento sintético,
troca de código, refresh, PKCE, retorno exato, isolamento das credenciais,
handshake MCP, lista de ferramentas e `forgelex.connection_status` com
`authenticated=true`, `authMethod=oauth_access_token` e `billable=false`.
Saldo sintético permaneceu zero; billing e política de encerramento recusaram
OAuth com 403. Token OAuth nativo e grant revogado foram recusados pelo MCP
com 401; refresh revogado foi recusado. Nenhuma pesquisa jurídica ou compra.

Limpeza: encerramento da conta SQL sintética aceito com 202 (`ACCESS_BLOCKED`),
sessão negada com 401; remoção dos dois aplicativos e do usuário Auth comprovada
por consultas 404. Purga completa de conteúdo privado pela rotina de
encerramento não foi observada nesta janela.

Registro saneado: [`2026-10-02-mcp-publication-proof.json`](2026-10-02-mcp-publication-proof.json).
Página Conectar IA publicada e observada no Edge, com sessão original preservada.
**ChatGPT Pro/Edge instalado e conectado à conta original de Boni.** A tela do
host exibiu o ForgeLex instalado e a conta conectada; a página ForgeLex confirmou
o grant ChatGPT às 04:34:52 (America/Fortaleza). A solicitação no host foi limitada
a `forgelex.connection_status` com `{}`, sem pesquisa jurídica. Retorno:
`authenticated=true`, `authMethod=oauth_access_token`, recurso canônico e
`billable=false`, com `verifiedAt=2026-10-02T07:36:46.579Z`. O ForgeLex confirmou
**Uso confirmado**, último uso auditável às 04:36:46, corroborando a resposta do
host com registro do servidor. Não se trata apenas de texto gerado pelo modelo.

A confirmação solicitada para a concessão foi recebida. Ao retomar a tela, ela
já estava no host com a conta conectada; não houve nova concessão ou mudança da
senha original nesta execução. Capturas locais do conector e do retorno foram
preservadas fora do Git; o recibo contém apenas dados saneados.

## Limites

A instalação e a chamada gratuita no ChatGPT foram observadas. Claude real e
pesquisa jurídica faturável pelo host não foram executados. Leitor de tela e
zoom manual continuam pendentes; não há declaração
de conformidade AA nem conclusão integral da fase 7.
