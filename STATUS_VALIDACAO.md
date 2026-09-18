# Auditoria e status canônico do ForgeLex

Última auditoria: 2026-09-18. Branch: `main`. Auditoria final consolidada no
commit mais recente desta branch.

## Estado implementado

- A superfície pública comercial foi removida. `/` entrega somente o painel
  consolidado de autenticação; `LandingScreen` continua sendo uma ferramenta
  interna após o login.
- Autenticação Supabase, bootstrap, sessão persistida, CORS local e tratamento
  distinto para indisponibilidade da API estão implementados.
- As ferramentas autenticadas, providers, MCP, contratos da API e backend
  jurídico foram preservados.
- O billing pré-pago local está implementado com Mercado Pago ativo:
  pacotes de R$ 25, R$ 50 e R$ 80, valor personalizado entre R$ 25 e R$ 500,
  custo de R$ 0,20 por busca, ledger, lotes, extrato, faturas internas,
  solicitações de reembolso e idempotência.
- O retorno aprovado do Mercado Pago é interpretado pelo frontend, que
  consulta a compra até o webhook concluir o processamento; saldo só é
  apresentado como atualizado após a compra estar `PAID`.
- A tela de Conexões informa que OpenAI e Anthropic são providers gerenciados
  pelo ForgeLex e não mantém chaves secretas no navegador.
- A recarga automática permanece disponível apenas quando o provider ativo a
  suporta. Como o adapter atual do Mercado Pago não oferece cobrança
  `off_session`, a UI exibe a função como indisponível e mantém a recarga
  manual. O fluxo compatível com provider fake/Stripe continua coberto por
  testes.

## Validações locais

| Gate | Resultado | Evidência |
|---|---|---|
| `pnpm test` | PASS | 38 arquivos aprovados; 168 testes aprovados; 1 arquivo e 2 testes condicionais ignorados |
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
2. A tela de créditos ainda mencionava Stripe em um fluxo que usa Mercado
   Pago; os textos foram alinhados ao provider ativo.
3. A API declarava recarga automática sem informar sua disponibilidade real;
   agora o contrato expõe `autoRecharge.available` e a UI não oferece um
   controle que falharia no Mercado Pago.
4. O estado legado de conexões e funções de API key foi removido do contexto
   global porque não possuía consumidores.
5. Uma mesma compra podia receber solicitações de reembolso pendentes
   duplicadas; a segunda agora é rejeitada de forma idempotente por tenant e
   compra.

## Correlação com o plano original

Atendido localmente: autenticação, ledger e persistência de billing, adapter
Mercado Pago, Checkout, processamento HMAC e idempotente de webhook, conta,
extrato, compra, fatura, reembolso, catálogo de modelos e testes de tarifas,
providers gerenciados no frontend e login público consolidado.

Parcial: entrega externa do webhook, atualização visual do saldo após o teste
real na sessão do navegador, Pix pendente, falha de pagamento, recarga
automática real e reembolso real. Providers Anthropic/OpenAI reais também não
foram executados porque não há credenciais configuradas.

O plano de UI pública com `/para-advogados`, `/para-desenvolvedores` e
`/documentacao` foi superado pela decisão posterior de manter apenas o login
público. O arquivo `docs/superpowers/plans/2026-09-17-forgelex-ui-publica.md`
foi preservado como histórico.

## Limites operacionais

Não foi executado `pnpm db:migrate`, migration remota, deploy ou push. O
arquivo raiz `.env` continua ignorado pelo Git e não deve ser incluído em
commit. A configuração real de Mercado Pago depende de uma URL pública HTTPS
estável e de credenciais externas válidas. Não foram feitas chamadas reais aos
providers Anthropic/OpenAI.

## Estado do repositório

As alterações anteriores estão em `50878e1` e a auditoria final está
consolidada no commit mais recente desta branch. Nenhuma alteração de
ferramenta jurídica foi feita.
