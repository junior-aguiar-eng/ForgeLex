# Continuação editorial e calibração v8

Autorização: Boni pediu executar os seis itens na sequência. Checkout:
`forgelex-3-audit/SDK`, branch `codex/forgelex-3-quality`.

## Contrato e limites

Preservar mesa, grafo v8, revisão humana, versões e limites vigentes.
Nenhuma aplicação automática; nenhuma integração remota, push ou deploy.
Somente calibração curta D01/D03/D04, inicial/candidato, teto US$ 1,50 total
e US$ 0,25 por execução. Os outros 54 cenários ficam excluídos.
Avaliação jurídica cabe exclusivamente a Boni; preparar material e registrar
sua resposta, sem substituir sua avaliação por testes ou análise automática.

## Sequência e critérios

1. Consolidar aplicação humana previamente validada em commit local.
2. Testar aplicação simultânea com edição manual e decisão editorial;
   repetir em PostgreSQL local descartável, incluindo migração idempotente,
   sem alterar dados operacionais.
3. Conectar geração real explicitamente acionada, reutilizando provedor e
   controles financeiros existentes. Validar transporte simulado, acesso,
   limites, falhas e interface antes de inferência paga. Sem ampliar o v8.
4. Preparar snapshot/recibo novos, conferir tarifas e controles; executar
   uma única calibração curta v8, registrar custo real e saídas sem repetir
   falhas automaticamente nem reescrever campanhas anteriores.
5. Entregar a Boni o pacote de avaliação jurídica das saídas atuais,
   conservando ressalvas e distinguindo entrega final de intermediária.
6. Preparar integração/publicação com compatibilidade, migrações e roteiro
   operacional verificáveis localmente. Publicação permanece não executada.

## Validação e entrega

Testes de concorrência SQLite/PostgreSQL, gerador/transporte simulados,
regressões editoriais e mesa, tipos, lint e build. Revisão final independente
por IA conforme executing-plans; não constitui aprovação humana adicional.
Guardar evidências novas e atualizar pendências sem apagar registros históricos.

## Estado registrado em 03/11/2026

1. Concluído: commit `adc823b518934e8b1bbdb0aaef8fb27ccd599698`.
2. Concluído localmente: corridas SQLite/PostgreSQL; 58 testes PostgreSQL;
   upgrade 0038 e repetição idempotente em banco descartável.
3. Concluído localmente: adapter e comando editorial com ledger próprio,
   API/interface opt-in, SDK/HTTP simulados e validação geral aprovada.
4. Executado com interrupção: seis lugares tentados; D01/D03 entregaram;
   D04 falhou na primeira chamada e preservou custo incerto. Sem repetição.
   [Resultado e recibos](../../architecture/2026-11-03-forgelex-recalibration-v8-results.md).
5. Material entregue; avaliação de Boni pendente. D04 sem saída avaliável.
6. Preparação local concluída; publicação não executada. Mudanças posteriores
   ao commit do item 1 ainda estão no working tree.
