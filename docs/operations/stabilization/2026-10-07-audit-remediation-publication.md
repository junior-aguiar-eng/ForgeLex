# Remediação da auditoria — integração e publicação

> Governança vigente desde 10/10/2026: Boni é o único avaliador e aprovador humano.
> Exigências anteriores de segundo revisor, revisão independente obrigatória ou
> parecer externo são históricas e foram revogadas por sua decisão expressa.
> Registros de avaliações já realizadas permanecem evidências do seu período.
> Ver [AGENTS.md](../../../AGENTS.md).

Entrega integrada pela [PR #58](https://github.com/junior-aguiar-eng/ForgeLex/pull/58).
Head validado `b96550eafb830fe95bb126aaa6ffc2c7ead62b72`; merge/código publicado
`5aca51e52cd315822e80bff7d29eaa7a48960724`.

## Resultado e validação

Filtros do lifecycle ficam bloqueados durante operações pendentes; a CI conserva
diagnósticos quando esse job falha. Dois advisories de build foram corrigidos,
com CSS idêntico ao baseline. Pesquisa permite salvar o julgado em um caso ativo,
consultar o acervo/fonte, copiar citação e reutilizar nos seletores de Rascunhos.
Não há nova pesquisa ou débito para salvar/copiar. APIs, MCP, schema e preços
foram preservados.

CI da PR `37685459561` e de main `37686335218`: seis jobs aprovados. Em main,
764 unitários aprovados, 17 condicionais ignorados e 130 E2E aprovados; os testes
ignorados não constituem prova. PostgreSQL isolado comprova inspeção em transação
somente leitura, cutoff exato, correspondência entre inspeção e purge e saldo
preservado. Build, lint e typecheck aprovados. Cenário local adicional: diálogo
mobile em 390px, zero violações Axe, sem rolagem horizontal e reutilização no
seletor de tese. [Imagem sintética](assets/2026-10-07-save-case-mobile.png).

Revisão independente do núcleo `8ba33e0...486d972`: nenhum achado material P0–P2.
O script de provisionamento adicionado em `b96550e` teve parse e execução real
verificados pelo executor, fora do recorte daquele parecer. Nenhum achado menor
foi adiado. Isso delimita a revisão; não constitui auditoria de intrusão.

## Publicação e rollback

Backup Cloud SQL `1791395897025`, SUCCESSFUL, concluído às
`2026-10-07T18:00:18.705Z`. Gates de restauração de encerramento e exclusão
confirmados no readiness. Cloud Build `b5ef6e20-2f39-40f0-8280-342d00e3a383`,
SUCCESS, executado pelo script canônico a partir de clone limpo de main alinhado
ao remoto. Sem migration nesta publicação.

Imagem por digest:
`southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:39cb2d3e33fbbcea238c63c3c8f9899d75b89bf38963993946b69336671e73fa`.
Revisão `forgelex-api-prod-audit-5aca51e`, 100% do tráfego.
Rollback: `forgelex-api-prod-connection-a23cc07`.

Candidata criada sem tráfego normal. As sondas iniciais ainda chegaram à revisão
anterior durante propagação do balanceador e não autorizaram a promoção. Após
propagação, as dez rotas identificaram exclusivamente a candidata nos logs; os
arquivos servidos contêm a ação e o acervo. Promoção 5/25/100 com janela mínima
de 120 segundos por etapa, readiness e presença da candidata nos logs. Na etapa
final, somente a nova revisão apareceu nas sondas. Foram 157/158/158 sondas,
total 473, com 134 segundos efetivos por etapa. Contagens e tempos efetivos,
checagens finais e limpeza de rota/backend/NEG/tag temporários constam do recibo.
Configurações, ingress, recursos e variáveis anteriores foram preservados.

## Operação de retenção e acompanhamento

Job `forgelex-operational-retention-inspect`, usando o mesmo digest aprovado;
Scheduler `forgelex-operational-retention-inspect-daily`, diariamente às 8h em
America/Fortaleza, POST autenticado por OAuth para a API de execução do job.
IAM de execução restrito ao invoker existente, sem acesso público. Execução
manual `forgelex-operational-retention-inspect-mv49f` e execução pelo Scheduler
`forgelex-operational-retention-inspect-l7fz8` concluíram em modo `inspect`, com
zero elegíveis nas seis categorias. O Scheduler recebeu HTTP 200; os logs do
job comprovam conclusão, além da aceitação do disparo.

`FORGELEX_RETENTION_EXECUTION_ENABLED=false`, sem argumento `--apply`.
Worker público continua desabilitado. A política efetiva conserva 90 dias
operacionais, 180 de acesso e 1827 de recibos, com as exceções existentes.
**Inspeção agendada não é expurgo ativo.** A habilitação de exclusão permanece
sujeita à decisão operacional registrada na matriz de comprovações.

Automação diária de acompanhamento às 15h preservada, apontando para main
mantido e PENDENCIAS; silêncio quando nada acionável muda. Reserva histórica
classificada em leitura agregada: lease vencido de 20 centavos, sem débito
correspondente; nenhum saldo/status foi alterado.

## Limites e pendências reais

Não houve ensaio autenticado novo de salvamento em produção nem nova busca
paga. O comportamento autenticado está demonstrado pelos testes locais/CI;
runtime foi conferido por rotas, arquivos servidos, revisão/digest, tráfego e
readiness. Nenhuma nova concessão MCP ou homologação nativa ChatGPT/Claude foi
feita. As janelas sem HTTP 5xx observados têm início/fim no recibo e não equivalem
a monitoramento contínuo ou garantia universal de latência.

O alerta alto de `braces` continua sem patch publicado na consulta de 07/10.
A causa exata da falha Linux anterior não foi demonstrada, embora o cenário
tenha passado nos gates desta entrega. Suporte humano, segundo revisor/canal,
qualificação fiscal, contratos/transferências de privacidade e comprovações
de comércio eletrônico permanecem na [matriz](2026-10-07-operational-proof-checklist.md).
Mesa, novos agentes, OCR e novos tribunais são propostas futuras.

[Recibo sanitizado](2026-10-07-audit-remediation-publication.json) ·
[Backlog vigente](../../../PENDENCIAS.md).
