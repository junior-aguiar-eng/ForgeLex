# Casos e documentos: arquivamento, Lixeira e exclusão

Data: 06/10/2026. Proposta de produto aprovada por Boni nesta conversa.
Situação: especificação escrita para revisão; implementação ainda não iniciada.
Checkout: `C:/Users/Boni Jr/.codex/worktrees/draft-review/SDK`.
Branch: `codex/casos-documentos-ciclo-vida`; base: `dbdc349f65dd8a9e568a6150e306d8388d158b80`.

## Resultado esperado e recorte

Permitir organizar casos e documentos, retirar materiais da rotina, recuperar
itens removidos por engano e excluir definitivamente quando solicitado.
Preservar a interface limpa: ações em **Mais opções**, sem termos técnicos,
botões destrutivos espalhados ou uma nova área principal de navegação.

O recorte inclui casos e documentos, seus vínculos, acessos da IA e efeitos
sobre revisão/aprovação. Não inclui exclusão individual de fatos, provas,
teses ou rascunhos; importação em massa; limpeza automática por prazo;
alterações de preços; nem reconstrução do encerramento de conta existente.
Excluir um caso abrange seus materiais privados associados.

Abordagem escolhida: arquivamento reversível e exclusão em duas etapas,
com Lixeira. Exclusão direta simplificaria a implementação, mas eliminaria
a recuperação de erros. Apenas esconder itens na interface deixaria leituras
diretas e permissões da IA ativas; não atende à proposta aprovada.

## Interface

Na lista de casos, filtro compacto **Em uso**, **Arquivados**, **Lixeira**.
Em uso inclui casos OPEN/CLOSED; não é criada uma nova operação de encerramento.
Na seção de documentos do caso, os mesmos filtros e um menu por documento.
O caso aberto possui seu próprio **Mais opções**. A área de rascunhos e a
pesquisa contextual respeitam o estado do caso e não mostram itens da Lixeira
como destinos de trabalho. Arquivados têm consulta humana somente leitura.

- **Arquivar** retira o item da lista principal e conserva o conteúdo.
- **Restaurar** devolve um arquivado à rotina. Na Lixeira, retorna ao estado
  anterior à exclusão: um arquivado continua arquivado.
- **Excluir** pede confirmação e envia para a Lixeira. A mensagem explica
  que o item poderá ser restaurado e que novos acessos da IA serão bloqueados.
- **Excluir definitivamente** só aparece na Lixeira. Para documento, a
  confirmação identifica o arquivo e explica o impacto nas referências.
  Para caso, exige também digitar o título exibido e informa que documentos,
  fatos, provas, teses e rascunhos associados serão removidos.

Sem esvaziamento em lote, prazo automático ou exclusão definitiva da lista
principal. Fechar a confirmação ou pressionar Escape não altera dados.
Resultados indicam claramente **Arquivado**, **Enviado para a Lixeira**,
**Restaurado** ou **Excluído definitivamente**. Erros mantêm a tela e o texto
em edição; não exibem sucesso antecipado.

Caso arquivado/na Lixeira permite consulta humana do conteúdo retido,
restauração e ações de ciclo de vida pertinentes; não permite novas edições,
ingestões, vínculos, pesquisas associadas, recebimentos da IA ou aprovações.
Um documento só pode mudar de estado se seu caso estiver em uso. A interface
orienta restaurar o caso primeiro. Restaurar o caso não restaura documentos
que estavam individualmente arquivados ou na Lixeira.

Trocar caso/filtro, arquivar ou excluir durante edição não salva nem descarta
o buffer silenciosamente. Reusar a proteção de edição existente: salvar,
descartar explicitamente ou cancelar. A ação espera o salvamento escolhido;
se ele falhar, não altera o ciclo de vida. Outra aba que altere o estado gera
conflito; conservar o buffer, sinalizar a indisponibilidade e bloquear novas
gravações até nova decisão. Não carregar automaticamente conteúdo de outro caso.

## Estado e compatibilidade

Adicionar `lifecycleState: ACTIVE | ARCHIVED | TRASHED | PURGED`, revisão
monotônica, estado anterior à Lixeira e datas/atores das transições, nas
tabelas `matters` e `legal_documents`. Usar migration aditiva compartilhada
por PostgreSQL e SQLite, com defaults para dados preexistentes.

`Matter.status` OPEN/CLOSED/ARCHIVED e `LegalDocument.status` INDEXED/FAILED
não são substituídos: estado operacional do caso e resultado da ingestão
continuam disponíveis aos consumidores atuais. Para casos, o arquivamento
sincroniza `status=ARCHIVED` e guarda o OPEN/CLOSED anterior; restauração
recupera esse valor. Um caso arquivado enviado à Lixeira conserva essa
condição para a restauração. Casos preexistentes com status ARCHIVED migram
para lifecycle ARCHIVED, com OPEN como retorno definido por falta de histórico.
Documentos preexistentes recebem lifecycle ACTIVE, inclusive ingestões FAILED.

Transições permitidas: ACTIVE→ARCHIVED; ARCHIVED→ACTIVE;
ACTIVE/ARCHIVED→TRASHED; TRASHED→seu estado anterior; TRASHED→PURGED.
PURGED não tem restauração. Não reativar concessões da IA em transição alguma.
Repetir uma ação já concluída com a revisão antiga gera conflito, sem nova
mutação ou evento de sucesso. Recarregar permite conferir o estado atual.

O estado efetivo de um documento depende também do caso. Arquivar/excluir
o caso não reescreve os estados individuais dos filhos. A consulta humana
do histórico e os caminhos internos de purge não usam os mesmos métodos
que habilitam material para seleção, edição ou envio à IA.

## Serviço, rotas e autorização

Criar módulo de ciclo de vida com contratos no domínio, repositório transacional
na persistência e rotas em arquivo próprio da API, registrado no app existente.
Não concentrar a implementação no componente visual nem reestruturar o app.

Gestão exige sessão web ativa, `matter:write` e usuário criador do caso ou
papel owner/admin da organização. Documentos herdam essa autorização do caso.
Validar papéis da identidade autenticada, nunca do corpo da requisição.
Não oferecer ferramentas MCP de exclusão nem permitir gestão por API key.
Leitura mantém o isolamento e a autorização atuais da organização; a IA
continua limitada à concessão individual válida para usuário/aplicativo/caso.
IDs de outra organização recebem 404; usuário sem gestão no mesmo caso,
403. Nenhum erro expõe conteúdo, nome privado de outro caso ou credenciais.

Rotas propostas, cada uma com corpo estrito e `expectedLifecycleRevision`:

- `POST /api/v2/matters/:matterId/archive|trash|restore|purge`.
- `POST /api/v2/matters/:matterId/documents/:documentId/archive|trash|restore|purge`.

Os quatro nomes representam quatro rotas distintas, não uma rota contendo `|`.
Purge exige confirmação explícita adicional no contrato. IDs de usuário,
tenant, status arbitrário ou recebimento/aprovação não são aceitos na entrada.
Resposta contém só ID, estado, revisão e datas; `Cache-Control: no-store`.

Listagens recebem filtro estrito `view=active|archived|trash`, padrão active.
Detalhes humanos podem consultar conteúdo retido de arquivados/Lixeira com
estado explícito e modo somente leitura. PURGED não fornece conteúdo nem
entra nas listagens. Leituras de versões, âncoras, suporte de fatos, evidências,
mapas de teses e referências indiretas precisam observar o mesmo filtro.
Não basta filtrar a lista inicial de documentos.
Consulta de conteúdo arquivado/na Lixeira exige sessão web; API keys e OAuth
não ganham esse caminho de leitura. A resolução humana de referências de
documentos arquivados é um caminho explícito de histórico/conferência,
separado da seleção de documentos disponíveis para trabalho novo ou IA.

## Atomicidade, IA e operações existentes

Usar a mesma serialização por caso já empregada no recebimento da IA:
lock/UPDATE escopado no caso, depois documento/rascunho e dependências.
Não introduzir ordem de locks inversa. Lifecycle e concessões são alterados
na mesma transação. Revalidar estado/revisão antes do commit.

Arquivar ou excluir um caso revoga todas as concessões ativas daquele caso,
incrementando suas revisões. Arquivar/excluir um documento revoga somente
as concessões ativas desse caso que selecionem o documento, incluindo versões
fixadas; materiais não afetados não ampliam nem renovam permissões.
Restaurar exige seleção e concessão novas por decisão humana.

Manifestos, leituras com cursores antigos, novas referências e `draft.save_from_ai`,
inclusive replay, recusam material indisponível. Para case-level revogação,
manter o envelope `CASE_CONTEXT_NOT_AUTHORIZED`. Não prometer apagar conteúdo
que o ChatGPT/Claude já recebeu. Uma leitura/commit concluída antes do bloqueio
pode permanecer entregue; bloqueio confirmado antes do commit impede a operação.

Aplicar guardas de escrita às operações existentes: ingestão/versionamento,
fatos/provas/vínculos, teses/questões/eventos, fontes/memos de pesquisa,
versões/adoção/revisão/aprovação de rascunhos e concessões da IA.
Não confiar só nos botões desabilitados. Escritas verificam disponibilidade
sob a disciplina transacional; trabalho iniciado antes de uma alteração
revalida a revisão observada antes de confirmar efeitos locais.
Não iniciar pesquisa faturável associada a caso indisponível. Operação externa
já concluída não implica estorno ou desfazimento automático da cobrança.

Uma exclusão/arquivamento não cria restituição, muda saldo, apaga lançamentos
financeiros ou refaz os direitos de pesquisa. Gestão de materiais é gratuita.
Auditoria registra ação, IDs, resultado, revisão e contagem agregada das
concessões revogadas; não registra texto, notas, título digitado ou tokens.

## Referências, revisão e aprovação

Arquivar documento preserva a leitura humana da versão fixada nas referências
existentes e sua conferência; retira o documento de novas seleções e do acesso
da IA. Enviar para a Lixeira ou excluir definitivamente torna a fonte
indisponível para conferir e aprovar, sem apagar a identidade dos vínculos.

Reusar o resultado DOCUMENT/CASE_DOCUMENT com estado indisponível e pendência
bloqueante. Incluir disponibilidade/revisão de lifecycle no contexto/hash de
conferência e, para suporte por âncora, distinguir vínculo registrado de fonte
efetivamente disponível. Não apresentar suporte conferido a partir de um
documento na Lixeira ou PURGED. DOCX continua exportando a versão salva,
com aviso e referências indisponíveis explícitas, sem incluir texto original
de documento removido por meio de um resolvedor de fontes.

Restaurar material não restabelece uma conferência antiga como suficiente:
exigir nova conferência do contexto restaurado. Solicitações de aprovação
pendentes são revalidadas no momento da decisão; token antigo não permite
aprovar caso indisponível ou contexto alterado. Decisões e versões já
concluídas permanecem históricas, sem reescrever a aprovação anterior.

## Exclusão definitiva e retenção mínima

Documento: remover definitivamente o texto original de todas as versões e
âncoras e os metadados descritivos do arquivo. Manter apenas estruturas
mínimas de identidade/proveniência necessárias às foreign keys e aos vínculos,
com lifecycle PURGED. Nenhum leitor normal pode transformar essas estruturas
em documento/âncora disponível; filtrar antes de converter pelos schemas
atuais de âncora, que exigem texto não vazio. Referências exibem **Documento
excluído — fonte indisponível**, sem conteúdo original.

Trechos já copiados para minutas, fatos, anotações ou registros de conferência
não são reescritos pela exclusão do documento. A confirmação explica esse
limite. Excluir definitivamente o documento não equivale a apagar cada
ocorrência textual do conteúdo em outros materiais do caso.

Caso: excluir transacionalmente seus materiais privados, versões, vínculos,
concessões, recibos e aprovações, respeitando a ordem de dependências.
Conservar marcador mínimo do caso e auditoria de ação, sem título,
descrição, conteúdo dos filhos ou possibilidade de restauração pelo produto.
Não apagar itens de outros casos ou registros financeiros da organização.
Respeitar impedimentos de retenção existentes no subsistema de encerramento
de conta; devolver conflito explicativo quando houver bloqueio aplicável.

Inventariar dados explicitamente associados ao caso, incluindo histórico de
pesquisa e checkpoints que contenham material daquele caso. Não usar o purge
por tenant existente como atalho: ele apagaria casos alheios. Não varrer nem
redigir dados de outros casos em estruturas compartilhadas; resolver associações
duráveis e escopadas antes de permitir a exclusão definitiva.

Backups anteriores podem conter material removido. Adaptar a verificação de
restauração existente para reaplicar bloqueios/redação/exclusões confirmadas
antes de servir um backup restaurado. Registrar intenção de purge de forma
durável fora do estado que o restore pode substituir, no mecanismo operacional
de journal/restore já existente. Não prometer apagamento retroativo de backups.
Adicionar qualquer tabela de lifecycle/intenções ao inventário de encerramento,
purge e verificação de resíduos; manter a retenção operacional necessária ao restore.

Adaptar o journal com namespace e contrato próprios de lifecycle, sem tratar
exclusão de um caso como encerramento de toda a organização. Antes do purge,
persistir intenção PREPARED escopada ao alvo, operação e revisão. A transação
local grava o resultado e a identidade dessa operação; o terminal durável
confirma a conclusão ou o cancelamento após rollback verificado. Não prometer
transação distribuída entre banco e journal. Falha após commit não recupera
o conteúdo nem repete a exclusão: reconciliação finaliza o mesmo registro.
Não declarar conclusão definitiva antes dessa confirmação durável.

Restore com intenção sem terminal permanece fechado para tráfego até
reconciliação; não inferir cancelamento da ausência de um marcador em backup
anterior. Terminais confirmados são reaplicados antes da readiness. A perda
do journal não autoriza servir um backup que possa ressuscitar conteúdo.

## Evidências e entrega

Contratos/testes negativos: matriz de estados, revisão stale, sessão versus
API key/OAuth, usuário sem gestão, outro tenant/caso, purge fora da Lixeira,
corpo malformado e ausência de conteúdo em erros/tombstones.

PostgreSQL isolado e SQLite: migration idempotente/defaults; transições e
restauração do estado anterior; rollback integral; exclusão escopada; referências
e foreign keys; isolamento de registros financeiros; duas ordens de disputa
entre lifecycle, gravação humana, aprovação, leitura da IA e envio/replay.
Barreiras em transações reais, não sleeps usados como prova de ordenação.
Restore de backup anterior não volta a expor caso/documento purgado.

Navegador: menus/filtros e estados vazios, confirmação/cancelamento/Escape,
buffers preservados, conflito entre abas, arquivo inacessível por URL antiga,
vínculo indisponível com revisão bloqueada, histórico preservado enquanto
recuperável, DOCX com pendência e fluxos de restauração/exclusão definitiva.
Verificar acessibilidade, teclado, foco e apresentação móvel.

Build, lint, typecheck, testes proporcionais e CI PostgreSQL devem passar no
SHA proposto e integrado. Publicação exige backup, migration explícita,
candidata com identidade comprovada e promoção. Homologação nativa usa somente
materiais sintéticos e confirma bloqueio no ChatGPT/Claude e ausência de
reativação após restaurar. Exclusão irreversível pela interface exige confirmação
no momento da ação, conforme política do navegador. Não usar casos reais.

## Próxima etapa do workflow

Revisão desta especificação por Boni. Após aprovação escrita, criar plano
executável com tarefas, interfaces, testes e gates e selecionar o método de
execução, conforme a skill `superpowers:brainstorming`. A aprovação da proposta
de produto permitiu este documento; não é registrada como aprovação de um
plano que ainda não existe.
