# Reconciliação de operações analíticas interrompidas

Escopo: `analise_operacoes` e sua relação com cobrança avulsa ou combo.
Boni executa, avalia e aprova a reconciliação. Este roteiro define o atendimento
do incidente; não autoriza correção de dados, estorno, nova cobrança ou execução
em produção. Não há retomada automática de operações interrompidas.

## Conter e identificar

1. Conservar a chave original e a entrada exata. Não trocar a chave para
   contornar `ANALISE_EM_ANDAMENTO` ou `ANALISE_RECONCILIACAO`.
2. Identificar ambiente, revisão, tenant, usuário, ferramenta, sessão, chave,
   fingerprint e horários. Conferir identidade e autorização antes de consultar
   conteúdo privado. Não registrar documento, resultado, token ou URL de banco
   em logs públicos ou no Git.
3. Conferir se ainda existe execução ativa na revisão de origem. `RUNNING`
   não possui lease próprio: idade da linha, reinício de instância e vencimento
   do lease do ledger não demonstram ausência de efeitos nem liberam repetição.

## Inspeção somente leitura

Em conexão PostgreSQL autorizada, executar uma transação `READ ONLY`. Usar
parâmetros vinculados `$1 = tenant`, `$2 = usuário`, `$3 = chave`; não substituir
valores por concatenação de SQL. A consulta traz metadados, sem snapshots.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT a.id, a.usuario_id, a.sessao_analitica_id, a.tool, a.fingerprint,
       a.status, a.criado_em, a.atualizado_em,
       (a.resultado IS NOT NULL) AS tem_resultado_analitico,
       b.status AS ledger_status, b.request_fingerprint AS ledger_fingerprint,
       b.reserved_amount_cents, b.lease_expires_at,
       (b.result_snapshot IS NOT NULL) AS tem_resultado_ledger,
       b.error_code,
       (SELECT COUNT(*) FROM ledger_entries e
          JOIN ledger_accounts c ON c.id = e.account_id
         WHERE c.tenant_id = a.tenant_id
           AND e.idempotency_key = a.idempotency_key
           AND e.kind = 'DEBIT') AS debitos,
       (SELECT COUNT(*) FROM usage_events u
         WHERE u.tenant_id = a.tenant_id AND u.user_id = a.usuario_id
           AND u.request_id = a.idempotency_key AND u.tool_name = a.tool)
         AS usos_do_usuario
  FROM analise_operacoes a
  LEFT JOIN billing_operations b
    ON b.tenant_id = a.tenant_id AND b.idempotency_key = a.idempotency_key
 WHERE a.tenant_id = $1 AND a.usuario_id = $2 AND a.idempotency_key = $3;

SELECT id, combo, tools_restantes, preco_cents, ativado_em
  FROM analise_combos
 WHERE tenant_id = $1 AND usuario_id = $2
   AND sessao_analitica_id = (
     SELECT sessao_analitica_id FROM analise_operacoes
      WHERE tenant_id = $1 AND usuario_id = $2 AND idempotency_key = $3
   );

ROLLBACK;
```

Ausência de linha ou divergência de usuário, sessão, ferramenta ou fingerprint
encerra a tentativa de recuperar o pedido por essa identidade. Não revelar
resultado de outra operação. Snapshot legado sem fingerprint não é recuperável
por replay verificável. Em sessão `nova`, o resultado do ledger pode conter o
ID efetivamente criado; não inferir esse ID pela coluna que conserva `nova`.

## Decisão por cenário

| Evidência | Conduta |
| --- | --- |
| `COMPLETED`, resultado íntegro e vínculo exato ao pedido | Repetir a mesma solicitação permite replay sem débito. Não executar nova ferramenta para reconstruir o resultado. Se o snapshot não decodifica, manter o incidente aberto. |
| `RUNNING` e execução ainda ativa | Aguardar. A mesma chave continua protegida contra execução duplicada. |
| `RUNNING` ou `FAILED`, ledger `COMPLETED`, fingerprint idêntico, um débito e uso coerentes | Cobrança concluída com possível falha ao gravar o envelope analítico. Conservar o resultado original; não executar nem cobrar de novo. Recuperação exige intervenção específica aprovada, validando identidade, snapshot e formato do envelope antes de qualquer escrita. |
| `RUNNING` ou `FAILED`, ledger ausente, `PENDING` ou `FAILED` | Ausência de débito não demonstra ausência de sessão/achado criado. Conferir estado analítico, logs e eventual reserva. Manter bloqueado até demonstrar o resultado e o alcance dos efeitos. |
| Operação coberta por combo, sem cobrança avulsa | Conferir a compra do combo e seus direitos separadamente. Direito removido pode ter sido consumido antes da interrupção. Não restaurar toda a lista, devolver direito ou cobrar avulso por inferência; o histórico de achados não substitui o resultado integral. |
| Dados ausentes, expirados, contraditórios ou resultado irrecuperável | Não fabricar resultado nem marcar a operação como concluída. Manter bloqueada e decidir atendimento/compensação com fundamento e autorização específicos. |

O caminho atual bloqueia inclusive a repetição de uma operação `FAILED` cujo
direito ao combo tenha sido devolvido. Uma nova chave é uma nova operação e pode
gerar débito; só cabe após conferência dos efeitos anteriores e decisão expressa.

## Intervenção e encerramento

Esta entrega não fornece comando genérico de reparo de saldo, direitos ou
snapshots. Cada intervenção deve ter backup/evidência anterior, decisão de Boni,
escopo exato e alteração condicional ao estado observado, em transação. Se o
estado mudou durante a conferência, interromper e reinspecionar. Nunca apagar a
linha idempotente nem reabrir `RUNNING` como forma de liberar execução.

Registrar em local restrito: incidente, revisão/ambiente, identidade autorizada,
referências às evidências, classificação do caso, decisão/fundamento, data,
resultado anterior/posterior e responsável Boni. Só encerrar como recuperado
após conferir resultado original e ausência de novo débito/consumo; casos sem
prova suficiente permanecem bloqueados. Evidência restrita não deve ser copiada
para o repositório.

Regressões automatizadas cobrem reinício com `RUNNING`/`FAILED`, falha após
liquidação do ledger e consumo de combo sem envelope confirmado. Esses testes
não são evidência de reconciliação de uma conta real.
