# Pendências atuais do ForgeLex

## Revisão humana editorial na mesa — 03/11/2026

[Implementação e validação](docs/architecture/2026-11-03-forgelex-editorial-human-review.md):
diálogo na entrega compara trechos e ressalvas, valida proposta importada e salva
Concordar/Rejeitar/Adiar com fundamento, autor e data no histórico do caso.
Nenhuma decisão aplica texto ou aprova conteúdo jurídico. Histórico permanece
consultável após nova versão/contexto, com novas decisões bloqueadas se obsoleto.
Replay idempotente e reconciliação por comando cobrem resposta perdida/conflito.
117 testes focados e 10 Playwright aprovados; três achados de revisão corrigidos.
Build completo aprovado; suíte geral: 1.711 aprovados, 17 ignorados, zero falhas.
Migração 0038 e reconciliação testadas só em bancos descartáveis.
Mesa, v8 e limites preservados; sem IA paga, commit, push ou deploy. Geração real
e aplicação humana versionada continuam como etapas posteriores.

## Geração simulada do editor final — 03/11/2026

[Implementação e validação](docs/architecture/2026-11-03-forgelex-editorial-generation.md):
gerador separado do v8 recebe minuta autorizada e versionada, aceita uma única
proposta estruturada e revalida acesso/contexto antes da resposta. API local
opt-in; factory ausente no bootstrap, somente provedor simulado nesta etapa.
105 testes focados aprovados. Revisão independente encontrou duas bordas de
submissão/desconexão, reproduzidas e corrigidas. Build completo e suíte geral:
1.699 aprovados, zero falhas e 17 condicionais ignorados.
Nenhuma proposta é aplicada ou persistida. Mesa, v8 e limites preservados; sem
chamadas pagas, commit novo, push ou deploy. Geração real, interface de revisão
e aplicação humana versionada continuam como etapas posteriores.

## Editor final ligado à minuta autorizada — 03/11/2026

[Implementação e validação](docs/architecture/2026-11-03-forgelex-editorial-binding.md):
API local prepara contexto editorial da entrega persistida e valida propostas
recarregando autorização, versão, texto e fontes. Exige sessão, escopos e dono;
recusa versão/contexto obsoleto, fonte incompleta e fato aprovado alterado.
Validação: 20 testes editoriais, 78 focados, build completo e 1.672 testes gerais
aprovados; zero falhas e 17 condicionais ignorados. Lint, tipos e formatação passam.
Nenhuma proposta é gerada por modelo, aplicada ou persistida nesta etapa.
Mesa, v8 e limites preservados; sem chamadas pagas, commit novo, push ou deploy.
Próximas etapas separadas: geração de propostas e aplicação humana versionada.

## Contrato do editor final implementado localmente — 02/11/2026

[Implementação e evidências](docs/architecture/2026-11-02-forgelex-final-editor-contract.md):
schemas, validador puro e fixtures em `legal-agents`. Propostas vinculadas a
versão/hash, trechos UTF-16 exatos, fontes existentes e revisão humana; nenhum
patch é aplicado. 31 testes próprios e 228 focados aprovados; lint e tipos
aprovados. Build completo e suíte geral: 1.652 aprovados, zero falhas e 17
condicionais ignorados. Unicode malformado e auditoria duplicada rejeitados.
O papel ainda não foi ativado: integração com minuta persistida/autorizada,
runtime e aplicação das propostas permanecem futuras. V8, mesa e limites
preservados; sem chamadas pagas, commit novo, push ou deploy.

## Consolidação local validada — 02/11/2026

[Registro e evidências](docs/architecture/2026-11-02-forgelex-local-consolidation.md):
trabalho organizado em commits locais; teste residual do piloto corrigido.
Build completo e suíte geral aprovados: 1.621 testes, zero falhas, 17 condicionais
ignorados; 15 testes do executor, tipos da API e lint também aprovados.
V8 permanece validado apenas localmente. Sem chamadas pagas, push, migration
remota ou deploy. A falha antiga do piloto nos recibos anteriores é histórica.

## D04 corrigido localmente; medição real e avaliação pendentes — 02/11/2026

[Rodada real v7](docs/architecture/2026-11-02-forgelex-recalibration-v7-results.md):
seis execuções, 21 chamadas, US$ 0,275842 calculados, nenhum custo incerto.
D01 e D03 entregaram com ressalvas; D04 ficou sem entrega final por
`BUDGET_EXCEEDED` antes do envio ao verificador, após minuta e revisão intermediárias.
Não ocorreram conflito de IDs ou checks inválidos nesta amostra.

[Correção local v8](docs/architecture/2026-11-02-forgelex-d04-verifier-budget-fix.md)
validada por replay: reserva US$ 0,137688, soma com consumo anterior US$ 0,238618
sob o mesmo teto de US$ 0,25. Claims/fontes/minuta completas no verificador;
requisitos/ressalvas anteriores conservados integralmente no estado e na entrega.
Pendente: medir comportamento/qualidade do modelo real com essa projeção, somente
após nova decisão de Boni. O replay sintético não conclui a entrega D04 histórica.
A expectativa antiga de duas chamadas no teste do piloto foi corrigida na
consolidação; suíte geral agora sem falhas. Recibos anteriores não foram reescritos.
Pendente humano: avaliação das duas entregas por Boni, incluindo suporte parcial
e requisitos não verificados. Os outros 54 cenários não foram executados.
Autorização da rodada encerrada; sem repetição paga, integração ou deploy.

## Histórico da correção local v7 — 02/11/2026

[Três pendências v6 tratadas localmente](docs/architecture/2026-11-02-forgelex-v6-pending-fix.md):
leitura redundante, identidade entre especialistas e vínculos de suporte.
313 cenários de regressão, 15 testes do executor e seis simulações validados;
reprodução SDK de D01 dentro da mesma reserva. Build, tipos e lint aprovados.
Mesa, limites e campanhas anteriores intactos; zero chamadas pagas novas.
A medição real subsequente está no registro acima; avaliação dos resultados por
Boni permanece pendente. Os 54 cenários restantes e publicação não foram
autorizados por esta correção. A aprovação jurídica não decorre dos testes.

## Pendências observadas na calibração v6 — histórico de 02/11/2026

[Medição real v6](docs/architecture/2026-11-02-forgelex-recalibration-v6-results.md)
executada: seis cenários, 30 chamadas, US$ 0,341614 calculados e zero custo
incerto. D03 entregou revisão com ressalvas; D01 e D04 falharam. As pendências
abaixo originaram a correção local v7 registrada acima:

- Contexto/reserva por etapa: D01 encontrou `BUDGET_EXCEEDED` no verificador;
  avaliar redução de redundância sem ampliar teto ou afrouxar a reserva.
- Identidade das afirmações: reproduzir e corrigir `CLAIM_ID_CONFLICT` entre
  especialistas em D04, preservando vínculos e detecção de conflitos reais.
- Checks de suporte: corrigir emissão de checks para fontes fora do contrato
  e referências a requisitos em lugar de afirmações, observadas em D03.

A entrega de D03 ainda depende de avaliação jurídica por Boni. Os 54 cenários
restantes não foram executados. Autorização desta rodada encerrada; novas
chamadas exigem outra decisão. Mesa e limites preservados, sem deploy.

## Histórico da correção local v6 — 02/11/2026

[Preparação isolada](docs/architecture/2026-11-02-forgelex-recalibration-v5.md)
concluída: 76 testes e seis simulações SDK aprovados, sem chamadas pagas.
A execução real foi autorizada e encerrada: US$ 0,373532, 33 chamadas, três
perguntas na versão inicial e três falhas no candidato, nenhuma entrega final.
O v5 avançou com ressalvas, mas o erro genérico não revela a causa terminal.
[Resultados e evidências](docs/architecture/2026-11-02-forgelex-recalibration-v5-results.md).
[Correção local concluída](docs/architecture/2026-11-02-forgelex-delivery-failure-fix.md):
encerramento após entrega aceita, tratamento de saída incompleta, diagnóstico
saneado e matriz probatória restrita ao pedido pertinente. 300 testes, 15 testes
do executor e seis simulações SDK aprovados; build, tipos e lint aprovados.
Mesa, limites e campanhas anteriores preservados; nenhuma nova chamada paga.
Medição do candidato v6 executada no registro acima; avaliação jurídica por Boni
permanece pendente. Causas exatas dos três erros v5 não são recuperáveis
dos metadados disponíveis. Não ampliar limites ou escopo automaticamente.

## Avaliação final do conjunto — 02/11/2026

Preparação offline concluída no [plano e corpus](docs/architecture/2026-11-02-forgelex-3-final-evaluation.md).
Calibração real autorizada e executada: seis lugares, 18 chamadas, custo calculado
US$ 0,135442 dentro do teto US$ 1,50; todos pararam na primeira pergunta e não
produziram entrega. [Resultado](docs/architecture/2026-11-02-forgelex-calibration-results.md).
[Correção local das lacunas](docs/architecture/2026-11-02-forgelex-delivery-gaps.md)
implementada e validada; a classificação foi medida na rodada v5 acima, com
avanço para especialistas e falhas posteriores sem entrega. Não sobrescrever
a campanha anterior. Faltam
executor dos demais lugares e avaliação jurídica por Boni. Estimativa original
do conjunto completo: US$ 3,60–10,80, teto proposto US$ 15; não recalibrar para
baixo a partir de execuções interrompidas no orquestrador. Os 54 lugares restantes
não foram autorizados. Integração/publicação continuam separadas. Não adicionar
etapas ou metadados técnicos à mesa.

## Direção vigente da mesa — 01/11/2026

Cliente escolhe opções objetivas; agentes e engenharia permanecem nos bastidores.
Preservar a mesa ajustada pelo Claude Code. A proposta de selecionar fatos e provas
novamente a cada pedido foi retirada. A reutilização automática dos itens já
aprovados na elaboração/revisão foi implementada localmente em 02/11/2026.
Validação real e publicação não foram realizadas; itens alterados fora da
aprovação não são revalidados automaticamente.
O incremento 6 acrescenta revisão e nova aprovação humana por **Revisar alterações**,
com histórico preservado e sem cobrança pela decisão. Ver
[escopo e validação local](docs/architecture/2026-11-02-forgelex-3-evidence-reapproval.md).
[Design corrigido](docs/superpowers/specs/2026-11-01-forgelex-3-approved-case-context-design.md).


## Evolução ForgeLex 3 — diagnóstico local de 01/11/2026

O [primeiro incremento de qualidade](docs/architecture/2026-11-01-forgelex-3-audit.md)
está em worktree isolado, sem integração/publicação. O complemento local
integra as ferramentas STJ ao runtime comercial, separa a seleção autorizada das
fontes recuperadas e inclui a pesquisa no teto do trabalho, sem débito separado,
conforme decisão de Boni nesta conversa. A fixture SQLite da migration 0036 foi
isolada em memória privada, preservando as asserções. Ver
[validação das pendências locais](docs/architecture/2026-11-01-forgelex-3-pending-local.md).
Disponibilidade publicada depende de integração e publicação autorizadas.
O benchmark determinístico não comprova qualidade semântica de modelo.
O [incremento 2](docs/architecture/2026-11-01-forgelex-3-adaptive-graph.md)
implementa localmente o grafo de capacidades com um refinamento limitado e
retomada do contrato v1 do incremento anterior. O
[incremento 3](docs/architecture/2026-11-01-forgelex-3-evidence.md) implementa
a ação probatória local, com matriz, cronologia e contradições. O
[incremento 4](docs/architecture/2026-11-01-forgelex-3-evidence-adoption.md)
implementa a incorporação ao caso mediante seleção, edição e aprovação humana,
com migration 0037 aditiva. Avaliação semântica jurídica por Boni e publicação
seguem pendentes; a permissão para implementar não aprova itens reais.
Checkpoints anteriores requerem tratamento
por versão antes de uma futura publicação; ver compatibilidade no relatório.

Atualizado em 24/10/2026 (dependências de segurança publicadas; ensaios do leitor
e da coleção de 12/10, priorização humana/fiscal/contratual e consulta externa
de 10/10 mantidas). Backlog vigente; checkboxes de planos antigos
registram aquela entrega e não devem ser importados como tarefas novas.
[Produto e publicações](CONTINUIDADE.md) · [Evidências](STATUS_VALIDACAO.md).

O recorte de correções revalidado em 09–10/10 foi encerrado. A preparação
analítica posterior está discriminada abaixo. A PR #61 foi integrada, e a
migration de pesquisa foi aplicada
ao banco publicado. Isso não declara ausência universal de defeitos, cobertura
integral da fonte, certificação jurídica/fiscal ou desempenho sob qualquer carga.

README, índice e referências de continuidade foram reconciliados em 10/10.
A revisão documental foi integrada em main pela PR #63, no commit
`105cf77a3962a1ff09dfdcfa4528eb235f52bbe6`. A limpeza local e a
preservação das branches históricas estão
no [registro de manutenção](docs/operations/stabilization/2026-10-10-documentation-repository-hygiene.md).

## Plataforma agêntica — pendências (31/10/2026)

| Pendência | Dependência para encerrar |
| --- | --- |
| Publicar a imagem da `main` | A migration `persistence-0036` foi aplicada em 31/10 ([registro](docs/operations/agentic-workspace/2026-10-31-migration-0036-aplicada.md)). Falta publicar a imagem, por autorização de Boni; a imagem antiga continua funcionando com a coluna criada |
| Publicar e ativar a execução comercial | Recibo de Boni: backup, migrations pendentes, flags, chave no gerenciador de segredos, instância sempre ativa; ensaio sintético com teto comercial. [Operação](docs/operations/agentic-workspace/commercial-execution.md) |
| Cancelamento cooperativo da execução comercial | Política decidida em 01/11 e implementada (a chamada em voo termina; ver [operação](docs/operations/agentic-workspace/commercial-execution.md)); entra em produção com a próxima imagem. Timeout ou queda de rede ainda deixam a chamada incerta (saída: conciliação manual por `scripts/reconcile-commercial-call.mjs`, com evidência do provedor) |
| Limites diário e mensal contam consumo sem cobrança | Confirmar a regra com Boni; é visível ao cliente |
| Configurações do Playwright e documentos históricos na raiz | Reorganização própria: há referências cruzadas em documentos e scripts |

## Dependências de segurança — publicadas em 24/10/2026

PR #78 integrada em main `6499eb0`; seis checks aprovados na PR e
pós-merge. Zod 4.6.7 com conversão nativa e regressões dos contratos, SDKs MCP
e dependências corrigidas. 948 testes aprovados, 18 ignorados, sem novos skips;
audits de produção e completo sem alertas conhecidos na consulta desta entrega.

API `forgelex-api-prod-deps-6499eb0` e worker
`forgelex-closure-hml-private-deps-6499eb0` em 100%, após inventário/testes
no container, candidata e revisão comercial sem tráfego. Oito probes públicos
aprovados após a limpeza; IAM, configuração e Scheduler preservados.
Nenhuma migration reaplicada, AUTO_MIGRATE=false e 47 arquivos locais intactos.
O advisory de braces foi retirado pelo upstream em 23/10; a mitigação permanece.
[Recibo, provas e limites](docs/operations/stabilization/2026-10-24-security-dependencies-publication.md). Homologação nos hosts reais e avaliação
jurídica continuam com seus limites anteriores.

## Camada analítica — publicação técnica concluída

A PR #74 está integrada em main `3657a63`. Em 18/10, foi preparada em worktree
isolado a correção do controle de migrations, a regressão PostgreSQL na CI e o
[roteiro de reconciliação](docs/operations/analise-reconciliation.md).
O [registro local](docs/operations/stabilization/2026-10-18-analise-publication-readiness.md)
separa implementação e validações de publicação.

Commit, push, PR e integração condicionada aos checks foram autorizados por Boni
em 18/10. Implementação `dd87fc3`, enviada na
[PR #75](https://github.com/junior-aguiar-eng/ForgeLex/pull/75); a própria PR
registra os checks e o estado de integração.
Após autorização expressa de Boni, backup, migrations produtivas, deploy e
validação da candidata antes da promoção foram executados em 18/10.
A publicação de segurança de 24/10 atende 100% do tráfego na revisão
`forgelex-api-prod-deps-6499eb0`, após validação da candidata;
[evidências da publicação atual](docs/operations/stabilization/2026-10-24-security-dependencies-publication.md).
Permanece a homologação da camada analítica nos hosts reais ChatGPT/Claude
e a avaliação jurídica por Boni, fora do alcance dos ensaios sintéticos.
Operações interrompidas permanecem bloqueadas até a decisão
de reconciliação; não foi adicionada recuperação automática de saldo ou direitos.

## Correção de dependência Hono — publicada

PR #76 integrada e publicada em 20/10, com candidatas validadas e sem reaplicar
migrations. Lockfile corrigido para Hono 4.13.11; pacote ausente no runtime.
[Recibo da publicação](docs/operations/stabilization/2026-10-20-hono-publication.md). As limitações de homologação dos hosts
mantêm seus escopos anteriores. O advisory de braces foi retirado pelo upstream
em 23/10; mitigação local e gate de audit permanecem.

## Correções encerradas

| Frente | Resultado e evidência |
| --- | --- |
| CI do lifecycle | Correção de sincronização e diagnósticos entregue; cinco E2E e seis checks aprovados novamente na PR #61. A causa exata da ocorrência Linux original não foi demonstrada |
| Dependências de build | source-map-js e postcss-selector-parser corrigidos; braces tem mitigação local de profundidade, regressão e audit completo obrigatório. O advisory upstream continua aberto |
| Pesquisa → Caso | PR #58 publicada: salvar/deduplicar julgado, conferir fonte e reutilizar nos rascunhos. Pesquisa com dez E2E aprovados; vínculo não decide pertinência jurídica |
| Retenção ordinária | Ativação autorizada em 09/10; job diário às 8h, OAuth, --apply; execuções manual e Scheduler concluídas, zero removidos. Worker HTTP desabilitado; não constitui qualificação fiscal |
| Reserva histórica | Classificada: uma PENDING de 20 centavos, lease vencido, sem fingerprint e sem débito correspondente. Não bloqueia saldo pela regra atual; nenhum estorno/backfill executado |
| Busca ampla STJ / P2 | Código anterior já publicado; corpus real medido. PR #61/migration 0029 aplicada: índice de metadados usado, zero Heap Fetches nessa etapa. Mesma amostra ampla: 20,3 s antes, 13,3–16,5 s depois, resultados idênticos. Não é p95 nem garantia sob carga |
| Referências históricas | Registros P2/acessibilidade de 02/10 receberam adendos para separar entrega já publicada e limites dos ensaios antigos |
| Leitor MCP e reabertura nos aplicativos web | ChatGPT: leitor, expansão, salvar a mesma operação sem duplicar e reabrir confirmados. Claude Web: leitor, expansão, listagem e reabertura confirmados. Boni comprovou leitor Desktop e aprovou apresentação ChatGPT. [Evidências e limites](docs/operations/stabilization/2026-10-12-mcp-live-validation.md) |

## Pendências humanas e externas

| Pendência | Dependência para encerrar |
| --- | --- |
| Ensaios residuais da coleção MCP | Falta testar salvamento pelo Claude e coleção no Claude Desktop. Exclusão confirmada, seis vagas/sétima bloqueada, revogação e expiração do histórico não foram reproduzidas na conta real; testes automatizados permanecem evidência separada. ChatGPT teve cópia manual funcional após falha automática; painel aberto antes da permissão conserva aviso até reabertura. [Recorte confirmado](docs/operations/stabilization/2026-10-12-mcp-live-validation.md) |
| Comprovações operacionais | Executar, avaliar e aprovar o ensaio pelo próprio Boni; ausência de segundo revisor não constitui pendência nem bloqueio |
| Execução fiscal, contratos e provas comerciais | Preparação FISCAL-2026-10-10.v1 aprovada por Boni em 10/10. Restam situação/classificação municipal, conciliação dos R$ 25 e contratos efetivos; prova de venda real depende de evento real, ainda inexistente segundo Boni |
| Braces upstream | Advisory retirado pelo upstream em 23/10, sem nova versão corrigida (registry 3.0.3). Patch, testes e gate de audit preservados; exceção anterior não foi ampliada. [Conferência de 24/10](docs/operations/stabilization/2026-10-24-security-dependencies.md) |
| Lacuna oficial STJ | Recurso 20240229.json mantém os mesmos 599 bytes e hash da falha na linha 24, reconferido em 10/10. Depende de correção na fonte e posterior reavaliação da lacuna; conteúdo parcial não foi incorporado |

Braces/STJ foram [reavaliados em 10/10](docs/operations/stabilization/2026-10-10-external-pending-review.md):
51 testes dos controles existentes aprovados, audit de produção sem alertas,
audit completo então com somente braces mitigado e fonte STJ inalterada.
Em 24/10, a consulta confirmou a retirada do advisory de braces pelo upstream;
patch, testes e gate de audit permanecem preservados. A lacuna STJ conserva a
última evidência de 10/10, sem nova ingestão ou revalidação nesta entrega.

A ordem recomendada e os critérios de encerramento estão no
[roteiro de comprovações](docs/operations/stabilization/2026-10-10-human-external-pending-priority.md).
A consulta externa tem [recibo próprio](docs/operations/stabilization/2026-10-10-human-external-pending-proof.json).
Boni definiu em 10/10 que nenhuma atividade do projeto depende de avaliação
ou aprovação de outra pessoa. A exigência interna de segundo revisor foi
revogada; avaliações operacionais, jurídicas, fiscais, contratuais e de
segurança cabem exclusivamente a ele, conforme [AGENTS.md](AGENTS.md).
Evidências ainda ausentes continuam pendentes de obtenção/avaliação por Boni,
sem parecer externo obrigatório.

A análise fiscal e a proposta `FISCAL-2026-10-10.v1` estão
[aprovadas por Boni no escopo descrito](docs/operations/stabilization/2026-10-10-fiscal-decision.md).
Autoria, propriedade, exploração direta e ausência de empregados confirmadas;
sem registro empresarial/MEI declarado. Inscrição municipal de autônomo não
foi confirmada. Preparação fiscal aprovada em 10/10 não equivale a
cadastro/apuração concluídos. A cobrança controlada real de R$ 25 será
conciliada separadamente das receitas de clientes, ainda inexistentes segundo Boni.

## Manutenção contínua

Acompanhar falhas de CI, ingestão e limpeza diária, exceções, contagens e
backups. A ingestão de 09/10 concluiu sem pendentes/falhos; a cadência de
execução não comprova frescor integral. O corpus observado contém 874.450
documentos e 874.516 versões. Consultas amplas continuam custosas; revisar
latência sob uso representativo se surgir regressão ou requisito de desempenho.
No próximo deploy HTTP, incluir conferência de uma aba previamente aberta;
o ensaio real durante promoção não foi demonstrado nesta entrega de índice.

A automação diária às 15h consulta main e recibos em modo somente leitura;
avisa mudanças acionáveis, não executa jobs --apply, operações faturáveis ou
mutações. Esse acompanhamento é manutenção, não entrega de código atrasada.

Mesa do caso, novos agentes internos, OCR e novos tribunais são evolução
futura, fora das correções. A arquitetura continua MCP/IA externa, com
permissões e conferência humana.

Referências:
[encerramento técnico e recibo](docs/operations/stabilization/2026-10-09-technical-pending-closure.md),
[retenção e mitigação](docs/operations/stabilization/2026-10-09-audit-residual-closure.md),
[remediação publicada](docs/operations/stabilization/2026-10-07-audit-remediation-publication.md),
[provas humanas](docs/operations/stabilization/2026-10-07-operational-proof-checklist.md),
[dependências](docs/operations/stabilization/2026-10-07-build-dependencies.md).
