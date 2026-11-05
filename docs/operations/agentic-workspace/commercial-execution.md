# Operação da execução comercial

## Autorização e estado

Boni aprovou a base comercial de 30/10/2026 e depois determinou: “Conclua essas três pendências, valide tudo e integre à main. Com os checks aprovados e o fluxo completo funcionando, publique e ative a execução comercial.” Essa autorização substitui a restrição anterior de não ativar a oferta; não reabre o piloto histórico nem seus fundos.

Implementação integrada à `main`. Em 01/11/2026 a produção foi inspecionada e a API já tinha `FORGELEX_AGENTIC_WORKSPACE_ENABLED=true` e `FORGELEX_COMMERCIAL_EXECUTION_ENABLED=true`, interface agêntica no build, `OPENAI_API_KEY` no Secret Manager e a instância sempre ativa descrita abaixo, desde a revisão `commercial-7abf606` (30/10). A autorização de ativação consta acima; **o recibo próprio de publicação e ativação continua sem registro no repositório** (backup, flags, migrations, segredo, instância e ensaio sintético com teto comercial). A publicação de 02/11 (`025f6dd`) preservou essa configuração sem alterá-la: [recibo](2026-11-02-publication.md). A governança mantém Boni como único avaliador e aprovador humano.

## Fluxo e preço

O site mostra preço em reais antes de iniciar cada trabalho, resposta, correção ou continuação paga. Navegação, leitura, edição e exportação não autorizam novos envios. Retry conserva a chave. A política imutável é commercial-brl-2026-10-30-v1: reserva de R$ 5,00, mínimo de R$ 0,50 se houver entrega utilizável, teto de inferência US$ 0,25, preço calculado pela fórmula aprovada. Recibo distingue valor reservado, cobrado, liberado e crédito promocional expirado.

Uma execução ativa por conta; R$ 20/dia e R$ 100/mês incluindo reservas, períodos America/Fortaleza. Trabalho encerrado sem cobrança, mas com consumo medido do provedor, conta nos limites pelo preço que teria (mínimo de R$ 0,50, no máximo a reserva); trabalho sem nenhum consumo medido não conta. Assim a conta não consome inferência sem cobrança de forma ilimitada. Até 24 chamadas, 2.048 tokens de saída por chamada, 64.000 bytes por request, 30 segundos por chamada e cinco minutos a partir do primeiro envio autorizado. Não há pesquisa paga, tools hospedadas, fallback ou retries automáticos do SDK.

A reserva BRL é descontada do saldo disponível sob o mesmo lock usado por consultas, créditos e reembolsos. A medição operacional é em micro-USD e não consome o ledger sintético do piloto. Tokens normalizados e tarifa persistida permitem comprovar o cálculo; custo externo desconhecido permanece desconhecido.

## Cancelamento e recuperação

### Complemento local: pesquisa STJ incluída (01/11/2026)

Boni decidiu nesta conversa incluir a pesquisa STJ no teto do trabalho, sem
cobrança separada. O worktree `codex/forgelex-3-quality` injeta o índice
jurisprudencial persistido existente no runtime comercial e permite somente
`research.search_case_law`, `research.get_authority` e `research.verify_authority`
além das ferramentas nativas já permitidas. A composição produtiva continua
restrita ao STJ e exige o data plane persistido; não consulta outro provedor
quando esse índice está indisponível. O piloto mantém sua allowlist anterior.

Essas leituras não passam pela cobrança avulsa de pesquisa. A reserva, a fórmula
de preço e os limites financeiros comerciais permanecem os mesmos; cada chamada
OpenAI continua medida. As ferramentas respeitam 12 chamadas por etapa e 48 por
trabalho, além do prazo do worker. Acesso, execução, cancelamento e reserva são
conferidos antes e depois de cada consulta. A seleção original é revalidada
separadamente das autoridades recuperadas antes de cada envio ao modelo.

Este parágrafo descreve implementação local, não ativação em produção.
[Resultados e limites da validação](../../architecture/2026-11-01-forgelex-3-pending-local.md).

### Fechamento da reserva

O [grafo adaptativo local](../../architecture/2026-11-01-forgelex-3-adaptive-graph.md)
mantém a mesma reserva e as mesmas chamadas comerciais medidas. Um refinamento
gera nós novos no journal; não repete nós já confirmados nem chamadas incertas.
Há no máximo um ciclo de refinamento e dez execuções de papéis, incluindo o
planejamento, subordinados aos limites de ferramentas, inferência e duração.
Contratos v1 do incremento 1 retomam pelo caminho legado; novos trabalhos usam
v2. Antes de publicar ou voltar a uma imagem só v1, drenar/separar os trabalhos
v2. Esta implementação local não comprova ativação em produção.

Sem entrega utilizável: zero cobrança ao cliente. WAITING_USER fecha a reserva anterior sem cobrança quando não houver entrega; a resposta é um novo trabalho com autorização própria. Antes de consumir a pergunta, a resposta confere saldo, limites, execução ativa e conciliação pendente; se a nova reserva seria recusada, a pergunta permanece respondível. Uma entrega parcial utilizável pode ser cobrada pelo consumo comprovado dentro do teto.

Uma chamada comprovadamente não enviada é VOID. Após dispatch sem usage válido, fica UNCERTAIN; não há repetição automática nem débito estimado ao usuário. Essa obrigação operacional bloqueia novos trabalhos da conta até conciliação com evidência, sem alterar a cobrança já finalizada. Os métodos internos de conciliação não possuem endpoint de autoaprovação ao cliente.

### Cancelamento cooperativo (decisão de Boni, 01/11/2026)

Cancelar durante uma chamada ao provedor **não a aborta**. O pedido é gravado no job (`cancelRequestedAt`); a chamada em voo termina e é liquidada, a chamada seguinte é recusada antes do envio (fica VOID) e, em seguida, o trabalho vira CANCELLED. Sem entrega utilizável, nada é cobrado e a reserva é liberada; a conta não fica incerta. Enquanto isso, a tela mostra "Cancelando assim que a etapa em andamento terminar…". O teto dessa espera é o timeout de 30 segundos por chamada: se estourar, a chamada fica UNCERTAIN como antes. Se o worker morrer com o pedido gravado, a expiração do lease aplica o cancelamento. Sem chamada em voo, o cancelamento continua imediato.

### Conciliação de chamada incerta

Quem decide e executa é Boni, com evidência externa do uso (registro do provedor). Timeout, queda de rede ou reinício no meio do envio, ou cancelamento que estoure o teto da chamada, deixam a chamada UNCERTAIN e bloqueiam novos trabalhos de todo o tenant. O comando abaixo lista (somente leitura) e, só com `--apply`, resolve uma chamada UNCERTAIN; nunca chama o provedor nem cobra o cliente, e recusa chamadas AUTHORIZED, que podem estar em voo.

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

A API publicada foi inspecionada com 1 vCPU, 512 MiB, cobrança por requisição, mínimo zero e timeout de 60 s. Essa configuração não garante trabalho em segundo plano quando a aba/stream fecha. Antes de ativar o worker comercial, configurar CPU durante toda a vida da instância, mínimo de uma instância e timeout compatível, ou arquitetura equivalente validada. Boni autorizou expressamente “Autorizar uma instância sempre ativa”, após conhecer a referência de cerca de US$ 50/mês, antes de franquias e descontos e sujeita à região e à fatura. A configuração aprovada mantém 1 vCPU e 512 MiB, mínimo de uma instância no serviço, CPU sempre disponível e timeout de 360 s, preservando limites máximos, IAM e rede. Essa decisão está aprovada. Em 01/11/2026 a API de produção foi observada com 1 vCPU, 512 MiB, mínimo de uma instância, CPU sempre alocada (sem throttling), máximo de duas instâncias e timeout de 360 s, o que corresponde ao aprovado; o recibo da aplicação continua sem registro. [Cobrança do Cloud Run](https://docs.cloud.google.com/run/docs/configuring/billing-settings), [preços](https://cloud.google.com/run/pricing).

## Verificações reproduzíveis

- Testes de serviço financeiro, runtime/provider, UI e retenção no Vitest, sem chave real.
- node scripts/smoke-commercial-inference-postgres.mjs, com FORGELEX_ACCOUNT_CLOSURE_TEST_ADMIN_URL apontando exclusivamente a PostgreSQL local descartável. Prova disputa de recarga/débito/reembolso com escrow em duas conexões, admissão única e liquidação idempotente.
- pnpm exec playwright test --config playwright.agentic-workspace.config.ts: mantém piloto e trabalho anterior e cobre consentimento/comprovante comercial.
- pnpm exec playwright test --config playwright.agentic-commercial-flow.config.ts: navegador, API, SDK/transporte sintético, reserva/cobrança/liberação persistentes e reload sem nova cobrança. Não faz HTTP à OpenAI.

A última prova real de publicação deverá vincular commit, digest, revisões, flags, migration, backup, autenticação, uma execução sintética de Boni com teto comercial, recibo e monitoramento. Exemplos sintéticos e CI não comprovam qualidade jurídica geral; revisão humana permanece obrigatória.

## Registros operacionais

Falhas antes silenciosas agora geram JSON estruturado no stdout: `agentic.worker_tick.failed` e `agentic.admission_sweep.failed` (repetições do mesmo código, no máximo uma por minuto), `agentic.budget_release.failed` (liquidação financeira pendente, repetida a cada 30 s até concluir), `agentic.execution.failed`, `agentic.request.failed` e `agentic.stream.failed`. Só códigos estáveis são gravados (`errorCode`); mensagens livres viram `UNEXPECTED_ERROR`. Um alerta em `agentic.budget_release.failed` identifica reserva retida sem depender de reclamação do cliente.
## Análise probatória local — incremento de 01/11/2026

A ação `analyze_evidence` usa estado v3 e entrega matriz/cronologia candidatas,
sem adotar fatos no caso. Só é utilizável para cobrança quando contém uma
afirmação vinculada a trecho documental conferido; matriz só com relatos libera
a reserva. Preço, teto e pesquisa incluída seguem a política existente.
Ver [implementação e validação](../../architecture/2026-11-01-forgelex-3-evidence.md).
Não implica habilitação em produção. Checkpoints v3 exigem imagem compatível;
as tarefas anteriores continuam usando os contratos v1/v2.
