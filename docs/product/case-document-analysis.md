# Analisar documentos do caso

Escopo aprovado por Boni em 10/10/2026. O ForgeLex oferece contexto autorizado
e recebe propostas estruturadas pelo MCP. ChatGPT, Claude ou outro host fornece
o modelo e executa a leitura/análise; não existe execução de LLM no ForgeLex.

## Procedimento

No caso, escolha **Analisar documentos do caso**, conexão, versões dos documentos
e objetivo. Habilite **Permitir que esta IA envie análises do caso**, confira a
prévia preparada automaticamente e escolha **Autorizar e copiar instrução**.
Cole a instrução na conversa com sua IA. Se a cópia falhar, **Copiar instrução**
repete apenas a cópia; a permissão já salva continua identificada.

A IA usa `case.get_context` e `case.read_item` para consultar a seleção, inclusive
as continuações. Ela entrega a análise com `case.save_analysis`. O recebimento
é gratuito; pesquisas jurisprudenciais conservam a política comercial vigente.

Em **Análises dos documentos**, a lista se atualiza ao retornar à janela e
a cada 30 segundos enquanto visível, por até dez minutos. Revogação local
ou falha interrompe essa espera; **Tentar novamente** permite retomá-la.
A atualização da lista não substitui a proposta aberta nem sua edição. Cada
proposta mostra classificação, citação literal e acesso à versão/documento de
origem. Use **Editar** quando necessário, selecione itens e incorpore, ou
descarte propostas. Os itens já conferidos ficam em **Conferidos e histórico**.
Para incorporar uma prova relacionada a um fato proposto, incorpore esse fato
antes ou na mesma seleção. Itens incorporados alimentam os cadastros do caso;
lacunas viram questões abertas identificadas como lacunas.

O recebimento não confirma veracidade, autenticidade, suficiência probatória,
pertinência jurídica ou datas processuais. A IA pode errar mesmo citando um
trecho existente. A classificação e os vínculos também precisam de conferência.
Fatos incorporados continuam alegados (`ASSERTED`) ou controvertidos (`DISPUTED`),
sem confirmação automática. O único aprovador humano do projeto é Boni.

## Texto, conferência e aprovação

As etapas **Documentos e análise → Conferência → Texto e conclusão** conservam
o caso e a análise escolhida. O editor mostra uma ação principal conforme o
estado: criar, salvar e conferir, conferir, aprovar ou baixar. **Salvar e
exportar** mantém acesso a salvar sem conferir e baixar uma minuta. Fontes,
vínculos, teses e histórico ficam em painéis nomeados; avisos aparecem primeiro.

**Aprovar esta versão** abre confirmação com título, número da versão e avisos.
A operação usa a sessão autenticada. O token não é exibido, copiado ou guardado
no navegador. Após falha/recarga, a mesma solicitação pendente pode ser retomada:
o token anterior é invalidado, sem criar outra versão nem prolongar validade.
Revisão/contexto desatualizados e versão substituída impedem a recuperação.
A exportação utiliza apenas a versão salva. Edição não salva e proposta em
edição exigem confirmação antes de navegação ou troca de caso.

## Contratos e limites

- Permissão `analysisPermission` independente da leitura e do envio de rascunhos:
  desabilitada por padrão; ativação exige documentos e objetivo explícitos.
- Recebimento exige OAuth ativo e revalidado, mesmo usuário/tenant/conexão,
  `expectedGrantRevision` e objetivo iguais aos autorizados.
- Propostas `FACT`, `EVIDENCE`, `TIMELINE`, `ISSUE`, `GAP`: até 100 por envio,
  10 fontes por proposta; texto até 4.000 caracteres; objetivo até 2.000.
- Fonte: `documentId`, `versionId`, `anchorId`, `quote` literal e relação
  `SUPPORTS`, `CONTRADICTS` ou `CONTEXT`. Existência e conteúdo do trecho são
  conferidos; significado jurídico ou probatório não é validado automaticamente.
- Até 512 KiB por envio MCP; recibo compacto. Retry com mesma chave e payload
  retorna o recibo; payload divergente conflita. Permissão revogada bloqueia
  novos envios e replays, sem apagar resultados já recebidos no próprio caso.
- API de conferência: `GET /api/v2/matters/:matterId/analyses`, `GET .../:id`,
  `POST .../:id/decisions`, somente em sessão; escrita exige `matter:write`.
  A lista apresenta as 50 análises mais recentes do caso; não há paginação
  neste incremento. Os recibos anteriores continuam armazenados.
- Decisões com `expectedRevision`, lote atômico, sem duplicar itens já decididos;
  proposta original preservada, texto adotado, autor, data e destino registrados.
- Fonte indisponível bloqueia incorporação. Versões posteriores não substituem
  a versão citada. Análises seguem exclusão do caso e encerramento da conta.
  Excluir apenas um documento conserva os artefatos derivados do caso conforme
  a política existente; o leitor deixa de mostrar a origem excluída.

## Publicação

Migration incremental `persistence-0031-case-document-analysis`. Implementação
local não ativa a capacidade em produção. Migration remota e deploy exigem
escopo operacional próprio. Nenhuma tarifa ou fonte jurisprudencial foi alterada.
