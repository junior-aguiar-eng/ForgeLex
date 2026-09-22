# Incremento 7.1 — Encerramento de conta e retenção

## Objetivo

Definir o contrato jurídico, funcional e técnico que permitirá ao ForgeLex
encerrar uma conta de forma irreversível, auditável e reconciliável, sem
conservar conteúdo jurídico identificável além do necessário. Esta
especificação é uma subfase do Incremento 7 do plano de experiência do
produto e antecede qualquer endpoint destrutivo, migration ou habilitação da
interface.

O encerramento deve produzir três efeitos distintos:

1. bloquear imediatamente todo novo uso da conta;
2. eliminar, em prazo curto, identidade e conteúdo jurídico armazenados pelo
   ForgeLex;
3. conservar somente registros minimizados cuja retenção possua fundamento
   legal, regulatório ou de exercício regular de direitos.

## Escopo e limites

Esta subfase abrange conta autenticada por Supabase, perfil ForgeLex,
memberships, espaço pessoal, sessões, chaves de API/MCP, conteúdo jurídico,
histórico de pesquisa, auditoria operacional e registros de billing.

Não abrange:

- encerramento de empresa ou organização com múltiplos proprietários;
- portabilidade ou exportação completa do workspace;
- eliminação do corpus público e global de jurisprudência;
- alteração da política de retenção operacional ordinária de contas ativas;
- migration remota, deploy, habilitação em produção ou publicação de Termos;
- promessa de eliminação em sistemas de terceiros além das obrigações
  contratuais e dos controles efetivamente disponíveis ao ForgeLex.

## Estado de partida

O frontend já possui uma rota local `/conta/seguranca` com alteração de senha,
encerramento da sessão atual e controle de encerramento desabilitado. O fluxo
de senha e sessão reutiliza Supabase; a API não recebe nem armazena a senha.
`DELETE /api/v2/account` permanece inexistente e coberto por teste `404`.

O serviço `OperationalRetentionService` elimina histórico de pesquisas e
redige snapshots e excertos antigos segundo prazo configurável, de 90 dias por
padrão. Esse serviço trata manutenção operacional de contas ativas; ele não
constitui política de encerramento e não pode ser ampliado silenciosamente
para excluir identidade, workspace ou registros financeiros.

O esquema atual separa identidade e memberships, conteúdo jurídico, API keys,
auditoria, histórico de pesquisa, billing, webhooks e corpus jurisprudencial.
O encerramento deve respeitar essas fronteiras e nunca interpretar o corpus
global como propriedade da conta.

## Premissas jurídicas

A política adota as seguintes premissas, sujeitas a revisão jurídica antes de
qualquer publicação externa:

- o término do tratamento exige eliminação dos dados pessoais, ressalvadas as
  hipóteses de conservação do art. 16 da LGPD;
- toda conservação residual precisa de finalidade, base jurídica, categoria,
  prazo e controle de acesso determinados;
- anonimização só conta como destino final quando não houver possibilidade
  razoável de reversão ou associação ao titular com meios próprios ou
  razoavelmente disponíveis;
- somente os registros que efetivamente se enquadrem como registros de acesso
  a aplicações são conservados, sob sigilo e segurança, por seis meses, nos
  termos do art. 15 do Marco Civil da Internet; auditoria interna não recebe
  automaticamente o mesmo fundamento ou prazo;
- registros financeiros e fiscais minimizados seguem, provisoriamente, prazo
  interno conservador de cinco anos contados do primeiro dia do exercício
  seguinte ao da transação. Os arts. 173 e 174 do CTN disciplinam decadência e
  prescrição do crédito tributário, não constituem, isoladamente, comando de
  guarda de cada documento; a categoria e o termo inicial deverão ser
  confirmados em revisão fiscal e contábil antes da publicação;
- conteúdo jurídico, consultas, resultados, documentos e fatos não integram o
  conjunto fiscal e não podem ser retidos sob esse fundamento;
- ordem judicial, investigação formal ou disputa concreta pode suspender o
  expurgo apenas dos registros necessários, mediante exceção documentada e
  periodicamente revista.

Fontes oficiais consultadas em 22 de setembro de 2026:

- LGPD compilada: <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm>
- Perguntas frequentes da ANPD, item 5.5: <https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes>
- Marco Civil da Internet: <https://planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm>
- Código Tributário Nacional: <https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm>

## Decisão arquitetural

O ForgeLex usará encerramento imediatamente irreversível, implementado como
saga reconciliável. Não haverá janela de arrependimento nem soft delete para
reativação. Após reautenticação e confirmação final, o acesso é bloqueado em
transação local antes de qualquer efeito externo.

Exclusão síncrona integral foi rejeitada porque chamadas ao Supabase e a
outros provedores não podem participar da transação do banco. Uma falha ou
timeout produziria resultado ambíguo. Soft delete recuperável também foi
rejeitado porque prolongaria a conservação de conteúdo jurídico sem finalidade
compatível com o encerramento solicitado.

A saga divide a operação em etapas idempotentes. Falha transitória não reabre
a conta, não desfaz revogação já concluída e não duplica efeitos. Um worker
retoma etapas pendentes até o estado terminal ou até intervenção operacional
registrada.

## Invariantes

- confirmação aceita torna o encerramento irreversível;
- conta em encerramento não acessa rotas jurídicas, billing, REST ou MCP;
- tokens Supabase ainda válidos não contornam o bloqueio local;
- API key ou credencial MCP revogada nunca volta ao estado ativo;
- repetir a requisição com a mesma chave idempotente retorna a mesma operação;
- a saga não é marcada como concluída enquanto houver etapa obrigatória
  pendente ou falha sem reconciliação;
- nenhum registro financeiro retido contém consulta, prompt, documento,
  ementa, resultado jurídico, matter, sessão ou snapshot da operação;
- retenção excepcional exige fundamento, escopo, responsável e data de
  revisão;
- restauração de backup reaplica os tombstones de encerramento antes de
  disponibilizar o ambiente;
- testes destrutivos usam tenant descartável e nunca tenant compartilhado;
- a feature permanece desligada até todos os gates de publicação passarem.

## Matriz de destinação e retenção

| Categoria | Destino | Prazo máximo após confirmação |
| --- | --- | ---: |
| Acesso às superfícies ForgeLex | Bloqueio pelo subject e tenant | Imediato |
| Sessões e identidade Supabase | Exclusão administrativa da identidade, sessões e refresh tokens; JWTs já emitidos continuam bloqueados localmente | Tentativa imediata; conclusão em até 24 horas |
| API keys e credenciais MCP | Revogação transacional; posterior eliminação do hash | Imediato |
| Matters, documentos, versões, âncoras, fatos, provas, vínculos e cronologia | Exclusão do armazenamento ativo | 7 dias |
| Questões jurídicas, authorities privadas, pesquisas, memorandos, teses, workflows, drafts e revisões | Exclusão do armazenamento ativo | 7 dias |
| Mensagens, checkpoints, aprovações e tokens de aprovação | Exclusão ou redação integral | 7 dias |
| Histórico de pesquisa e snapshots de resultado | Exclusão antecipada, sem aguardar a retenção ordinária | 7 dias |
| Perfil, e-mail e memberships pessoais | Eliminação após o expurgo; identificador residual pseudonimizado | 7 dias |
| Logs de acesso à aplicação | Conservação minimizada, sigilosa e segregada | 6 meses |
| Auditoria sem conteúdo jurídico | Redação de identificadores diretos; conservação apenas do necessário | 6 meses, salvo exceção documentada |
| Cobranças, pagamentos, invoices, estornos e ledger | Retenção de valores, datas, identificadores financeiros e prova fiscal; remoção de conteúdo jurídico | Política interna provisória: 5 anos do primeiro dia do exercício seguinte, sujeita a revisão fiscal/contábil por categoria |
| Recibo técnico do encerramento | ID pseudônimo, versão da política, etapas, horários e resultados | Política interna provisória de 5 anos, sujeita à validação da finalidade e do termo inicial |
| Payloads e excertos de webhook dispensáveis | Redação ou exclusão | 7 dias quando exclusivos da conta; no máximo 90 dias nos demais casos |
| Backups criptografados | Expiração natural; vedado uso ordinário dos dados encerrados | 35 dias |
| Métricas efetivamente anônimas e agregadas | Conservação sem vínculo ou possibilidade razoável de reidentificação | Indeterminada |
| Corpus público global de jurisprudência | Fora do encerramento da conta | Política própria do corpus |

Quando uma linha admitir retenção, o sistema deve preferir redação ou
pseudonimização dos campos desnecessários à conservação da linha inteira.

## Conta, usuário e tenant

Encerrar uma conta de usuário não autoriza destruir dados pertencentes a
terceiros. A primeira versão só aceita encerramento integral quando o usuário
for o único membro e proprietário de um tenant pessoal.

Se houver outro membro, mais de um proprietário, workspace organizacional ou
dado compartilhado, a API rejeita a operação com
`ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER`. A transferência ou saída de
workspace compartilhado terá contrato próprio e não será simulada pelo fluxo
de encerramento pessoal.

## Reautenticação e confirmação

A senha é validada diretamente pelo Supabase. O ForgeLex recebe somente uma
sessão renovada e exige autenticação emitida há no máximo cinco minutos. Uma
sessão antiga, expirada ou de identidade divergente não cria encerramento.

A interface deve exibir, antes da confirmação:

- irreversibilidade;
- perda de acesso imediata;
- categorias eliminadas e respectivos prazos;
- categorias retidas, fundamento e prazo;
- impacto sobre saldo, cobranças e comprovantes;
- impedimento quando houver tenant compartilhado.

A confirmação exige o texto exato `ENCERRAR MINHA CONTA`, checkbox separado e
`Idempotency-Key`. A confirmação genérica por modal ou clique único é
insuficiente.

## Contrato HTTP

### Consulta da política

`GET /api/v2/account/closure-policy` retorna versão, consequências, matriz
resumida, requisitos de tenant e texto exato de confirmação. Essa resposta
não habilita nem executa encerramento.

### Criação do encerramento

`POST /api/v2/account/closure` recebe:

```json
{
  "confirmation": "ENCERRAR MINHA CONTA",
  "policyVersion": "2026-09-22.v1"
}
```

Headers obrigatórios:

```text
Authorization: Bearer <sessão renovada>
Idempotency-Key: <valor opaco>
```

Resposta `202 Accepted`:

```json
{
  "closureId": "acl_...",
  "statusToken": "flx_close_...",
  "status": "ACCESS_BLOCKED",
  "requestedAt": "<ISO-8601>",
  "policyVersion": "2026-09-22.v1"
}
```

### Consulta do andamento

`GET /api/v2/account/closure/:closureId` exige o token opaco retornado apenas
na criação. O banco conserva somente seu hash. Isso permite acompanhar a
operação depois da exclusão da identidade Supabase sem reabrir a conta. A rota
retorna somente estados, horários e códigos de erro não sensíveis. Não retorna
conteúdo eliminado, segredos, dados financeiros detalhados nem payloads
internos.

### Erros estáveis

- `ACCOUNT_CLOSURE_DISABLED`
- `ACCOUNT_CLOSURE_REAUTH_REQUIRED`
- `ACCOUNT_CLOSURE_CONFIRMATION_INVALID`
- `ACCOUNT_CLOSURE_POLICY_VERSION_MISMATCH`
- `ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER`
- `ACCOUNT_CLOSURE_ALREADY_COMPLETED`
- `ACCOUNT_CLOSURE_RECONCILIATION_REQUIRED`

## Persistência e máquina de estados

A implementação criará `account_closures`, `account_closure_steps` e
`retention_exceptions` por migration idempotente.

`account_closures` registra identificadores internos, subject e tenant apenas
enquanto necessários ao expurgo, pseudônimos estáveis, hash do token de
acompanhamento, versão da política, chave idempotente derivada, estado,
horários, número de tentativas e último código de erro. E-mail, token em claro
e texto de confirmação não são persistidos.

`account_closure_steps` registra cada efeito com chave única por encerramento e
tipo de etapa. O payload é limitado a estado, contagens e códigos; conteúdo
jurídico e tokens são proibidos.

`retention_exceptions` registra categoria afetada, fundamento, referência da
autoridade ou disputa, responsável, início, próxima revisão e encerramento da
exceção. A revisão ocorre no máximo a cada 90 dias.

Estados canônicos:

```text
REQUESTED
  -> ACCESS_BLOCKED
  -> IDENTITY_REMOVED
  -> CREDENTIALS_REVOKED
  -> CONTENT_PURGING
  -> RETAINED_ONLY
  -> COMPLETED
```

Uma etapa com falha transitória permanece pendente e agenda nova tentativa com
backoff limitado. Falha terminal produz `RECONCILIATION_REQUIRED`, preserva o
bloqueio e exige ação operacional auditada. Nenhum erro conduz de volta a uma
conta ativa.

## Transação inicial e efeitos externos

A transação inicial deve:

1. validar conta, tenant exclusivo, autenticação recente, versão da política,
   confirmação e idempotência;
2. criar ou recuperar a operação canônica;
3. marcar subject e tenant como bloqueados;
4. revogar todas as API keys locais;
5. criar etapas/outbox para revogação Supabase, expurgo e minimização;
6. gravar auditoria sem conteúdo jurídico;
7. confirmar a transação antes de chamar qualquer provedor externo.

O middleware de autenticação consulta o bloqueio antes de autorizar qualquer
capability. A exclusão administrativa no Supabase remove identidade, sessões e
refresh tokens, mas JWTs de acesso já emitidos podem permanecer válidos até
`exp`; por isso, o bloqueio local é a garantia imediata e obrigatória.

## Ordem do expurgo

O expurgo respeita dependências de chave estrangeira e preserva apenas o que a
matriz autoriza:

1. identidade, sessões e refresh tokens Supabase;
2. tokens e aprovações efêmeras;
3. webhooks e endpoints privados;
4. rascunhos, revisões, teses, memos e authorities privadas;
5. fatos, provas, cronologia, documentos, âncoras e matters;
6. sessões ForgeLex, mensagens, checkpoints, workflows e histórico de pesquisa;
7. snapshots jurídicos em billing, ledger e auditoria;
8. memberships, tenant pessoal e perfil;
9. confirmação de que restaram apenas registros autorizados.

Cada etapa deve ser repetível quando as linhas já não existirem. Contagens são
registradas para reconciliação, sem copiar o conteúdo excluído.

## Billing e saldo residual

Encerramento não transforma saldo pré-pago em registro jurídico. A política de
produto para saldo, reembolso e compras pendentes deve ser aplicada antes da
confirmação. Operações financeiras em disputa impedem a eliminação dos
respectivos registros, mas não autorizam conservar consulta ou resultado.

O ledger retido remove `operation_result_snapshot`, referências a matter,
sessão e pesquisa e qualquer texto livre. Permanecem somente identificadores
pseudônimos, operação comercial, quantidade, valor, moeda, estado, provider,
timestamps e referências financeiras necessárias.

## Backups e restauração

Backups não serão reescritos seletivamente. Eles expiram em até 35 dias e
permanecem criptografados, segregados e inacessíveis ao uso ordinário. O
registro mínimo de tombstones deve sobreviver pelo prazo suficiente para que
qualquer restauração reaplique bloqueios e encerramentos antes de liberar o
ambiente.

O runbook de restauração deve demonstrar:

1. ambiente restaurado isolado;
2. aplicação dos tombstones;
3. repetição do expurgo e da minimização;
4. conferência dos estados terminais;
5. somente então, autorização de tráfego.

## Interface

`AccountSecurityScreen` substituirá o estado desabilitado por fluxo em três
estágios: explicação, reautenticação e confirmação final. Após o `202`, a tela
conserva o token de acompanhamento somente em `sessionStorage`, mostra recibo
e andamento e encerra a sessão local sem permitir retorno ao workspace.

Erros de reautenticação, tenant compartilhado, política desatualizada e falha
de reconciliação possuem copy própria. A UI não apresenta conclusão enquanto
a API não retornar `COMPLETED`.

## Observabilidade e auditoria

Métricas agregadas permitidas:

- encerramentos por estado;
- duração por etapa;
- tentativas de reconciliação;
- operações em atraso contra SLA;
- exceções de retenção por categoria.

Logs não incluem e-mail, nome, token, chave, consulta, documento, resultado,
texto de confirmação ou payload do provedor. `closureId`, códigos de etapa e
correlation IDs são suficientes para operação.

Alertas são obrigatórios para:

- bloqueio não confirmado após a transação inicial;
- chave local ainda ativa;
- etapa externa pendente por mais de 24 horas;
- conteúdo ativo após sete dias;
- backup restaurado sem reaplicação de tombstones;
- retenção excepcional com revisão vencida.

## Estratégia de testes

O desenvolvimento seguirá TDD e usará fixtures descartáveis.

Testes unitários cobrirão matriz de retenção, transições válidas, confirmação,
reauth, idempotência, backoff e redação dos registros financeiros.

Testes de integração PostgreSQL cobrirão:

- transação inicial e revogação de todas as API keys;
- repetição da mesma chave idempotente;
- concorrência com chaves diferentes;
- falha Supabase depois do bloqueio local;
- retomada após processo interrompido;
- exclusão na ordem de dependências;
- preservação fiscal sem conteúdo jurídico;
- legal hold limitado a uma categoria;
- tenant compartilhado rejeitado;
- novo login e token anterior recusados;
- migration e reconciliador idempotentes.

O E2E destrutivo roda somente em tenant criado para o teste, com marcador
inequívoco de descarte. O teste compartilhado continuará verificando apenas
que o controle destrutivo permanece indisponível quando a feature flag estiver
desligada.

## Feature flag e publicação

`FORGELEX_ACCOUNT_CLOSURE_ENABLED` permanece `false` por padrão. A rota
destrutiva não é registrada ou responde com erro estável enquanto o ambiente
não cumprir os gates.

A habilitação exige, cumulativamente:

- inventário de todas as tabelas e provedores confrontado com a matriz;
- revisão jurídica documentada desta política, dos Termos e da Política de
  Privacidade;
- migration aplicada e validada no ambiente alvo;
- reautenticação e confirmação explícita comprovadas;
- bloqueio local independente de disponibilidade do Supabase;
- revogação de sessões e credenciais reconciliável;
- testes de falha parcial, idempotência e restauração aprovados;
- ausência comprovada de conteúdo jurídico nos registros retidos;
- E2E destrutivo aprovado em tenant descartável;
- observabilidade e runbook de reconciliação disponíveis;
- autorização separada para migration remota e deploy.

## Decomposição para o plano de implementação

O plano detalhado deverá dividir a execução nestas subfases:

1. inventário entidade por entidade e contrato executável da matriz;
2. migrations e repositório da máquina de estados;
3. transação inicial, bloqueio e idempotência;
4. adapters de revogação e reconciliador;
5. expurgo, minimização fiscal e exceções de retenção;
6. contratos HTTP, OpenAPI e erros estáveis;
7. fluxo frontend com reautenticação e recibo;
8. testes PostgreSQL, E2E descartável e restauração;
9. documentos públicos, revisão jurídica e gate de habilitação.

As subfases devem manter commit, push, migration remota, deploy e publicação
como autorizações independentes. A aprovação desta especificação autoriza
somente a elaboração do plano de implementação.
