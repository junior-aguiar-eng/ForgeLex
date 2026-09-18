# Auditoria e status canônico do ForgeLex

Última auditoria: 2026-09-18. Branch: `main`.

## Fase 0 — baseline exclusivo do STJ

A Fase 0 do plano progressivo foi concluída localmente e consolidada no commit
`e220cb2`. API REST, MCP e
interface agora tratam o STJ como o único tribunal comercialmente pesquisável
nesta etapa. O catálogo permanece capaz de listar STF, TST, TJSP, TJRJ e TRF3,
mas esses registros retornam `searchable: false`, `verifiable: false` e
`status: UNAVAILABLE` até que uma fase posterior homologue seus providers.

O catálogo de capabilities é derivado do registro efetivo de providers. Busca
sem provider elegível não é tratada como consulta vazia: REST responde
`UNSUPPORTED_COURT` com HTTP 422 antes do ledger e o MCP rejeita a chamada
equivalente. `q` e `Idempotency-Key` são obrigatórios nas operações REST
faturáveis; uma busca STJ sem resultados permanece válida e é debitada uma
única unidade de R$ 0,20. O MCP exige chave explícita e não cria chave
determinística baseada nos argumentos.

Os contratos OpenAPI, snippets da documentação, `.env.example` e seletores da
interface foram alinhados ao escopo STJ. O MCP continua recebendo apenas a
chamada autenticada e os argumentos da ferramenta, sem acesso a conversas,
arquivos ou histórico do usuário. Não foram executados migration remota,
deploy ou push.

## Estado implementado

- A superfície pública comercial foi removida. `/` entrega somente o painel
  consolidado de autenticação; `LandingScreen` continua sendo uma ferramenta
  interna após o login.
- Autenticação Supabase, bootstrap, sessão persistida, CORS local e tratamento
  distinto para indisponibilidade da API estão implementados.
- As ferramentas autenticadas, MCP, contratos da API e backend jurídico foram
  preservados. Os adapters opcionais de providers não fazem parte do runtime
  comercial nem do billing do ForgeLex.
- O billing pré-pago local está implementado com Mercado Pago ativo:
  pacotes de R$ 25, R$ 50 e R$ 80, valor personalizado entre R$ 25 e R$ 500,
  custo de R$ 0,20 por busca, ledger, lotes, extrato, faturas internas,
  solicitações de reembolso e idempotência.
- O retorno aprovado do Mercado Pago é interpretado pelo frontend, que
  consulta a compra até o webhook concluir o processamento; saldo só é
  apresentado como atualizado após a compra estar `PAID`.
- A tela de Conexões informa que o advogado usa o MCP dentro da própria conta
  ChatGPT/Claude e que o desenvolvedor usa a API REST no próprio software. O
  ForgeLex não fornece modelo, não recebe chaves OpenAI/Anthropic e não cobra
  tokens.
- A recarga automática permanece disponível apenas quando o provider ativo a
  suporta. Como o adapter atual do Mercado Pago não oferece cobrança
  `off_session`, a UI exibe a função como indisponível e mantém a recarga
  manual. O contrato abstrato continua coberto por testes locais.
- O Mercado Pago é o único provider de pagamento ativo. O adapter de pagamento
  anterior foi removido da aplicação, do OpenAPI e do `.env.example`.
- Os identificadores persistidos de cliente, checkout e pagamento foram
  renomeados para nomes neutros ao provider por migração incremental; os dados
  existentes são preservados.

## Validações locais

| Gate | Resultado | Evidência |
|---|---|---|
| `pnpm test` | PASS | 36 arquivos aprovados; 172 testes aprovados; 1 arquivo e 2 testes condicionais ignorados |
| `pnpm typecheck` | PASS | todos os 15 projetos verificaram tipos |
| `pnpm --filter @forgelex/web build` | PASS | 1.648 módulos; bundle inicial de aproximadamente 408 kB |
| `git diff --check` | PASS | apenas avisos normais de conversão LF/CRLF |
| `GET /readyz` | PASS | HTTP 200; persistência e billing prontos |
| `GET /metrics` | PASS | HTTP 200; erros e falhas de webhook em zero |
| Teste de reembolso duplicado | PASS | segunda solicitação pendente rejeitada por compra e tenant |

## Evidência externa já obtida

Foi concluído um Checkout de teste do Mercado Pago com pagamento aprovado e
acreditado. A compra `12649c79-7fba-4616-9529-c3d59cc6e6cb` foi reconciliada
como `PAID`, creditada uma única vez no ledger e consultada novamente na API do
Mercado Pago. O replay do evento não duplicou o crédito.

O processamento local do webhook com assinatura HMAC foi validado usando o ID
real do pagamento. A entrega efetiva Mercado Pago → URL pública não foi
confirmada porque os túneis locais expiraram; portanto isso não equivale a
homologação externa do webhook.

## Correções desta auditoria

1. O callback de pagamento aprovado não era interpretado pelo frontend; agora
   ele direciona para Créditos e acompanha o estado real da compra.
2. A tela de créditos ainda mencionava o provider de pagamento anterior em um
   fluxo que usa Mercado Pago; os textos foram alinhados ao provider ativo.
3. A API declarava recarga automática sem informar sua disponibilidade real;
   agora o contrato expõe `autoRecharge.available` e a UI não oferece um
   controle que falharia no Mercado Pago.
4. O estado legado de conexões e funções de API key foi removido do contexto
   global porque não possuía consumidores.
5. Uma mesma compra podia receber solicitações de reembolso pendentes
   duplicadas; a segunda agora é rejeitada de forma idempotente por tenant e
   compra.
6. O catálogo de pricing de modelos, a cobrança por tokens, a margem sobre
   providers e a conversão USD/BRL foram removidos do billing ativo, da conta
   de billing e da configuração de exemplo.
7. API REST e MCP foram documentados como canais para a mesma infraestrutura
   jurisprudencial, sem acesso do MCP a conversas, arquivos ou histórico do
   host.

## Correlação com o plano original

Atendido localmente: autenticação, ledger e persistência de billing, Mercado
Pago como provider único, Checkout, processamento HMAC e idempotente de
webhook, conta, extrato, compra, fatura, reembolso, cobrança por operações
jurídicas próprias, canais REST/MCP sobre a mesma infraestrutura e login
público consolidado.

Parcial: entrega externa do webhook, atualização visual do saldo após o teste
real na sessão do navegador, Pix pendente, falha de pagamento, recarga
automática real e reembolso real. Os adapters opcionais Anthropic/OpenAI não
foram executados contra APIs externas; isso não é requisito do runtime
comercial do ForgeLex.

Não existe billing de modelos no ForgeLex. A API key do desenvolvedor
autentica a integração REST; o software dele recebe os dados jurídicos e
assume qualquer modelo e billing de terceiros. No MCP usado dentro do ChatGPT
ou Claude, a assinatura do usuário paga a inferência e o ForgeLex cobra
somente as operações jurídicas executadas com os créditos pré-pagos. O MCP não
acessa conversas, arquivos ou histórico do host.

O plano de UI pública com `/para-advogados`, `/para-desenvolvedores` e
`/documentacao` foi superado pela decisão posterior de manter apenas o login
público. O arquivo `docs/superpowers/plans/2026-09-17-forgelex-ui-publica.md`
foi preservado como histórico.

## Limites operacionais

Não foi executado `pnpm db:migrate`, migration remota, deploy ou push. A
migração de nomes neutros foi apenas adicionada ao código e ainda não foi
aplicada a banco remoto. O
arquivo raiz `.env` continua ignorado pelo Git e não deve ser incluído em
commit. A configuração real de Mercado Pago depende de uma URL pública HTTPS
estável e de credenciais externas válidas. Não foram feitas chamadas reais aos
providers Anthropic/OpenAI.

## Estado do repositório

As alterações anteriores de billing estão em `50878e1`, `ba9925d` e
`6b3c8c5`. A Fase 0 não altera as ferramentas jurídicas nem executa migration
remota.
