# Revisão de fatos e provas alterados

Escopo autorizado: implementação e validação local. Preservar alterações anteriores; sem commit, publicação, migração remota ou inferência paga.

## Contrato

A mesa oferece `Revisar alterações`. O diálogo compara a última aprovação com o conteúdo atual e suas fontes; seleção começa vazia. `Aprovar alterações` registra aprovação humana explícita; `Fechar` mantém a pendência. Identificadores, versões técnicas e mecanismos de execução ficam internos.

Revisões são acrescentadas ao recibo existente, preservando a decisão inicial e snapshots anteriores. Referências congeladas continuam resolvidas pelo hash; uso novo exige a última aprovação e correspondência com registros atuais. Reaprovação não duplica fatos, provas, minutas, reservas ou cobranças. Não depende de a conversa original continuar atual.

São revisáveis texto, condição de alegação/controvérsia, relação com fato aprovado e vínculos documentais válidos. Documentos inativos, âncoras inválidas, vínculos ambíguos ou condição incompatível permanecem bloqueados com mensagem objetiva. Nenhuma revisão converte alegação em verdade confirmada.

## Etapas

- [x] Persistência: snapshots acrescentados, proposta atual verificada, concorrência/idempotência/autorização e histórico; testes de regressão.
- [x] API de sessão por caso, mesmos scopes e limites de runtime; testes de isolamento.
- [x] Opção e diálogo na mesa, comparação e fontes sob demanda, recuperação de resposta perdida; E2E local.
- [x] Build, tipos, lint, testes pertinentes e PostgreSQL; revisão final independente por IA, registro das evidências.

## Foco da revisão final

Verificar adulteração entre prévia e aprovação, repetição após resposta perdida, contexto congelado anterior, autorização entre usuários/casos/runtimes, mudanças de fontes/relações/estado e exclusão de documentos. Conferir ausência de aprovações automáticas, custos novos e metadados na mesa.

## Registro

- Base: `025f6dd438ecfd78079b4688fd076e476da74ce9`, branch `codex/forgelex-3-quality`; incrementos anteriores no working tree preservados.
- Decisão: reutilizar o JSON do recibo com campos opcionais e hashes existentes, sem tabela/migração nova. A comparação mostra conteúdo jurídico; o sistema não corrige nem aprova alterações silenciosamente.
- Revisão final por IA: dois achados P2 reproduzidos em testes. Fonte antiga arquivada bloqueava a prévia inteira; separar reconstrução do recibo e validação das fontes permite substituir vínculos válidos, omitindo trechos anteriores indisponíveis e preservando o bloqueio da leitura histórica. Resposta perdida seguida de conflito definitivo prendia a interface; o código específico de prévia vencida agora permite atualizar, pois o servidor verifica idempotência antes do token. Teste de persistência RED (ACCESS_REVOKED) → GREEN; E2E RED comprovou ausência de Atualizar itens, nova execução após correção pendente.
- E2E final: 3 cenários aprovados em 1,2 min, incluindo conflito 409 depois de perda de transporte, atualização com seleção vazia, perda de resposta após commit e repetição idempotente, acessibilidade mobile, preservação de cobrança e entrega histórica, nova peça com texto reaprovado. O teste aguarda a nova prévia antes de selecionar; não confunde seleção antiga desabilitada com escolha atual.
- PostgreSQL: 14 verificações do smoke e 41 testes de regressão aprovados em bancos temporários locais.
- Fechamento: suíte geral 1.582 aprovados, 17 pulados (16 cobertos na execução PostgreSQL; um teste pago não executado), 225 arquivos aprovados/3 pulados, 764,86 s. Build completo e builds afetados após correções, tipos, lint e diff check aprovados. Nenhum achado adiado. Recibo: `docs/architecture/evidence/2026-11-02-evidence-reapproval-validation.json`.
