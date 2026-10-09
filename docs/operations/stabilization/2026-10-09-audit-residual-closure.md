# Pendências residuais — conferência de 09/10/2026

Escopo: solicitação de Boni para resolver a lista da auditoria de 07/10. Base verificada: main/origin/main `064927391e54ada35c783541b155e172295a4104`, após fetch. A lista original antecede as PRs #58/#59; suas tarefas encerradas não foram reabertas.

## Conferências atuais

- CI de main `37691235895`: completed/success; CI da entrega de código `37686335218`: completed/success.
- Runtime `forgelex-api-prod-audit-5aca51e`, 100% do tráfego; readiness com os oito checks true. Readiness não comprova E2E nem todo o histórico operacional.
- Pesquisa → Caso já publicado. O print enviado pelo usuário nesta conversa mostra um julgado salvo no caso; não substitui logs de cada operação nem uma avaliação de pertinência jurídica.
- Dependabot: somente alerta #11 aberto, `braces`, GHSA-vfj7-8cjw-p6xm, severidade alta, first_patched_version null. Registry npm: latest 3.0.3. Audit pnpm ainda anuncia >=3.0.4; essa indicação não é release publicada.
- Scheduler `forgelex-operational-retention-inspect-daily`: ENABLED, `0 8 * * *`, America/Fortaleza, invocação OAuth da API do job.
- Execução `forgelex-operational-retention-inspect-rz6ch`: Completed=True, 09/10 às 11:00:17.692564Z. Log `retention.completed` às 11:00:12.219Z, inspect, zero em todas as seis categorias.
- Backups de `forgelex-hml-pg`: 12 listados, todos SUCCESSFUL; mais antigo em 03/10/2026, mais recente em 09/10/2026. Nenhum excede a janela de 35 dias nessa consulta. O último automático é `1791514800000`, concluído às 04:31:55.623Z. Não houve restauração nem exclusão de backup nesta conferência.

## Mitigação local de braces

Patch pnpm versionado e aplicado pelo lockfile a todas as referências de braces 3.0.3. Um validador iterativo limita a profundidade da AST a 100 antes dos percursos recursivos de compile, expand e stringify. Protege padrões textuais e ASTs fornecidas diretamente, inclusive stringify chamado por expand; não muda a quantidade permitida de irmãos nem escolhe nova biblioteca de CSS.

Teste real da dependência transitiva do Tailwind: RED com oito falhas e dois testes de compatibilidade aprovados; GREEN com dez aprovados. A mitigação não cobre todo tipo possível de custo computacional de globs e não é uma versão corrigida pelo fornecedor.

CI conserva audit de produção e passa a auditar todas as dependências. O alerta conhecido fica visível no recibo, condicionado ao teste do patch e à revisão antes de 08/11/2026 UTC; novos alertas moderados/altos/críticos e relatório inválido falham. Dependabot não foi descartado. Dockerfile inclui patches antes da instalação congelada.

## Ativação autorizada da retenção

A proposta preservou imagem/digest, identidade, segredo referenciado, conexão
Cloud SQL e Scheduler existentes. A alteração consiste em adicionar `--apply`
após `api/dist/operations/retention-main.js` e definir
`FORGELEX_RETENTION_EXECUTION_ENABLED=true`. Worker do serviço HTTP permanece
desabilitado. Antes da ativação, o job tinha somente o caminho do comando e
execução desabilitada.

A proposta foi apresentada antes da mutação. Boni respondeu expressamente
“Autorizar ativação da política técnica proposta” em 09/10/2026. O job existente
foi atualizado com --apply e execução=true, preservando seu digest aprovado e
as demais configurações. Seu nome histórico contém inspect; o modo efetivo
deve ser conferido nos argumentos e recibos, não inferido do nome.

- Inspeção imediatamente anterior: `forgelex-operational-retention-inspect-ppt8z`, Completed=True às 20:50:05.629642Z, contagem zero, medição 20:50:02.015Z.
- Primeira execução manual apply: `forgelex-operational-retention-inspect-zqm6b`, Completed=True às 20:52:31.630490Z, medição 20:52:28.749Z, seis contagens zero.
- Disparo pelo Scheduler OAuth: `forgelex-operational-retention-inspect-fcmjs`, Completed=True às 20:54:47.670096Z, medição 20:54:43.655Z, apply e seis contagens zero.

A rotina diária está ativa às 8h em America/Fortaleza. Não houve conteúdo
elegível removido nessa homologação; execução bem-sucedida com zero alterações
não substitui os testes sintéticos de corte/exceções já existentes.

| Categoria                        | Ação proposta                                                                         | Corte                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Histórico de pesquisa            | Eliminar linhas antigas                                                               | created_at anterior a 90 dias                                                    |
| Snapshots operacionais           | Remover o conteúdo do snapshot, preservando linhas e valores financeiros              | Operações COMPLETED por updated_at e ledger por created_at, anteriores a 90 dias |
| Corpos de webhook de entrega     | Remover response_body_excerpt de entregas DELIVERED/FAILED                            | updated_at anterior a 90 dias                                                    |
| Corpos de webhook financeiro     | Redigir payload e error_message; não eliminar pagamentos/ledger                       | received_at anterior a 90 dias                                                   |
| Auditoria                        | Eliminar logs antigos, preservando exceções ativas de encerramento conforme o serviço | created_at anterior a 180 dias                                                   |
| Recibos e etapas de encerramento | Eliminar recibos COMPLETED e suas etapas, sem exceção ativa                           | completed_at anterior a 1827 dias                                                |

Esses são cortes técnicos em dias, não equivalência a seis meses/cinco anos civis nem prazo fiscal universal. Na medição de hoje, todos os cortes encontraram zero elegíveis; isso não autoriza nem prevê o futuro. A rotina não elimina documentos/casos de contas ativas nem valores financeiros; a saga de encerramento é separada.

Decisão nominal, nova inspeção e conferência de backups registradas acima.
A confirmação técnica não encerra as qualificações fiscais e de privacidade
abertas. Interrupção: retirar --apply e definir execução=false. Essa reversão
interrompe futuras limpezas; não recupera conteúdo já eliminado, que depende
de backup e dos gates próprios de restauração.

## Informações humanas recebidas em 09/10

Boni confirmou: opera sozinho; ainda não dispõe das decisões/documentos fiscais e contábeis, contratos/transferências ou comprovantes solicitados dos fluxos comerciais.

- Não há segundo revisor demonstrado. Preservar o protocolo aprovado: ações sensíveis ficam bloqueadas; respostas gerais e fluxo autenticado existente continuam possíveis. Agente automático não substitui revisor humano.
- Não coletar documento de identidade enquanto faltar canal restrito validado. O e-mail de suporte aprovado não foi presumido canal seguro de coleta.
- Qualificação fiscal, avaliação de legítimo interesse, contratos/transferências e comprovação comercial continuam abertas. Produzir modelos ou aprovar textos não comprova essas operações.
- Não criar contratação, enviar mensagem a terceiro, alterar prazo fiscal ou declarar conformidade em nome do responsável.

## Limites da rodada

Não houve busca jurídica paga, alteração de saldo, coleta de documentos, nova
permissão MCP ou encerramento de conta. A rotina remota de expurgo foi ativada
e executada com autorização; as contagens comprovam zero conteúdo removido.
As evidências humanas são separadas da mitigação e da ativação técnicas; ver
[matriz operacional](2026-10-07-operational-proof-checklist.md).

## Acompanhamento

O app informou que a automação anterior não existia ao tentar atualizá-la.
Recriada, sem duplicata, `forgelex-acompanhamento-operacional`, ACTIVE,
diariamente às 15h, mesma conversa de acompanhamento. Prompt atualizado para
ler os recibos e nunca disparar job/Scheduler em modo apply; acompanha release
upstream e revisão do patch, sem repetir a ausência inalterada de provas humanas.

## Revisão independente

Nenhum achado Critical ou Minor. Dois Important no filtro de audit: relatório
com contagens inconsistentes podia passar; versão antiga não coberta pelo patch
podia receber a exceção. Ambos corrigidos com regressões RED/GREEN. O filtro
exige contagens válidas/consistentes e findings não vazios, exclusivamente 3.0.3.
Trinta testes focados aprovados após o reparo.

Fora do parecer: outros custos combinatórios de globs; ASTs com getters/proxies
arbitrários; adequação jurídica/fiscal; operações remotas e build/suíte pelo
executor. Decisão: manter a proteção limitada à profundidade para ASTs do parser,
sem promessa geral de segurança de globs. O custo é preservar globs revisados e
os demais controles de build. Evidências externas e gates humanos mantêm seus
registros próprios. Docker local não executado porque o daemon está indisponível.

## Validação local

- Instalação congelada aprovada; hash do patch preservado entre working tree e filtros Git. `.gitattributes` fixa LF para patches.
- Empacotamento `pnpm --filter @forgelex/api deploy --prod` em destino local isolado aprovado. Não é deploy remoto nem build Docker.
- Build aprovado; CSS baseline e final SHA-256 `37958cb138fd6b80205c74e25b7a1f1a3469819331724276ef5a333ae44c47a0`, idênticos.
- Lint e typecheck aprovados; audit de produção sem alertas. Audit completo: somente braces conhecido, registrado como mitigado localmente, sem patch upstream.
- Após os reparos da revisão: `vitest run --maxWorkers=1`, 794 aprovados e 17 condicionais ignorados, 150 arquivos aprovados e dois ignorados. Trinta testes de segurança estão incluídos no total.
- Uma execução completa com dois workers teve um timeout de 5000ms no teste `never exposes an archived original through draft references to API or OAuth readers`; 793 passaram. O cenário isolado passou em 1193ms, arquivo 6/6. Não alterados API, timeout ou configuração de concorrência da CI; a causa pontual não foi demonstrada e a evidência foi preservada.

[Recibo sanitizado da ativação](2026-10-09-retention-activation.json).

## Disponibilidade da imagem de PostgreSQL na CI

A execução da PR #60 `37991241438`, tentativas 1 e 2, teve quatro checks
aprovados. `postgres` e `e2e-product` falharam em Initialize containers antes
dos testes: Docker Hub respondeu `toomanyrequests` em três downloads de cada
job. Não foi falha de migração ou de asserção da aplicação.

Os dois serviços passam a usar `public.ecr.aws/docker/library/postgres:16`,
[Docker Official Image no registro público da AWS](https://gallery.ecr.aws/docker/).
Consulta anônima do manifesto de 16 retornou schemaVersion 2 e índice OCI,
incluindo Linux/amd64, versão 16.15 e origem docker-library/postgres no commit
`9d15534160ade17f2b6c455a39ee967c49b1937d`. Mantidos major, variáveis, portas,
healthcheck e comandos de teste. Nenhuma imagem ou banco de produção alterado.
O download e os testes completos dessa configuração dependem da nova execução
dos seis checks; disponibilidade do manifesto isoladamente não os comprova.
