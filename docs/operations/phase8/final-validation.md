# Fase 8 — validação final técnica da homologação

Data: 2026-09-21  
Status: `TECHNICAL_GATES_PASSED`; ativação comercial externa pendente do site definitivo.

## Perímetro publicado

- projeto: `project-bbbe1209-c295-4720-867`;
- serviço/revisão: `forgelex-api-hml` / `forgelex-api-hml-00010-n8d`;
- imagem: `sha256:285fa21519d01ad233be4649bf9c59a28f6c09c6188ccff26b02a4a8279daaff`;
- domínio canônico: `https://hml.nexojuris.ia.br`;
- ingress: `internal-and-cloud-load-balancing`.

O domínio canônico respondeu `200` em `/health`. A URL nativa `run.app`
respondeu `404`, comprovando que não contorna o balanceador.

## Smokes canônicos

O Cloud Build `139918e7-fd6e-4cae-8642-ccfd95bc0861` passou integralmente:

- REST: saúde, prontidão, OpenAPI, catálogo, busca STJ, replay gratuito,
  rejeição de STF e métricas autenticadas;
- cobrança jurídica: primeiro `research.search_case_law` debitou R$ 0,20 e o
  replay debitou R$ 0,00;
- MCP: pesquisa, obtenção e verificação encadeadas para a mesma autoridade
  STJ, com proveniência `provider_stj_open_data`;
- Agent Core: a mesma cadeia remota de três tools foi concluída.

A conta de recarga do Mercado Pago retornou `503` nesse lote porque as
credenciais produtivas não foram ativadas: o site definitivo ainda não existe.
Essa dependência não foi mascarada como sucesso nem impede o ledger jurídico
que foi exercitado acima.

O Cloud Build `3c74f210-a445-4003-bc80-9ada6dfedda4` executou carga limitada
de 25 buscas STJ com concorrência cinco: sem 5xx, p50 de 532,66 ms, p95 de
1.290,87 ms e débito sintético total de R$ 5,00.

Após a correção pontual do adaptador MCP para preservar a chave de
idempotência exigida por `workflow.legal_research_memo`, a revisão atual foi
revalidada pelo Cloud Build `a088af5c-8761-4a60-a8dd-7e7608ab5bfc`: MCP e
Agent Core passaram novamente com a mesma cadeia de três tools. REST, métricas
e carga não foram repetidos, pois o ajuste não alcança essas camadas.

## Host MCP e encerramento da credencial de teste

O host Codex externo executou a cadeia MCP saneada
`research.search_case_law` → `research.get_authority` →
`research.verify_authority`, com três tools, identidade consistente e
proveniência oficial. A configuração temporária `forgelex-phase8-hml` foi
removida. O registro persistido da chave sintética foi revogado pela rota de
API própria; o mesmo token passou a retornar `401` em pesquisa autenticada no
domínio canônico. A versão 2 correspondente no Secret Manager foi então
desabilitada e deixou de ser legível.

Não houve reimportação, deduplicação ou varredura do corpus.
