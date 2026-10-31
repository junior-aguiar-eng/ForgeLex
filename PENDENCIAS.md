# Pendências atuais do ForgeLex

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
| Cancelar durante uma chamada deixa a chamada incerta e bloqueia o tenant | Decisão de Boni sobre a política (hoje a saída é a conciliação manual por `scripts/reconcile-commercial-call.mjs`, com evidência do provedor) |
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
