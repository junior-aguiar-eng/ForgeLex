# Preparação da integração editorial e do v8

Preparação local autorizada por Boni. Nenhum push, merge, migration operacional,
build remoto, alteração de tráfego ou deploy foi executado nesta sequência.
Não usar a autorização histórica de publicação de 30/10 para publicar esta etapa.

## Fonte e compatibilidade

Checkout `forgelex-3-audit/SDK`, branch `codex/forgelex-3-quality`, commit de
consolidação `adc823b518934e8b1bbdb0aaef8fb27ccd599698`. As alterações seguintes
do editor e do preparador ainda estão no working tree; precisam integrar um
commit próprio antes de formar uma imagem publicável. O snapshot da calibração
registra tanto esse HEAD quanto os hashes dos arquivos efetivamente usados.

O grafo v8, seus contratos anteriores e as políticas financeiras não foram
alterados nesta sequência. Checkpoints antigos não são migrados silenciosamente.
O transporte comercial mantém sua lista de ferramentas; a lista editorial é
separada e só admite `editorial.submit`. Não habilitar o editor no grafo v8.

O histórico editorial exige `persistence-0038-editorial-human-review`, que
adiciona uma coluna de texto inicialmente nula. Não há migration nova nesta
continuação. A aplicação humana usa tabelas de versões existentes e um recibo
opcional no histórico. Linhas sem histórico ou sem recibo continuam legíveis.
Histórico com recibo não deve ser entregue a uma implementação antiga que
rejeite esse campo: um rollback editorial deve preservar leitor compatível.

## Ordem operacional preparada para uma futura autorização

1. Confirmar checkout, remoto, branch base e diff final; incluir os arquivos
   novos e o recibo local no commit de integração. Conferir CI no SHA exato.
   Nenhum teste local equivale a CI, aprovação jurídica ou teste em produção.
2. Ler o journal do banco alvo e comparar IDs completos com o manifest atual.
   Determinar todas as migrations pendentes sem pressupor que só 0038 falta.
   Confirmar backup recuperável e aplicar DDL apenas com autorização própria,
   lock e transações conforme o procedimento operacional já existente.
3. Criar imagem a partir do SHA consolidado e registrar digest. Manter os
   indicadores de execução/piloto no estado aprovado. O bootstrap atual não
   ativa geração editorial real; não adicionar chave ou flag como efeito da publicação.
4. Na candidata isolada, conferir autenticação/tenant, leitura de histórico antigo,
   preview, decisão e aplicação em caso sintético. Testar recibo após resposta
   perdida, conflito de versão e revogação. Conferir que a versão original e
   as citações não adquirem aprovação jurídica nem verificação herdada.
5. Só após decisão de Boni sobre as saídas e a publicação, promover tráfego e
   verificar SHA/digest atendido, assets, readiness e erros. Não usar HTTP 200
   como prova de qualidade jurídica nem fazer chamadas pagas como smoke implícito.
6. Em falha, suspender a operação editorial e retornar a imagem compatível,
   preservando coluna, versões, recibos e ledgers. Não apagar o histórico nem
   reduzir schema para simular rollback. Conferir acesso aos rascunhos e custo
   incerto antes de autorizar novo comando.

## Geração local e futura ativação de serviço

O caminho executável desta etapa é o [host local](../../architecture/2026-11-03-forgelex-editorial-real-connection.md):
comando vinculado a minuta autorizada, ledger USD próprio, saída importável e
nenhuma escrita na minuta. A API e a mesa aceitam injeção de factory autorizada;
não existe habilitação automática por ambiente no bootstrap.

Uma futura ativação comercial para múltiplos usuários precisará definir sua
admissão financeira e vincular cada comando à respectiva entrega, sem reutilizar
reservas v8 encerradas nem apresentar o teto operacional USD como preço BRL.
Essa ativação é distinta da integração local e permanece fora desta publicação
preparada. Os limites da calibração não autorizam chamadas editoriais extras.

## Evidência local e decisão humana

Usar o [recibo da continuação](../../architecture/evidence/2026-11-03-editorial-continuation/validation.json)
para testes, hashes e limites observados. Os ensaios
PostgreSQL são descartáveis e locais; não comprovam schema ou desempenho remoto.
O ensaio de upgrade verifica conservação de uma linha anterior e idempotência;
não substitui backup/restauração do banco operacional.

A ficha da calibração v8 deve registrar a avaliação de Boni. Resultados `LIMITED`,
suporte `PARTIAL`, requisitos não verificados e ausência de entrega permanecem
explícitos. Nenhum terceiro é exigido como aprovador. Se Boni ainda não avaliou,
o estado é **avaliação pendente**, não aprovação presumida nem bloqueio técnico.

Na [rodada real v8 de 03/11](../../architecture/2026-11-03-forgelex-recalibration-v8-results.md),
D01/D03 entregaram com ressalvas e D04 interrompeu antes da minuta/verificador.
Há US$ 0,189408 calculados e uma reserva incerta de US$ 0,083620. Não declarar
calibração encerrada financeiramente nem liberar a reserva sem evidência.
A [ficha de Boni](../../architecture/2026-11-03-forgelex-v8-human-review.md)
permanece pendente; esta preparação não é autorização para publicar.
