# Encerramento técnico das pendências executáveis

Escopo: pedido de Boni de resolver todas as correções necessárias que não
dependam de sua atuação. Base c10016c, branch codex/technical-pending-closure.
Autorizações anteriores de commit, push e integração de entregas validadas
permanecem aplicáveis. Não importar tarefas encerradas de planos históricos.

## Tarefas

1. Revalidar main/CI, runtime, jobs, dependências e backlog vigente.
2. Medir a busca jurisprudencial no corpus real: conexão existente via proxy,
   sessão somente leitura, amostra sequencial limitada, timeout e EXPLAIN JSON.
   Conferir frescor e lacunas de ingestão sem alterar o corpus.
3. Corrigir somente defeitos demonstrados; se houver mudança de comportamento,
   reproduzir em teste antes de implementar. Distinguir limitação da fonte
   externa de defeito interno e acompanhamento de correção ainda não entregue.
4. Consolidar evidências e reclassificar tarefas encerradas versus manutenção
   contínua, dependências externas e comprovações humanas. Integrar pelos seis
   checks obrigatórios e atualizar main. Deploy somente para mudança de runtime.

## Restrições e critérios

- Não criar cobranças, alterar ledger, executar expurgo novamente ou conceder MCP.
- Diagnóstico produtivo somente SELECT/EXPLAIN. A evidência revelou leituras
  repetidas do heap de versões; validar um índice de cobertura de metadados em
  PostgreSQL isolado. Aplicação da migration aditiva somente após CI/revisão,
  backup concluído e ausência de ingestão concorrente; lock timeout limitado.
  Não alterar memória global, capacidade da instância ou valores financeiros.
- Segredos somente em memória; evidência persistida agregada e sem dados privados.
- Relatório do banco não equivale a E2E, p95 global ou medição de cache frio.
- Não fabricar contratos, pareceres, segundo revisor ou documentação do responsável.
- Mesa, OCR e tribunais novos permanecem evolução futura, fora de correções.
