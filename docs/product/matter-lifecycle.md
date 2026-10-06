# Arquivo, Lixeira e exclusão de casos/documentos

Implementação em andamento na branch `codex/casos-documentos-ciclo-vida`.
Especificação: `docs/superpowers/specs/2026-10-06-casos-documentos-ciclo-vida-design.md`.

## Organização e acesso

`ACTIVE`, `ARCHIVED`, `TRASHED`, `PURGED` são independentes do resultado de
ingestão. Caso arquivado conserva o status OPEN/CLOSED anterior. Restaurar
da Lixeira recupera o estado anterior e não restaura filhos nem concessões IA.
Revisões impedem comandos desatualizados; gestão exige sessão web, permissão
de escrita e criador do caso ou owner/admin. Gestão não cobra nem restitui saldo.

Consulta humana retida (`web_retained`) permite abrir a Lixeira, com autenticação
web. Conferência de fonte (`web_history`) permite documento arquivado, mas não
documento/caso na Lixeira. Trabalho (`work`) exige pai e documento ativos.
PURGED é filtrado antes de interpretar contratos de título/âncoras.

## Inventário de exclusão

O expurgo não usa a exclusão por organização. Cada predicado contém o tenant
e caso autorizado, ou uma cadeia de dependência até esse alvo.

| Grupo | Associação e tratamento na exclusão do caso |
|---|---|
| Pedidos, tokens e decisões de aprovação | Tokens/decisões por request_id dos pedidos tenant+matter_id; removidos antes dos pedidos |
| Citações, achados e execuções de revisão | tenant+matter_id; removidos antes de seções/versões |
| Recibos IA e concessões | tenant+matter_id; removidos antes de versões/grants referenciados |
| Rascunhos, versões e seções | tenant+matter_id, na ordem de dependência |
| Autoridades e verificações | tenant+matter_id; verificações antes das autoridades |
| Teses, questões e memos | tenant+matter_id |
| Vínculos de prova/fato, eventos, provas e fatos | tenant+matter_id; vínculos e eventos antes dos alvos e âncoras |
| Âncoras, versões e documentos | versões/documentos do tenant+matter_id; removidos nessa ordem |
| Checkpoints de workflow | tenant+matter_id explícito |
| Histórico de pesquisa | tenant+matter_id explícito; pesquisas avulsas sem associação permanecem |
| Sessões, mensagens, checkpoints e aprovações genéricas | sessões tenant+matter_id e filhos por session_id |
| Caso | marcador PURGED, título vazio e metadados descritivos removidos; IDs mínimos e creator ID para autorização de reconciliação |
| Operações de purge | IDs, revisão, fingerprint, resultado e contagens; prova operacional conservada |
| Auditoria | IDs/ação/revisão/contagens; não registra originais, confirmação ou tokens |

No histórico legado, sem matter_id, uma query igual não prova pertencimento.
Os workflows existentes gravam memos/checkpoints com caso explícito; histórico
de busca avulsa é escrito pelo caminho separado de pesquisa. Não atribuir dados
compartilhados por semelhança textual ou apagar todo o histórico da organização.
Uma associação ambígua demonstrada precisa ser resolvida antes do purge; não
declarar removido o conteúdo avulso que não possui vínculo com o caso.

Excluir somente documento remove conteúdo de TODAS as versões/âncoras e os
metadados descritivos. Conserva IDs/hash e tombstones necessários aos vínculos.
Fatos, notas, rascunhos e revisões que já copiaram trechos não são reescritos.
A interface precisa explicar esse limite antes da confirmação definitiva.

Registros financeiros e corpus público não participam do purge do caso.
Retenções vigentes aplicáveis em account closure impedem a operação com conflito.
Erro de FK/SQL provoca rollback integral; não remover dados de outro caso para
contornar um vínculo inconsistente.

## Journal e recuperação

Journal lifecycle tem namespace `matter-lifecycle/`, independente de `closures/`,
e fica fora do banco restaurável. PREPARED sela os IDs com AES-256-GCM e MAC;
COMPLETED/ABORTED disputam um único objeto terminal imutável. A âncora existente
é validada; startup não a cria automaticamente. Guardar chaves/âncora fora do
snapshot e preservar acesso a elas enquanto houver backups recuperáveis.

Antes do purge, PREPARED é persistido. O tx local grava COMMITTED e a identidade
da operação; depois o journal confirma COMPLETED. Falha de confirmação não
ressuscita conteúdo nem autoriza um segundo purge: a mesma operação é reconciliada.
Comando antigo já definitivamente concluído responde conflito.

Falha depois de iniciar commit é resultado desconhecido; rollback posterior
que seja um no-op não comprova cancelamento. Somente rollback confirmado antes
do commit permite ABORTED. Restore com PREPARED inconclusivo permanece fechado;
ausência de marcador no backup anterior não prova cancelamento.

COMPLETED reaplica purge/redação e verifica resíduos antes da readiness. Não
há promessa de apagar retroativamente arquivos de backup. Uma conta encerrada
minimiza a associação de tenant dos marcadores operacionais; reaplicação não
recria essa identidade quando o caso já não existe.

## Validação

Evidências por SHA e ambiente serão registradas em
`docs/product/matter-lifecycle-validation.md`. Teste unitário ou build não
substitui PostgreSQL na CI, restore anterior, navegador e hosts nativos.
