# Consulta gratuita TJAL / DataJud — interface e publicação

Continuação do endpoint em `9c00738`, na branch isolada
`codex/datajud-tjal`. A tela pública `/consulta-processual` usa o shell
visual existente e dispensa AuthProvider, cadastro, assinatura e saldo.
Links disponíveis no menu/rodapé público e no menu lateral do workspace.
Recurso apresentado como consulta gratuita, separado do catálogo remunerado.
A página e os menus agora usam Consulta processual, com seletor de tribunais
integrados. [Seletor e publicação](./2026-10-03-datajud-court-selector.md).

## Comportamento

Formulário por número CNJ do TJAL, com ou sem máscara. O cliente usa POST
anônimo, `credentials: omit` e `cache: no-store`, sem Bearer token,
Idempotency-Key ou chamadas de faturamento. Ref síncrona impede disparos
concorrentes; botão indica espera e fica desabilitado. Cancelamento ao
sair da tela. Após a correção de 03/10, prazo de 75 s no navegador e 60 s
na API. [Correção e evidência](./2026-10-03-datajud-response-compatibility.md).

Resultado identifica processo e horário da consulta realizada mesmo após
alterar o campo do formulário. Exibe registros distintos de grau/classe,
órgão julgador, ajuizamento, assuntos, atualização da fonte e do índice,
quando presentes. Movimentações expansíveis, horário em Brasília e código
TPU da movimentação. Não cria resumo por IA, PDF, inteiro teor ou cálculo
de prazo. Ausência na fonte e indisponibilidade têm mensagens distintas;
falhas não oferecem compra de créditos. Limite de 20 entradas sinalizado.

Número/resultados não entram na URL, localStorage/sessionStorage, histórico
da conta ou banco. A resposta permanece na memória da tela. Fonte CNJ /
DataJud e aviso de possível incompletude/desatualização sempre apresentados.
Termos e política de privacidade gerais atualizados para esta consulta,
sem mudança nos aditivos de encerramento. OpenAPI continua documentando
o endpoint público gratuito; página de desenvolvedores distingue a exceção
à autenticação das operações protegidas. Canonical e sitemap incluem a tela.

## Limitação por IP atrás do balanceador

`FORGELEX_DATAJUD_TRUSTED_LB_IPS` opcional, somente para ingress restrito
ao balanceador conhecido. Em Google Cloud, o X-Forwarded-For acrescenta
`client-ip,load-balancer-ip` à direita; apenas quando o último endereço
estiver explicitamente configurado e o anterior for um IP válido, a quota
usa o anterior. Prefixos fornecidos pelo usuário são ignorados. Balanceador
desconhecido/configuração ausente usam o IP de transporte. Não habilita
trustProxy global nem altera autenticação, billing ou política de outros endpoints.

Referência: [documentação oficial Google Cloud](https://docs.cloud.google.com/load-balancing/docs/https#x-forwarded-for_header).
IP do balanceador desta implantação confirmado no inventário:
`34.160.73.22`; regra `forgelex-api-hml-https-rule`.

## Validação local

Dados fictícios e transporte DataJud controlado. Testes red/green de rota
pública, renderização sem autenticação, isolamento da quota por IP e
proteção contra prefixos forjados. Cliente testa credenciais omitidas,
contrato inconsistente e formatação de datas/número. Testes de sitemap
incluem a nova rota; teste de versão legal aceita a data vigente em vez
de restringir os documentos a setembro.

13 E2E do site público aprovados, incluindo cinco da consulta TJAL:
teclado, um disparo durante espera, preservação da identidade do resultado,
erro/vazio, ausência de chamadas financeiras, ausência de número em URL
e armazenamento, graus distintos e limite de exibição. Axe WCAG 2.1 AA
sem violações no main em 375/768/1024/1440 px; sem overflow horizontal.
Screenshots com fixtures inspecionados em desktop/mobile, fora do versionamento.

A primeira suíte geral teve três falhas esperadas de contratos estáticos
anteriores: sitemap de sete rotas e versão legal limitada a setembro.
Expectativas atualizadas; 17 testes de SEO/documentos/cliente aprovados.
Repetição integral serial: 114 arquivos aprovados/dois ignorados,
627 testes aprovados/cinco ignorados, exit 0, em 160,17 s. Build, lint
e typecheck aprovados. Nenhuma consulta paga ou participação externa.

## Publicação

PR [#36](https://github.com/junior-aguiar-eng/ForgeLex/pull/36) integrada em
`bd5d224d140ae93b8e83db7d8247149a92f88f3e`. Seis checks aprovados na
[PR](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37096306019)
e em [main](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37096614061),
incluindo PostgreSQL, segurança de dependências de produção e E2E dos fluxos
existentes. Build de clone limpo de main, envio de 440 arquivos/zero arquivos
privados; não utilizou o checkout com P2 nem arquivos locais de evidência.

Cloud Build `ddc1855a-af81-4405-932c-4383428b2855`: SUCCESS em 3 min 35 s.
Imagem `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api`
com digest `sha256:6fa2906a8c584d4a12c7f6559224eda7e7e10cb5f977579d55af68154c560eac`.
Revisão `forgelex-api-prod-datajud-bd5d224` inicialmente sem tráfego,
promovida a **100%** no domínio https://nexojuris.ia.br.
Sem migrations novas. Conferência da candidata confirmou preservação de
variáveis/secrets anteriores, Cloud SQL, service account, recursos,
concorrência, prazo HTTP e ingress restrito. Acrescentou chave pública CNJ
no backend e o IP confiável do balanceador; atualizou o SHA do runtime.

Verificação Cloud Run → CNJ com a imagem e chave da candidata, sem conexão
ao banco, acesso a dados de conta ou operações do ledger: cliente real com
`query: match_none`, HTTP 200, zero registros, `billable: false`, em
`2026-10-03T04:41:21.995Z`. Primeiras tentativas tiveram 429 e timeout;
foram rejeitadas como gate e repetidas após intervalo. Verificação local
com prazo de diagnóstico ampliado também retornou 200; o sucesso no
Cloud Run utilizou o prazo original do cliente, 15 s. Não representa
consulta completa de processo real nem garantia de disponibilidade do CNJ.

Primeira execução remota durante propagação da rota temporária teve três
falhas e recebeu a revisão antiga; não foi aceita como validação da candidata.
Após comprovação da revisão pelos logs, **13 E2E** passaram em 63,147 s.
API e movimentos fictícios interceptados no navegador; HTML e assets reais
da candidata. Após promoção, **13 E2E** passaram novamente no domínio normal
em 39,520 s, sem header de seleção da candidata.

Observação em produção de `2026-10-03T04:42:00.772Z` a
`2026-10-03T04:44:02.718Z`: **58 readyz HTTP 200**, checks verdadeiros,
58 requisições confirmadas nos logs exclusivamente na nova revisão.
Quinze rotas públicas/SPA/health/metadados OAuth/OpenAPI responderam 200.
Smoke sem credencial: histórico, conta financeira e status MCP retornam
401; entrada inválida no DataJud retorna 400, `FREE`, zero créditos e
`no-store`. OpenAPI confirma exceção pública com `security: []`.
Sem chamadas de pesquisa paga em produção.

Rota, backend, NEG, tag da candidata e job de verificação removidos.
Inventário final confirmou limpeza e nova revisão a 100%, com zero logs
ERROR na revisão da aplicação. Smoke posterior à limpeza aprovado.
Rollback disponível: `forgelex-api-prod-audit-30c94de`, revisão previamente
a 100%. Recibo sanitizado de versão, implantação, observação e limpeza:
`2026-10-03-datajud-publication-proof.json`. O checkout original permaneceu
em `codex/p2-search-chunk-recovery`, HEAD `ace7b7a`, com seus arquivos P2
modificados/não rastreados preservados. Históricos e provas das etapas
anteriores permanecem como fotografia da data em que foram produzidos.
