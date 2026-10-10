# Comprovações operacionais pendentes

**Decisão de governança de 10/10/2026:** Boni é o único executor, avaliador e
aprovador humano do projeto. Não se exige segundo revisor ou parecer externo;
essa decisão substitui restrições anteriores, inclusive o aditivo histórico de
09/10 abaixo. Ver [AGENTS.md](../../../AGENTS.md).

**Adendo de 10/10/2026:** a seção de retenção e a matriz abaixo são a
fotografia de 07/10. A autorização nominal, configuração e execuções apply
foram posteriormente registradas em
[09/10 — pendências residuais](2026-10-09-audit-residual-closure.md), com zero
remoções nos ensaios. A ativação técnica está encerrada; os gates humanos,
fiscais, contratuais e comerciais seguem no [backlog vigente](../../../PENDENCIAS.md).

Responsável: Boni. Este roteiro torna os bloqueios verificáveis; não substitui
as decisões humanas registradas na Fase 4C nem declara conformidade integral.
Não coletar documentos ou executar ações sensíveis durante o ensaio sintético.

## Retenção ordinária

Em 07/10/2026, 20:42:44 UTC, a inspeção PostgreSQL em transação somente leitura
encontrou **zero registros elegíveis** nas seis categorias do serviço: histórico,
snapshots, corpos de webhook de entrega e financeiros, auditoria e recibos de
encerramento. A medição não altera dados e não garante o estado futuro.

Comando novo: `node api/dist/operations/retention-main.js` na imagem de runtime
(localmente: `node apps/api/dist/operations/retention-main.js`). Padrão: inspeção,
com contagens agregadas, horário e política. Não aplica migrations. `--apply`
exige também `FORGELEX_RETENTION_EXECUTION_ENABLED=true`; o worker público
continua desabilitado. O comando não abre endpoint HTTP.

Para execução regular, usar Cloud Run Job com o digest integrado e aprovado,
identidade de runtime existente, segredo DATABASE_URL referenciado, conexão
Cloud SQL e Scheduler autenticado por OAuth, com permissão de execução apenas
no job. Validar primeiro uma execução de inspeção; registrar execução, política,
contagens, responsável, alertas e rollback. O agendamento de inspeção é uma
entrega observacional; não deve ser descrito como expurgo ativo.

Nesta entrega, o job `forgelex-operational-retention-inspect` foi criado com o
digest aprovado e o Scheduler diário às 8h (America/Fortaleza). Execução manual
e execução disparada pelo Scheduler autenticado concluíram em modo `inspect`,
com zero elegíveis nas seis categorias. IAM de execução restrito ao invoker,
sem acesso público; `FORGELEX_RETENTION_EXECUTION_ENABLED=false`, sem `--apply`.
[Recibo e limites](2026-10-07-audit-remediation-publication.md).

Antes de habilitar `--apply`, confirmar a destinação das categorias e os
controles/exceções da [política](../../legal/account-closure-retention-policy.md),
sem equiparar corpo de webhook a registro financeiro nem eliminar valores do
ledger. Backups e diário mantêm seus próprios controles. Valores, comprovantes
financeiros e regras fiscais não ganham prazo universal com este comando.

## Ensaio humano de suporte

Executar com identidades fictícias. Registrar data, Boni como executor e avaliador,
resultado observado e evidência restrita no canal aprovado.

| Situação sintética | Resultado esperado | Critério de encerramento |
| --- | --- | --- |
| Pedido de acesso por e-mail desconhecido | Não revelar conta/dados; orientar prova pelo procedimento vigente | Boni confirma ausência de divulgação |
| Suspeita de sessão comprometida | Seguir recuperação segura; ação sensível exige decisão registrada por Boni | Canal seguro e avaliação por Boni demonstrados |
| Conta encerrada pede restauração | Não reativar subject/tenant; orientar acompanhamento do recibo | Bloqueio permanece, sem revogação de tombstone |
| Contestação de cobrança | Conferir operação/ledger e explicar decisão; não ajustar saldo por inferência | Resultado conciliado e decisão de Boni registrada |

Boni é responsável por execução, avaliação e aprovação; a execução humana do
ensaio ainda não está comprovada. Não se exige outra pessoa para encerrar essa
etapa. Não atribuir execução ou resultados que ainda não ocorreram.

## Matriz de documentos e decisões

| Frente | Evidência necessária para encerrar | Estado em 07/10 |
| --- | --- | --- |
| Fiscal/contábil | Categoria financeira, regra aplicável, prazo, termo inicial e decisão nominal | Aceite documental anterior; qualificação específica não demonstrada |
| Privacidade | Fornecedores, serviços, regiões, contratos efetivos e mecanismos de transferência; avaliação de legítimo interesse | Infra observável não prova contratos/transferências |
| Segurança/suporte | Canal seguro, decisão de Boni e quatro cenários acima | Roteiro preparado; execução humana pendente |
| Comércio eletrônico | Prova da confirmação, contrato conservável, arrependimento pelo meio de contratação e comunicação ao provedor | Fluxos técnicos e termos não substituem essa comprovação |
| Operação | Execução regular de retenção, idade dos backups e revisão de diário/exceções | Inspeção diária autenticada demonstrada; expurgo regular ainda não habilitado |

Não reabrir como pendência o endereço/CEP/e-mail e a decisão de identificação
já aceitos. Registrar documentos e resultados com acesso restrito; o relatório
público deve conter somente status, referências não sensíveis e limites.

## Aditivo de 09/10/2026

Boni confirmou que opera sozinho e ainda não possui as comprovações solicitadas.
O ensaio/revisor, qualificação fiscal, contratos/transferências e provas comerciais
continuam abertos; manter as restrições do protocolo de suporte.

A ativação técnica da retenção foi autorizada expressamente e executada no job
existente: apply manual e via Scheduler concluídos, seis contagens zero, backups
dentro de 35 dias. Rotina diária ativa às 8h; worker HTTP desabilitado. Isso encerra
o gate de ativação e prova de operação, preservando as qualificações humanas.
[Decisão, recibos, alcance e interrupção](2026-10-09-audit-residual-closure.md).
