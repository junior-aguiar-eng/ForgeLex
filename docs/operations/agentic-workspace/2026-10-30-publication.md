# Publicação da reconciliação — 30/10/2026

Boni pediu concluir as seis pendências na ordem. Esse pedido autoriza a publicação
e as migrations descritas na primeira pendência; novas chamadas pagas de IA não
foram executadas. A execução agêntica e o piloto permanecem desligados. Publicar
o código não equivale a ativar a nova interface nem a aprovar resultados jurídicos.

[Recibo verificável](2026-10-30-publication-proof.json). Os horários do recibo são
UTC. Boni é o único avaliador e aprovador humano.

## Publicação do código

- Fonte `dc68fcb0fb0cf8fc892157842829e5b1a5cd0d00`, PR #81; CI pós-merge
  [40996327012](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/40996327012)
  aprovada no mesmo SHA. O build usou `git archive` dessa fonte, sem arquivos locais.
- Cloud Build `bf7e7a9f-c504-4303-8256-8cd142cb4ab1`, SUCCESS. Imagem
  `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:81cb33ed135c1391ae9a257ffc3a93e9326fc2f361d1c08bbca62cfa99406df6`.
- Backup manual `1793372457666`, SUCCESSFUL, concluído antes do DDL. Banco
  `forgelex`, instância produtiva `forgelex-hml-pg` (nome histórico).
- Sete migrations aditivas aplicadas com journal, transação por migration,
  advisory lock, timeout de lock de três segundos e timeout de statement de
  120 segundos. IDs completos preservam as duas migrations históricas 0031.
  Journal passou de 40 para 47 entradas, sem pendências.
- Contagens antes/depois: três casos, duas minutas e 110 lançamentos financeiros.
  As 15 tabelas novas verificadas estavam vazias. A comparação de contagens não
  é uma prova de identidade de todo o conteúdo do banco.
- API `forgelex-api-prod-agents-dc68fcb` e serviço privado
  `forgelex-closure-hml-private-agents-dc68fcb` promovidos a 100% após os testes.
  Imagem idêntica nos dois serviços, sem auto-migration no startup.

Candidata com billing desligado e revisão comercial com o billing anterior
passaram separadamente por dez verificações. O domínio público passou pelas
mesmas verificações antes e depois da limpeza. Os hashes dos assets coincidem;
traces confirmam a revisão atendida. `GET /mcp` retorna 405; initialize por POST
sem credencial retorna 401. O script de prova foi corrigido para esse contrato.

Os 404 iniciais da rota temporária atingiram a revisão antiga, conforme logs.
A regra foi validada pelo Google Cloud; a prova só foi aceita após propagação e
confirmação da candidata correta. Rota, backend, NEG e tags temporários foram
removidos, com preservação das rotas existentes, inclusive `/hub` e `/ratione`.

## Conferência do ambiente e monitoramento

IAM, ingresso, identidade de execução, vínculo Cloud SQL e referências a segredos
foram preservados. O serviço privado respondeu 200 com autenticação e 403 sem
ela. A conexão real do ForgeLex confirmou OAuth válido e `billable=false` pela
ferramenta gratuita de status. Não houve pesquisa faturável como teste.

A rotina de encerramento continua habilitada a cada minuto, no endereço e
audience anteriores. Foram observadas seis requisições regulares com HTTP 200
na nova revisão; nenhuma reconciliação manual foi disparada. A consulta delimitada
de logs retornou zero eventos ERROR ou superiores, limite 30, entre a candidata
e a inspeção registrada. Isso não garante ausência universal de falhas.

O inventário encontrou apenas o alerta de ingestão STJ. Boni confirmou que o
canal existente também é seu e autorizou reutilizá-lo. Foram criados:

- Verificação HTTPS de `/readyz` a cada cinco minutos, com certificado válido,
  corpo `status=ready` e três locais dos EUA; alerta com duas sondas falhas no
  intervalo.
- Alerta para respostas 5xx da API pública ou do serviço privado em cinco minutos.
- Alerta para ausência de resposta 2xx do serviço privado no intervalo de dez
  minutos, com confirmação de dois minutos e tratamento de métricas ausentes.

A política de ingestão anterior foi preservada integralmente. O recibo registra
a leitura das políticas habilitadas e as medições efetivamente recebidas; um
estado de espera pelas primeiras sondas não deve ser descrito como teste aprovado.
Não foi provocado incidente real nem testada a entrega de e-mail. A configuração
de disponibilidade segue a [API oficial de uptime checks](https://docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.uptimeCheckConfigs).

## Recuperação e limites

O backup manual foi restaurado na instância temporária isolada
`forgelex-restore-dc68fcb-1030`, no mesmo projeto e região, com a mesma configuração
pequena de origem. A cópia não recebeu tráfego de clientes e não tinha redes
externas autorizadas; as conexões exigiam criptografia. Não houve restauração
sobre o banco produtivo.

A cópia recuperou as 40 migrations existentes no backup. As sete migrations novas
foram reaplicadas somente nela, chegando a 47. A comparação de linhas completas
por SHA-256 coincidiu com a produção consultada em modo somente leitura: três
casos, duas minutas, seis versões, 110 lançamentos e 130 operações de cobrança.
Não foram gravados arquivos locais com esse conteúdo. A conferência não percorreu
individualmente todas as demais tabelas do banco.

A primeira tentativa de conexão encontrou uma porta local ocupada; o proxy
previsto não havia iniciado. A tentativa foi recusada na autenticação e nenhuma
migration foi aplicada por essa conexão. A prova válida só começou depois de
confirmar outro processo de proxy, seu destino e a propriedade exclusiva da porta.
Nenhuma credencial produtiva ou restaurada foi rotacionada para o ensaio.

Os controles de restauração de conta e caso passaram na readiness da versão
publicada; essa conferência é distinta da comparação de dados na cópia. A
instância produtiva mantém sete backups automáticos. A instância temporária foi
excluída, sem backup final ou retenção de backups próprios. A operação de exclusão
concluiu às 16:26:48 UTC; a ausência do alvo e a produção RUNNABLE foram confirmadas
às 16:27:31 UTC. O proxy do ensaio também foi encerrado; o processo que já ocupava
a outra porta foi preservado.

Uma recuperação precisa preservar os journals externos de expurgo, restaurar em
destino isolado, aplicar as sete migrations caso use o backup anterior a elas e
reaplicar os expurgos antes de liberar tráfego. Não apagar journal, ledger ou
tabelas como rollback. A revisão anterior permanece disponível para retorno de
tráfego da API; manter o serviço de encerramento compatível com a nova retenção.

`FORGELEX_AGENTIC_WORKSPACE_ENABLED=false` e `FORGELEX_CLOSED_PILOT_ENABLED=false`
nos dois serviços. O bundle também não ativa a interface agêntica. O executor
composto pelo servidor é o piloto restrito, dependente do ledger original; ele
não foi reaberto, copiado nem convertido em operação comercial. A cobertura HTTP
não comprova monitoramento de execuções agênticas ativas, que continuam desligadas.

Avaliação jurídica por Boni, fatura efetiva da chamada cancelada, eventual decisão
comercial e atualização final do runbook continuam nas etapas seguintes. Este
registro operacional não fabrica essas decisões.
