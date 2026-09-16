# Relatório de engenharia — Exordial Jurisprudência

**Data da inspeção:** 16/09/2026  
**Escopo:** superfícies públicas e autenticadas acessíveis pelo navegador, contrato OpenAPI público, bundle JavaScript entregue ao cliente, metadados OAuth e respostas HTTP sem credenciais. Não houve criação de chave, pagamento, alteração de conta, consumo de saldo nem tentativa de acesso ao backend privado.

## 1. Síntese executiva

A solução observada é uma aplicação web de página única, servida por Caddy, com frontend React compilado por Vite e backend HTTP compatível com FastAPI/Uvicorn. O produto expõe duas interfaces sobre a mesma plataforma de jurisprudência: API REST v2 autenticada por API key e servidor MCP remoto em `https://jurisprudencia.exordial.ai/mcp`, protegido por OAuth 2.1 com PKCE ou, segundo a política publicada, API key.

O MCP não aparenta ser uma base separada. A explicação arquitetural mais consistente é que ele funciona como adaptador protocolar: recebe uma chamada JSON-RPC/MCP, autentica o usuário, valida saldo/quota/rate limit, traduz a ferramenta solicitada em consulta ao domínio de jurisprudência e registra a unidade faturável. A API REST e o MCP provavelmente reutilizam serviços de aplicação, catálogo de tribunais e repositórios comuns. Essa reutilização é **inferência forte**, não código de backend confirmado.

A cobrança é por uso: **R$ 0,15 por busca/página bem-sucedida**, com até 20 resultados por página; detalhe individual também custa R$ 0,15 conforme a documentação da API. O catálogo de tribunais não tem custo adicional. O saldo é pré-pago, sem mensalidade. A tela autenticada oferece recargas de R$ 25, R$ 60 e R$ 100, bônus promocional na primeira recarga, Stripe, cartão salvo e recarga automática opt-in. Há inconsistência documental sobre a recarga mínima: a página pública do MCP diz R$ 9,99; o tutorial autenticado diz “a partir de R$ 5,00”; a tela atual só apresenta R$ 25/60/100 e “outro valor”. Isso deve ser tratado como dívida de produto/documentação.

## 2. Arquitetura observável

```text
Claude / ChatGPT / cliente MCP        aplicação de terceiros
              |                              |
              | OAuth 2.1 + PKCE             | API key
              v                              v
       POST /mcp (JSON-RPC)       /api/v2/public/tribunals/...
              \                              /
               \                            /
                autenticação, rate limit, quota,
                saldo, ledger e idempotência
                            |
                   serviço de jurisprudência
                            |
             catálogo -> coleção -> documento
                            |
          base normalizada alimentada por scrapers
                            |
             fontes oficiais dos 41 tribunais

Portal React/Vite -> /api/v1/portal/* -> conta, chaves, saldo,
extrato, indicação, Stripe, cartão e recarga automática
```

### Frontend

Confirmado no artefato entregue ao navegador:

- SPA React com roteamento cliente; rotas de portal, documentação, produto e administração aparecem no bundle.
- Build Vite, inferido com alta confiança pelo padrão `/assets/index-<hash>.js` e `/assets/index-<hash>.css`.
- Recharts para gráficos; componentes e strings do bundle mostram dashboard, saldo, requisições, extrato e administração operacional.
- Pré-renderização das páginas públicas para SEO por `scripts/prerender.mjs`, revelada por comentário no HTML público. As rotas do portal são hidratadas no cliente.
- Telemetria/marketing: Google Tag Manager, Microsoft Clarity, Meta Pixel e script CAPI Automation. Isso exige revisão periódica de consentimento, minimização e coerência com a política de privacidade.

### Backend e borda

Confirmado por headers:

- `Server: uvicorn` nas rotas OAuth/MCP e `Via: 1.1 Caddy`; Caddy atua como reverse proxy/borda e Uvicorn serve a aplicação Python.
- A API pública anuncia `Exordial Public Jurisprudence API`, versão OpenAPI `0.1.0`.
- O endpoint MCP aceita somente `POST`; `GET /mcp` retorna 405.
- Requisição MCP sem credencial retorna 401 e `WWW-Authenticate: Bearer resource_metadata="https://jurisprudencia.exordial.ai/.well-known/oauth-protected-resource"`.

Inferências de alta confiança:

- FastAPI no backend, por Uvicorn, formato `{"detail":"..."}`, OpenAPI e modelo de validação compatível com Pydantic.
- Banco relacional para usuários, saldo, ledger, chaves, OAuth e catálogo; o motor específico não é demonstrável.
- Workers/scheduler próprios para coleta. O bundle administrativo contém rotas de `orchestrator/workers`, `orchestrator/schedules`, `orchestrator/runs`, catálogo de scrapers, atualização e inspeção de banco/disco.

## 3. MCP: protocolo, autenticação e fluxo

### Descoberta OAuth confirmada

`/.well-known/oauth-authorization-server` retorna:

- issuer: `https://jurisprudencia.exordial.ai`;
- authorization endpoint: `/oauth/authorize`;
- token endpoint: `/oauth/token`;
- dynamic client registration: `/oauth/register`;
- revogação: `/oauth/revoke`;
- grants: `authorization_code` e `refresh_token`;
- PKCE: somente `S256`;
- cliente público: `token_endpoint_auth_methods_supported: ["none"]`;
- escopo: `mcp`.

`/.well-known/oauth-protected-resource` declara o recurso `https://jurisprudencia.exordial.ai/mcp`, Bearer token no header e escopo `mcp`.

### Sequência provável

1. Claude/ChatGPT descobre o recurso protegido e o authorization server.
2. Registra dinamicamente o cliente ou reutiliza registro conhecido.
3. Abre `/oauth/authorize` com `code_challenge` S256 e escopo `mcp`.
4. O usuário autentica e autoriza; o cliente troca o código em `/oauth/token` usando `code_verifier`.
5. O cliente envia chamadas MCP por `POST /mcp` com Bearer token.
6. O servidor executa `initialize`, anuncia ferramentas e recebe `tools/call` segundo o protocolo MCP.
7. A ferramenta consulta o domínio de jurisprudência, retorna dados reais e registra cobrança/uso.

Os passos 1–5 são sustentados pelos metadados OAuth e pelo desafio 401. Os nomes exatos das ferramentas MCP, schemas de entrada/saída, versão negociada e transporte de resposta não puderam ser observados sem autorizar uma conexão e consumir o serviço; não devem ser inventados.

### Segurança publicada

A política declara OAuth 2.1 com PKCE, TLS, allowlist de origem para clientes suportados, hashes SHA-256 para API keys/tokens e PBKDF2-HMAC-SHA256 com sal para senhas. Declara ainda logs pseudonimizados por até 12 meses e ausência do texto da consulta nos logs. Esses itens são **declarações do fornecedor**, não verificação independente do armazenamento interno.

## 4. API e modelo de domínio

Contrato OpenAPI público observado:

| Método | Rota | Função |
|---|---|---|
| GET | `/api/v2/public/tribunals` | catálogo de tribunais habilitados |
| GET | `/api/v2/public/tribunals/{tribunal_code}/collections` | coleções do tribunal |
| GET | `/api/v2/public/tribunals/{tribunal_code}/collections/{collection_key}/documents` | documentos paginados |
| GET | `/api/v2/public/tribunals/{tribunal_code}/jurisprudencias` | atalho de jurisprudências |
| GET | `/api/v2/public/tribunals/{tribunal_code}/collections/{collection_key}/documents/{document_id}` | detalhe genérico |
| GET | `/api/v2/public/tribunals/{tribunal_code}/jurisprudencias/{jurisprudencia_id}` | detalhe de jurisprudência |

Autenticação aceita `Authorization: Bearer <api_key>` ou `X-API-Key`. A busca admite `q`, `process_number`, `page` e `page_size`, com até 20 itens por página. O objeto publicado contém ID, código do tribunal, instância, número do processo, órgão julgador, relator, ementa, data de publicação, `first_seen_at`, `last_seen_at` e, no detalhe, `dedupe_key`.

O `dedupe_key` indica deduplicação determinística no pipeline de ingestão. O par `first_seen_at`/`last_seen_at` indica rastreamento temporal de presença/atualização. O modelo genérico `collections/{collection_key}/documents` sugere expansão além de jurisprudência sem criar uma API paralela por tipo documental.

## 5. Cobrança e contabilidade

### Regras confirmadas

- R$ 0,15 por página de busca bem-sucedida, até 20 itens.
- R$ 0,15 por consulta individual bem-sucedida.
- O catálogo de tribunais não acrescenta unidade de consulta.
- Headers publicados: `X-Billable-Units`, `X-Credit-Cost-Per-Unit`, `X-Credits-Charged`, rate limit e quota mensal.
- Saldo pré-pago, sem assinatura e sem cobrança automática por padrão.
- Stripe para checkout, cartão salvo e recarga automática opt-in.
- Bônus promocional separado, com validade de 30 dias na primeira recarga segundo a interface atual.
- R$ 60 gera R$ 63 e cerca de 420 buscas; R$ 100 gera R$ 110 e cerca de 733 buscas. O cálculo é coerente com R$ 0,15/unidade.

### Implementação recomendável do ledger

A cobrança correta deve ser atômica e idempotente:

1. autenticar principal e resolver carteira;
2. aplicar rate limit e quota antes da consulta;
3. reservar uma unidade ou bloquear a carteira;
4. executar a consulta;
5. somente em resultado faturável, lançar débito imutável com `request_id` único;
6. consumir primeiro saldo promocional próximo do vencimento e depois saldo pago;
7. confirmar débito e resposta na mesma fronteira transacional, ou usar outbox;
8. em retry do MCP/cliente, devolver o resultado anterior sem novo débito;
9. disparar recarga automática fora da transação principal, com chave de idempotência do Stripe.

Não foi possível confirmar que o backend implementa reserva, ordem de consumo, outbox ou idempotência; são requisitos de engenharia derivados do modelo comercial.

## 6. Pipeline de dados

O bundle administrativo demonstra módulos para tribunais, scrapers, workers, schedules, runs, calendário de execuções, banco e uso de disco. A arquitetura provável é:

1. catálogo configura tribunal e scraper;
2. scheduler cria execução;
3. worker coleta a fonte oficial;
4. parser normaliza campos por tribunal;
5. deduplicação calcula chave estável;
6. persistência atualiza `first_seen_at`/`last_seen_at`;
7. API consulta a base normalizada;
8. MCP adapta a consulta para ferramentas conversacionais.

Pontos não demonstrados: fila/mensageria, banco, mecanismo de busca textual, estratégia de reprocessamento, cobertura real dos 41 tribunais, latência de atualização e vínculo auditável entre cada registro e URL/documento oficial.

## 7. Riscos e achados

1. **Cobrança em retries.** Clientes MCP e proxies podem repetir POSTs. Sem chave idempotente por chamada, uma busca pode ser cobrada duas vezes.
2. **Saldo concorrente.** Chamadas simultâneas exigem débito atômico; “verificar e depois debitar” permite saldo negativo ou consumo excedente.
3. **Promoção com validade.** Saldo pago e promocional devem ser ledgers distintos; saldo pago não deve herdar expiração do bônus.
4. **Divergência comercial.** R$ 5,00, R$ 9,99 e opções atuais de R$ 25+ aparecem em superfícies distintas.
5. **Semântica do 402.** A documentação associa 402 a quota mensal, mas saldo insuficiente também precisa de erro estável e distinguível.
6. **OpenAPI imatura.** Versão `0.1.0` para uma API cobrada sugere necessidade de política formal de compatibilidade, changelog e testes de contrato.
7. **Detalhe faturado.** Um agente pode buscar uma página e depois abrir vários detalhes, multiplicando custo de forma pouco visível. O MCP deve descrever custo por ferramenta e evitar N+1.
8. **Fonte e auditabilidade.** A promessa de “fonte oficial” exige URL de origem, timestamp, hash bruto e versão do parser por item; esses campos não aparecem no exemplo público.
9. **Telemetria.** Portal autenticado carrega múltiplos trackers. É necessário garantir que query strings, identificadores, saldo e rotas sensíveis não sejam enviados como eventos.
10. **Admin no mesmo bundle.** Rotas administrativas no bundle público não são, por si, vulnerabilidade, mas ampliam reconhecimento. Autorização deve ser integralmente server-side.
11. **Fallback incorreto de well-known aninhado.** `/.well-known/oauth-protected-resource/mcp` devolveu a SPA em vez de JSON/404. Alguns clientes podem consultar essa variante; convém suportá-la ou responder inequivocamente.

## 8. Avaliação de engenharia

A arquitetura aparente é coerente: um domínio normalizado, duas bordas de integração (REST e MCP), OAuth moderno para conectores, API keys para software, pré-pago e operação de coleta separada. Os melhores sinais são a descoberta OAuth padronizada, PKCE S256, revogação, headers de quota/custo, catálogo genérico e painel operacional de scrapers.

A maturidade não pode ser certificada externamente. Permanecem sem prova: consistência transacional do ledger, idempotência, testes de recuperação, rastreabilidade até a fonte oficial, SLOs, backups, segregação de ambientes, rotação de segredos, auditoria interna e segurança do pipeline de scraping.

## 9. Evidências e limites

- Interface autenticada observada: dashboard, conexões e recarga; nenhuma ação mutável executada.
- Bundle público inspecionado: `assets/index-Be29NoI6.js`, sem sourcemap público válido.
- OpenAPI público: `/openapi.json`.
- Metadados OAuth: `/.well-known/oauth-authorization-server` e `/.well-known/oauth-protected-resource`.
- Desafio MCP sem credencial: 401; nenhuma ferramenta foi chamada.
- Relatório não contém código-fonte privado recuperado. O arquivo de código anexo é uma reconstrução limpa baseada exclusivamente nos contratos públicos e serve como referência de integração/implementação.

## Fontes públicas

- [Documentação da API](https://jurisprudencia.exordial.ai/documentacao-api)
- [Conector MCP](https://jurisprudencia.exordial.ai/docs/mcp)
- [OpenAPI](https://jurisprudencia.exordial.ai/openapi.json)
- [Metadados OAuth](https://jurisprudencia.exordial.ai/.well-known/oauth-authorization-server)
- [Metadados do recurso protegido](https://jurisprudencia.exordial.ai/.well-known/oauth-protected-resource)

