# Operação da execução comercial

## Autorização e estado

Boni aprovou a base comercial de 30/10/2026 e depois determinou: “Conclua essas três pendências, valide tudo e integre à main. Com os checks aprovados e o fluxo completo funcionando, publique e ative a execução comercial.” Essa autorização substitui a restrição anterior de não ativar a oferta; não reabre o piloto histórico nem seus fundos.

Implementação preparada nesta branch. Integração, CI pós-merge, publicação e ativação ainda precisam de recibo próprio; não inferir que foram executadas deste documento. A governança mantém Boni como único avaliador e aprovador humano.

## Fluxo e preço

O site mostra preço em reais antes de iniciar cada trabalho, resposta, correção ou continuação paga. Navegação, leitura, edição e exportação não autorizam novos envios. Retry conserva a chave. A política imutável é commercial-brl-2026-10-30-v1: reserva de R$ 5,00, mínimo de R$ 0,50 se houver entrega utilizável, teto de inferência US$ 0,25, preço calculado pela fórmula aprovada. Recibo distingue valor reservado, cobrado, liberado e crédito promocional expirado.

Uma execução ativa por conta; R$ 20/dia e R$ 100/mês incluindo reservas, períodos America/Fortaleza. Até 24 chamadas, 2.048 tokens de saída por chamada, 64.000 bytes por request, 30 segundos por chamada e cinco minutos a partir do primeiro envio autorizado. Não há pesquisa paga, tools hospedadas, fallback ou retries automáticos do SDK.

A reserva BRL é descontada do saldo disponível sob o mesmo lock usado por consultas, créditos e reembolsos. A medição operacional é em micro-USD e não consome o ledger sintético do piloto. Tokens normalizados e tarifa persistida permitem comprovar o cálculo; custo externo desconhecido permanece desconhecido.

## Cancelamento e recuperação

Sem entrega utilizável: zero cobrança ao cliente. WAITING_USER fecha a reserva anterior sem cobrança quando não houver entrega; a resposta é um novo trabalho com autorização própria. Uma entrega parcial utilizável pode ser cobrada pelo consumo comprovado dentro do teto.

Uma chamada comprovadamente não enviada é VOID. Após dispatch sem usage válido, fica UNCERTAIN; não há repetição automática nem débito estimado ao usuário. Essa obrigação operacional bloqueia novos trabalhos da conta até conciliação com evidência, sem alterar a cobrança já finalizada. Os métodos internos de conciliação não possuem endpoint de autoaprovação ao cliente.

### Conciliação de chamada incerta

Quem decide e executa é Boni, com evidência externa do uso (registro do provedor). Cancelar durante uma chamada, timeout, queda de rede ou reinício no meio do envio deixam a chamada UNCERTAIN e bloqueiam novos trabalhos de todo o tenant. O comando abaixo lista (somente leitura) e, só com `--apply`, resolve uma chamada UNCERTAIN; nunca chama o provedor nem cobra o cliente, e recusa chamadas AUTHORIZED, que podem estar em voo.

```bash
node scripts/reconcile-commercial-call.mjs --tenant <tenant>
node scripts/reconcile-commercial-call.mjs --tenant <tenant> --user <usuario> --execution <id> --call <callId> \
  --evidence <referencia-da-prova> --resolve usage --input <n> --output <n> [--cached <n>] [--apply]
node scripts/reconcile-commercial-call.mjs --tenant <tenant> --user <usuario> --execution <id> --call <callId> \
  --evidence <referencia-da-prova> --resolve not-dispatched [--apply]
```

`usage` registra o consumo comprovado (custo operacional medido); `not-dispatched` só vale com prova de que nenhuma requisição chegou ao provedor. A referência da prova fica na chamada até o encerramento da conta. Rodar primeiro sem `--apply`, conferir o plano e usar o banco indicado em `DATABASE_URL` após backup e identificação do ambiente.

Admissões têm prazo persistente de 120 segundos. Somente a varredura periódica, com rechecagem transacional do estado/prazo, expira admissão WAITING abandonada; READY/RUNNING e admissões recentes são preservados. Falhas/retries concorrentes não são donos do comando idempotente e não podem cancelá-lo por leitura antiga. Uma falha nessa janela pode manter a reserva por até 120 segundos, sem envio ou cobrança.

Terminal financeiro usa job budgetReleasePending durável; a interface atualiza o recibo até finalizar e oferece consulta manual após falhas repetidas. Reiniciar não autoriza repetir dispatch incerto.

## Retenção

A migration billing-ledger-0010-commercial-inference cria commercial_executions e commercial_calls. Não contêm textos jurídicos ou chaves do provider. Encerramento bloqueia operações ACTIVE/AUTHORIZED e só minimiza depois de a reserva estar distribuída entre cobrança, liberação e promoção expirada. Incerteza operacional terminal pode ser conservada pseudonimizada, sem fabricar custo efetivo. Preservar valores, tarifa e usage numéricos; remover hashes de entrada, chaves e associações pessoais diretas. O expurgo de casos continua removendo conteúdo privado, sem apagar prova financeira necessária.

## Configuração e publicação

- FORGELEX_AGENTIC_WORKSPACE_ENABLED=true e FORGELEX_COMMERCIAL_EXECUTION_ENABLED=true habilitam a composição comercial no servidor; FORGELEX_CLOSED_PILOT_ENABLED=false.
- VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED=true habilita a entrada web no build. Para documentos/minutas no editor, VITE_FORGELEX_CASE_WORKSPACE_ENABLED=true.
- OPENAI_API_KEY deve vir do Secret Manager, com acesso somente da identidade da API. Boni autorizou reutilizar a chave existente e esse destino. Nunca embutir chave no build, frontend, logs, Git ou comando público.
- Banco durável e migrations verificadas no startup; modo comercial nunca aplica migrations implicitamente. FORGELEX_AUTO_MIGRATE=false. Aplicar somente migration pendente explicitamente, após backup e identificação de banco/journal.
- O serviço privado de encerramento permanece sem execução comercial, sem chave OpenAI e com suas configurações operacionais preservadas.

A API publicada foi inspecionada com 1 vCPU, 512 MiB, cobrança por requisição, mínimo zero e timeout de 60 s. Essa configuração não garante trabalho em segundo plano quando a aba/stream fecha. Antes de ativar o worker comercial, configurar CPU durante toda a vida da instância, mínimo de uma instância e timeout compatível, ou arquitetura equivalente validada. Boni autorizou expressamente “Autorizar uma instância sempre ativa”, após conhecer a referência de cerca de US$ 50/mês, antes de franquias e descontos e sujeita à região e à fatura. A configuração aprovada mantém 1 vCPU e 512 MiB, mínimo de uma instância no serviço, CPU sempre disponível e timeout de 360 s, preservando limites máximos, IAM e rede. Essa decisão está aprovada; sua aplicação ainda exige recibo da publicação. [Cobrança do Cloud Run](https://docs.cloud.google.com/run/docs/configuring/billing-settings), [preços](https://cloud.google.com/run/pricing).

## Verificações reproduzíveis

- Testes de serviço financeiro, runtime/provider, UI e retenção no Vitest, sem chave real.
- node scripts/smoke-commercial-inference-postgres.mjs, com FORGELEX_ACCOUNT_CLOSURE_TEST_ADMIN_URL apontando exclusivamente a PostgreSQL local descartável. Prova disputa de recarga/débito/reembolso com escrow em duas conexões, admissão única e liquidação idempotente.
- pnpm exec playwright test --config playwright.agentic-workspace.config.ts: mantém piloto e trabalho anterior e cobre consentimento/comprovante comercial.
- pnpm exec playwright test --config playwright.agentic-commercial-flow.config.ts: navegador, API, SDK/transporte sintético, reserva/cobrança/liberação persistentes e reload sem nova cobrança. Não faz HTTP à OpenAI.

A última prova real de publicação deverá vincular commit, digest, revisões, flags, migration, backup, autenticação, uma execução sintética de Boni com teto comercial, recibo e monitoramento. Exemplos sintéticos e CI não comprovam qualidade jurídica geral; revisão humana permanece obrigatória.
