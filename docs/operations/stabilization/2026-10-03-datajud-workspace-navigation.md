# Consulta processual dentro do espaço de trabalho

O menu lateral autenticado usava um link para `/consulta-processual`,
rota pública que renderiza o site externo. Esse caminho trocava o layout
e recarregava o documento, sem executar uma ação de logout.

O menu passa a selecionar a aba interna `datajud` em
`/app/consulta-processual`, pelo mesmo mecanismo das demais telas.
O formulário existente é reutilizado dentro do shell autenticado,
preservando o menu, a identificação da conta e a navegação do navegador.
No celular, a seleção fecha o menu lateral e devolve o foco ao botão.
A URL interna exige autenticação; `/consulta-processual` permanece
pública, gratuita e acessível sem cadastro. Nenhuma mudança de backend,
banco, contrato DataJud ou cobrança.

## Validação local

Quatro asserções de rota falharam antes da correção e passaram depois.
55 testes unitários de rotas, entrada e cliente DataJud aprovados.
16 E2E públicos/internos aprovados com autenticação, conta, saldo e
processo fictícios. Incluem seleção por teclado sem recarregar o
documento, sessão preservada após reload, voltar/avançar, título e item
ativo, layout desktop/mobile, menu mobile fechado e rota interna
protegida. A consulta interna envia uma chamada DataJud sem credencial
ou chave faturável; nenhuma operação paga ou logout nos testes.
As verificações de acessibilidade WCAG e largura passaram.
Build completo, lint e typecheck aprovados. Build web final aprovado
com importação compartilhada do formulário, sem duplicação de módulo.

## Publicação

PR #43 integrada em `dbaf5cd156b680e564d0b3e7cb974c0456a8fb2b`, com seis checks aprovados
na PR e em main. Cloud Build `05626dee-570c-481d-98c3-45848d4b0801`: SUCCESS.
Imagem `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:6353563902d06b5e261b3bee85a60dd2b65a8e6a9762e47fd136f42adb65d430`.
Revisão `forgelex-api-prod-datajud-dbaf5cd` a **100%** em https://nexojuris.ia.br.
Rollback preservado: `forgelex-api-prod-datajud-b639b57`.

16 E2E aprovados na candidata e 16 no domínio normal, usando apenas
autenticação, conta e processo fictícios. Inspeção visual em 375/1440 px.
A entrada interna protege o workspace; a página pública e seu endpoint
gratuito permanecem disponíveis. Histórico, conta financeira e status
MCP sem credencial mantêm 401; número inválido no DataJud retorna
400/FREE/zero créditos/no-store. Nenhuma consulta real ao CNJ.

A primeira execução na candidata encontrou um 404 de asset respondido
pela revisão anterior durante a propagação do balanceador. Logs
confirmaram a origem; após a propagação, 27 assets retornaram 200 e
a suíte completa passou, incluindo a recarga autenticada. A candidata
permaneceu a 0% até essa validação. Não houve mudança de código para
repetir o teste; o estado do roteamento havia mudado.

57 readyz 200 em 120 s, com logs da revisão publicada;
16 rotas verificadas, incluindo pública e interna da consulta.
Configuração preservada, helpers removidos e 0 logs ERROR na conferência
final. Checkout original P2 preservado. Sem migration.
Prova sanitizada: [JSON](./2026-10-03-datajud-workspace-navigation-proof.json).
