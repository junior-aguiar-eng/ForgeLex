# Consulta gratuita TJAL / DataJud — interface e publicação

Continuação do endpoint em `9c00738`, na branch isolada
`codex/datajud-tjal`. A tela pública `/consulta-processual` usa o shell
visual existente e dispensa AuthProvider, cadastro, assinatura e saldo.
Links disponíveis no menu/rodapé público e no menu lateral do workspace.
Recurso apresentado como consulta gratuita, separado do catálogo remunerado.

## Comportamento

Formulário por número CNJ do TJAL, com ou sem máscara. O cliente usa POST
anônimo, `credentials: omit` e `cache: no-store`, sem Bearer token,
Idempotency-Key ou chamadas de faturamento. Ref síncrona impede disparos
concorrentes; botão indica espera e fica desabilitado. Cancelamento ao
sair da tela e prazo de 20 s no navegador, envolvendo o prazo de 15 s da API.

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

Aplicação sem migrations novas. Antes de promover: CI, build de clone limpo
de main, digest, nova revisão sem tráfego, chave pública CNJ somente no
backend e IP confiável do balanceador. Mantém variáveis/secrets, Cloud SQL,
service account, recursos e flags operacionais preexistentes. Teste remoto
do DataJud usa consulta que não retorna processos reais; E2E remoto usa
respostas fictícias interceptadas no navegador. Promoção somente após
comprovação da candidata; rollback usa a revisão previamente a 100%.
