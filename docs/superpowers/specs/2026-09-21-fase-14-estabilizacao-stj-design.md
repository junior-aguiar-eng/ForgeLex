# Fase 14 — estabilização operacional do produto STJ

## Objetivo

Demonstrar que o ForgeLex limitado ao STJ opera de modo estável na sua
infraestrutura pública, incluindo uma única compra real controlada no Mercado
Pago, sem iniciar tribunal adicional, corpus, provider, parser ou cobrança por
token.

## Estado de partida

- domínio público: `https://nexojuris.ia.br`;
- homologação preservada: `https://hml.nexojuris.ia.br`;
- Cloud Run: `forgelex-api-hml`, ingress
  `internal-and-cloud-load-balancing`;
- revisão publicada com billing configurado:
  `forgelex-api-hml-00011-q2f`;
- Mercado Pago produtivo configurado para o webhook
  `https://nexojuris.ia.br/api/v2/webhooks/mercadopago` e evento
  `Order (Mercado Pago)`;
- os segredos do provider são referenciados exclusivamente por Secret Manager;
- STJ é a única capability comercial pesquisável e verificável.

## Decisão de escopo

As Fases 9 a 13 permanecem `FROZEN_STRATEGICALLY`. Esta fase não implementa,
integra, habilita, anuncia ou coleta STF, TST, TJSP, TJRJ ou TRF3. O catálogo
permanece limitado às capabilities STJ e uma solicitação de tribunal não
habilitado continua rejeitada antes do ledger.

## Arquitetura do gate

O gate reutiliza as superfícies e contratos já publicados. Nenhum caminho de
cobrança paralelo será criado. Uma identidade técnica isolada cria uma compra
pelo endpoint `POST /api/v2/billing/checkout`, com os escopos mínimos
`billing:write` e `billing:read`. A compra gera o Checkout do Mercado Pago,
que envia a notificação assinada ao endpoint público existente. O handler
normaliza o evento, consulta a ordem no provider, atualiza a compra e credita o
ledger pela mesma operação idempotente usada no produto.

As evidências provêm de quatro fontes que devem coincidir: resposta do checkout
do ForgeLex, estado da ordem no Mercado Pago, estado da compra/conta no
ForgeLex e registro do webhook/ledger no PostgreSQL. IDs, e-mails, token,
assinatura, URL de checkout e dados de pagamento serão redigidos antes de
qualquer registro documental.

## Fluxo controlado

1. Confirmar revisão, domínio/TLS, banco, segredos por referência e saúde
   antes da mutação financeira.
2. Criar uma identidade e um tenant de validação sem dados jurídicos e sem
   escopos administrativos; registrar apenas identificadores saneados.
3. Emitir um único acesso com `billing:write` e `billing:read`; não usar a
   credencial revogada da Fase 8, nem expor o valor da nova credencial.
4. Criar exatamente uma compra `credits_25`, correspondente a R$ 25,00, no
   domínio raiz, com uma chave de idempotência exclusiva da execução.
5. Antes de abrir o checkout e antes de confirmar o pagamento no Mercado
   Pago, obter confirmação expressa do usuário. Não efetivar segunda tentativa
   sem nova confirmação.
6. Após aprovação, observar o webhook assinado e confirmar que a compra chega
   a `PAID`, com um único crédito de 2.500 centavos no saldo pago.
7. Reenviar ou reprocessar o mesmo evento apenas por mecanismo seguro do
   provider ou evidência já entregue, confirmando que não cria novo crédito.
8. Consultar novamente a compra e a conta pelo ForgeLex e a ordem pelo
   Mercado Pago, comparando valor, status e identificador do provider.
9. Não consumir os créditos e não solicitar reembolso automático. Reembolso é
   uma decisão financeira separada, fora deste gate e dependente de nova
   confirmação.

## Critérios de aceite

- uma única preferência/ordem e uma única compra ForgeLex são criadas para a
  chave de idempotência;
- o pagamento de R$ 25,00 é aprovado pelo usuário em checkout produtivo;
- o webhook chega ao endpoint público com assinatura válida;
- a compra termina em `PAID` e conserva o identificador do pagamento do
  provider;
- o ledger recebe exatamente um crédito pago de 2.500 centavos;
- a repetição do mesmo evento não altera saldo, compra, crédito ou fatura;
- consultas posteriores no ForgeLex e no Mercado Pago convergem quanto a
  status, valor e referência da compra;
- raiz e homologação permanecem saudáveis após o gate;
- documentação final contém apenas evidência saneada e afirma explicitamente
  que não houve novos tribunais nem movimentações adicionais.

## Estabilidade operacional

Além da jornada financeira, a execução registra a revisão atendendo tráfego,
certificados TLS, ingress, URL nativa `run.app` bloqueada, banco acessível,
referências de segredos presentes, saúde, métricas e logs operacionais. A
análise de custo fica limitada aos recursos já existentes e não cria serviços
ou orçamento adicionais. Uma falha retorna ao componente que a causou; não
autoriza contorno do webhook, crédito manual, mudança de corpus ou expansão de
tribunal.

## Limites e segurança

- O teto financeiro do gate é R$ 25,00; não há compra de valor personalizado,
  recorrência ou recarga automática.
- Segredos não entram em arquivos, commits, logs, evidências ou chat.
- A identidade de validação não recebe escopos jurídicos, administrativos ou
  de refund.
- Se o checkout, webhook ou reconciliação falhar, a execução para e relata o
  estado observado; não cria compra adicional nem crédito compensatório.
- O provider Mercado Pago continua sendo responsável pelo pagamento. O
  ForgeLex cobra apenas créditos pré-pagos e não cobra tokens, modelos ou
  providers de IA.

## Fora de escopo

- novo tribunal, provider, fonte, parser, coleta, importação, deduplicação ou
  varredura de corpus;
- `court=TODOS`, busca agregada ou cobertura nacional;
- segunda compra, consumo dos créditos, reembolso automático ou recarga
  automática;
- modelo hospedado, chave de provider de IA, billing por token ou margem sobre
  serviço de terceiros;
- nova infraestrutura, migração remota não necessária ao gate ou alteração de
  contrato que não seja exigida por falha comprovada.
