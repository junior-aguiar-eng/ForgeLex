# Revisão e nova aprovação de fatos e provas

Incremento local de 02/11/2026 no checkout `forgelex-3-audit/SDK`, branch `codex/forgelex-3-quality`, base `025f6dd438ecfd78079b4688fd076e476da74ce9`. Implementação ainda sem commit, integração ou publicação.

## Comportamento

Com um caso selecionado, a mesa oferece **Revisar alterações**. O diálogo apresenta **Última aprovação**, **Como está agora** e **Conferir fontes**. Nenhum item começa selecionado. **Aprovar alterações** registra somente os itens escolhidos; **Fechar** mantém a pendência. Fonte indisponível ou condição incompatível exige conferência no caso. A relação da prova com o fato aparece em linguagem jurídica simples.

O próximo pedido usa a aprovação atual automaticamente. Uma nova alteração volta a bloquear o uso. A revisão não inicia execução, reserva, pesquisa ou cobrança. A leitura das entregas antigas preserva os snapshots originais e continua sujeita ao acesso atual às suas fontes.

## Controles internos

- Rotas de sessão por caso, scopes `research:read`, `matter:read` e `matter:write` para gravar, autorização de proprietário e de runtime. Nenhuma ferramenta agêntica recebe capacidade de aprovar.
- Locks de tenant e caso, revalidação de autorização antes do commit, token da prévia calculado sobre recibos e conteúdo atual. Concorrência divergente exige nova conferência; repetição idêntica confirma o mesmo recibo.
- Revisões acrescentadas ao JSON de aprovação existente, com ator e data. Decisão inicial e payload/hash da análise permanecem intactos; referências congeladas continuam resolvidas por hash. Sem migration nova.
- Texto, condição de alegação/controvérsia, fontes documentais e relação da prova são comparados. Novas fontes exigem documento ativo do mesmo caso, versão atual, âncora íntegra e citação literal. Não há promoção automática para fato confirmado.
- Uma prova alterada dependente de fato alterado exige aprovação explícita de ambos. Aprovação parcial deixa os demais itens pendentes; não há descarte ou seleção implícitos.
- Trechos anteriores indisponíveis são omitidos da prévia, com aviso. Sua indisponibilidade não impede conferir uma substituição válida; também não desbloqueia a leitura histórica da fonte revogada.
- Limites existentes de contexto e recibo permanecem; até 100 novas aprovações por item, sem truncamento de histórico.

## Validação

Resultados finais e logs estão relacionados no [recibo local](evidence/2026-11-02-evidence-reapproval-validation.json), preenchido após a conclusão dos testes. Os testes usam documentos sintéticos, autenticação local e banco descartável. A edição de dados no E2E ocorre somente na fixture SQLite temporária; não foi adicionado endpoint de teste ao produto.

Suíte geral: **1.582 testes aprovados**, 225 arquivos aprovados. Os 17 testes pulados compreendem 16 cenários PostgreSQL cobertos na execução separada e uma integração de inferência paga não executada.

O fluxo de navegador passou nos três cenários: reaprovação com seleção explícita, conflito de prévia após perda de transporte, repetição após resposta perdida depois do commit, nova peça com texto reaprovado e entrega histórica intacta. Axe sem violações no diálogo móvel e sem transbordamento horizontal. Evidências visuais: [revisão no celular](evidence/2026-11-02-evidence-reapproval-mobile.png) e [mesa após nova aprovação](evidence/2026-11-02-evidence-reapproval-mesa.png).

PostgreSQL local: 14 controles no smoke e 41 testes de regressão aprovados; os containers de teste foram removidos ao final. Build completo, builds dos pacotes afetados após correções, verificação de tipos e lint aprovados.

Revisão independente por IA identificou dois problemas: fonte antiga indisponível interrompendo toda a prévia e recuperação de transporte sem saída após conflito definitivo. Foram reproduzidos e corrigidos; o teste de conflito verifica a resposta `409 EVIDENCE_REVIEW_CONFLICT` antes de exigir a opção de atualizar. Uma tentativa inicial do teste não alterava efetivamente a condição do fato; a fixture foi corrigida para alternar seu estado e comprovar o conflito.

## Limites

Não inclui editor novo de fatos/provas nem nova análise jurídica de mérito. Itens sem condição ou vínculo válido permanecem bloqueados; fechar o diálogo não os aprova. Aprovar o contexto não aprova uma peça nem altera entregas anteriores. Não houve chamadas pagas de IA, operação remota ou homologação com autos reais.
