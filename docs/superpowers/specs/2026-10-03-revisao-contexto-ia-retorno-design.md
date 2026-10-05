# Revisão, contexto na IA e retorno da minuta

Data: 03/10/2026.
Estado: desenho aprovado por Boni em 03/10/2026. Frente 1 implementada e
validada localmente; frentes 2 e 3 ainda não implementadas.
Base examinada: worktree `document-io/SDK`, branch
`codex/datajud-workspace-publication`, HEAD
`a74eda8ba539eb125a6cc5a950cd745ab09fc384`.

## 1. Direção aprovada na conversa

Evoluir o ForgeLex em três frentes sequenciais: conferir o rascunho,
disponibilizar o contexto autorizado do caso à IA do cliente e receber a
produção de volta como uma nova versão. PDF textual e exportação DOCX já
integram a base e não serão reimplementados.

Requisito expresso de Boni: facilidade de uso, ambiente limpo e linguagem
sem termos técnicos, preservando as ferramentas essenciais. A simplicidade
será obtida pela organização das ações e apresentação progressiva de
detalhes. Fontes, provas, permissões e histórico continuarão acessíveis.

A conversa e a geração ocorrem no ChatGPT ou Claude do cliente, pelo MCP
existente. O ForgeLex fornece dados autorizados e recebe o resultado. Esta
proposta não acrescenta geração dentro do site por API de modelo nem pede
uma chave de OpenAI ou Anthropic ao cliente. Disponibilidade e configuração
dos hosts devem ser verificadas ao implementar a segunda frente.

## 2. Regras de experiência compartilhadas

- Preservar as áreas Casos, Rascunhos e Conectar IA, com o visual atual.
- Mostrar uma ação principal para cada etapa. Histórico, fontes e ajustes
  ficam em áreas secundárias identificáveis; ações críticas não dependem
  de menus obscuros, hover ou descoberta acidental.
- Manter o caso, a minuta e a versão visíveis durante a conferência.
- Mensagens devem dizer o que aconteceu e como continuar. Códigos internos,
  identificadores e detalhes de protocolo ficam fora do fluxo jurídico.
- Estados importantes aparecem em texto, sem depender apenas de cor.
- Preservar navegação por teclado, foco, alvos de toque, leitura em celular
  e expansão do texto. Detalhes recolhidos devem ter controles acessíveis.
- Não descartar alterações não salvas ao abrir uma fonte, mudar uma versão
  ou receber um resultado. Pedir uma escolha somente quando houver risco
  concreto de perda ou alteração de permissão.
- Conferência humana pode ser feita pelo próprio autor. Não introduzir
  obrigatoriedade de segundo revisor.

Vocabulário de interface:

| Conceito interno | Rótulo do fluxo jurídico |
| --- | --- |
| Citation anchor | Referência |
| Authority | Julgado ou fonte jurídica, conforme o conteúdo |
| Fact support | Provas vinculadas ao fato |
| Adversarial structural checks | Conferir estrutura |
| Review finding | Ponto para conferir |
| MCP/OAuth/scopes | Conectar IA / Permitir acesso / Permissões |
| Idempotency / optimistic conflict | Resultado já recebido / Existe uma versão mais recente |

Termos jurídicos úteis permanecem: fatos, provas, teses, julgados, minuta e
conferência. A documentação para desenvolvedores mantém os termos técnicos.

## 3. Frente 1 — Conferir e corrigir o rascunho

### Jornada

O usuário abre a minuta, salva as alterações e escolhe **Conferir
rascunho**. Se houver alterações não salvas, a tela explica que a
conferência examina a versão registrada e oferece **Salvar e conferir**.
Salvar e conferir são operações sequenciais: falha ao salvar impede a
conferência daquele conteúdo e preserva o formulário.

A tela apresenta um resumo curto, por exemplo: “2 pontos para conferir”.
Ao abrir um ponto, o usuário vê a seção, a referência ou o fato relacionado,
a explicação e a ação apropriada: **Ver fonte**, **Ver documento** ou
**Vincular prova**. Nenhuma dessas ações deve apagar edições da minuta.

### O que será conferido

1. Referências jurídicas: existência do registro acessível, consistência
   dos metadados, vínculo à seção e proveniência disponível.
2. Fatos e provas: existência e pertencimento ao caso, relações cadastradas
   e cobertura disponível, expondo suporte parcial ou contraditório.
3. Estrutura: seções vazias e vínculos ausentes, com rótulos que representem
   a checagem realmente executada.

A confirmação humana e o resultado automático são registros distintos.
A marcação humana não transforma uma referência em verificada pelo
servidor. Um vínculo cadastrado não demonstra, sozinho, a verdade de um
fato nem a pertinência jurídica de um precedente.

Reutilizar `ResearchService.verifyAuthority` com o provider real configurado.
No caminho persistente atual, a verificação consulta o corpus do ForgeLex;
não é uma consulta direta ao portal do tribunal em cada execução. Registrar
a fonte, o horário da conferência, a captura/versão disponível e o alcance
do resultado. A interface deve dizer “Localizada no acervo” quando esse for
o caminho utilizado. `NOT_FOUND` não prova inexistência do julgado.

Resultados propostos: **Referência localizada**, **Dados divergentes**,
**Não localizada no acervo**, **Fonte temporariamente indisponível** e
**Conferida por você**. Não produzir um selo geral de correção jurídica.

### Consistência e arquitetura

Fixar o identificador e o hash da versão no início da execução; as três
checagens examinam o mesmo conteúdo. A tela inicial exibe somente os
resultados da execução vigente daquela versão. Histórico fica separado.

Registrar execuções de revisão e seus resultados, incluindo checagens sem
apontamentos, incompletas ou com falha. Cada execução completa possui um
identificador único. Preservar o histórico e usar a última execução completa
da versão para representar o resultado vigente. Uma execução parcial não
pode substituir silenciosamente um resultado completo ou parecer aprovada.
Uma nova execução não duplica os apontamentos na apresentação vigente.

Alterar a minuta cria nova versão com conferência pendente. A aprovação
aplica-se à versão específica e considera sua revisão vigente, sem usar
achados antigos nem a mera ausência de achados como prova de conferência.
Pendências não devem impedir o download do DOCX para trabalho; o arquivo
mantém identificação da versão e aviso de revisão quando cabível.

Reutilizar `DraftReviewService`, `DraftingService`, `DraftRepository`,
`ResearchService`, os serviços de fatos/provas e as rotas existentes.
Estender contratos e persistência na camada atual, com migrations quando
necessárias; manter compatibilidade com SQLite e PostgreSQL.

### Aceite da primeira frente

- Marcar uma citação manualmente não altera o resultado automático.
- Referência divergente, ausente e indisponibilidade têm resultados distintos.
- Conferir duas vezes não duplica os pontos vigentes; versões antigas não
  aparecem como pendências da versão atual.
- Cada ponto abre sua seção ou fonte sem descartar alterações.
- Uma versão nova fica pendente; nenhuma aprovação usa outra versão.
- Teclado, celular, DOCX e os fluxos atuais de casos continuam utilizáveis.

## 4. Frente 2 — Usar o caso na IA do cliente

### Jornada

Dentro do caso, **Usar este caso na IA** leva à seleção de ChatGPT ou
Claude. Reutilizar Conectar IA para a configuração e a conexão existentes.
O site não promete abrir uma conversa preenchida ou executar comandos no
host quando esse recurso não estiver comprovado.

O usuário escolhe os documentos e os demais elementos do caso que a IA
poderá consultar. Uma prévia mostra exatamente o material incluído.
**Permitir acesso** confirma a seleção. **Copiar instrução** fornece um
pedido inicial simples, que o cliente usa na conversa com a IA.

No caso, **Permissões da IA** permite consultar e revogar o acesso. A
mensagem de revogação informa: “Impede novas consultas. Conteúdo já enviado
à IA pode continuar na conversa.” Compartilhamento não inclui documentos
adicionados depois sem atualização explícita da seleção.

### Contrato e arquitetura

OAuth autentica a conexão; não autoriza automaticamente todos os casos.
Criar uma autorização persistida e revogável por caso, com seleção explícita
de documentos, fatos, provas, teses e fontes, vinculada ao usuário autenticado
e à identidade de conexão que o servidor possa comprovar. Nunca confiar em
nome de host, usuário ou tenant declarado pelo modelo.

As ferramentas externas devem listar somente casos autorizados e consultar
o material permitido. Validar a autorização em todas as chamadas, inclusive
acesso a trechos e relações indiretas; não revelar itens excluídos por meio
de uma prova ou tese vinculada. Conteúdo de documento é dado, não instrução
de execução. Limitar tamanho, paginar documentos extensos e devolver trechos
com suas referências. Leitura não altera o caso.

Reutilizar o gateway MCP, a autenticação, os repositories e os serviços do
caso. Ampliar o pacote externo, os contratos de ferramentas, a política de
operações e o contexto de execução; a simples inclusão na allowlist não
implementa autorização. Não criar outro servidor ou banco de casos.

Aceite: isolamento entre contas/casos, seleção respeitada em todas as
relações, revogação efetiva, leitura sem escrita e ensaio nos hosts reais
solicitados com dados de teste autorizados. Validação em um host não é
atribuída ao outro.

## 5. Frente 3 — Receber e revisar a minuta produzida

### Jornada

A autorização de leitura da frente 2 não concede escrita. O cliente pode
permitir separadamente **Salvar rascunhos neste caso**. A IA envia uma
produção que aparece em Rascunhos como **Recebida da IA — revisão pendente**.
A operação cria uma versão preservando o histórico; nunca aprova a minuta.

**Comparar versões** mostra mudanças por seção. O usuário pode conferir,
editar e salvar sua versão. Versões anteriores continuam consultáveis.
**Baixar DOCX** exporta a versão persistida selecionada.

Se o usuário já salvou uma versão mais recente que a utilizada pelo host,
o servidor recusa o avanço automático e retorna conflito, preservando a
versão atual. A conversa pode então obter a versão vigente e reapresentar
o texto; nenhuma proposta é aplicada silenciosamente sobre trabalho novo.

### Contrato e arquitetura

Receber título, seções, vínculos, referências, versão de base e identificador
da operação. Validar todos os vínculos contra o caso e a autorização.
Referências novas sem validação permanecem pendentes; o host não pode
atribuir confirmação humana ou automática por meio de um booleano.

Usar idempotência persistida: repetir a mesma operação e conteúdo retorna
a mesma versão; reutilizar o identificador com conteúdo diferente falha.
Controle de concorrência e gravação da versão devem ser atômicos. Identificar
a origem como produção externa, sem fingir identidade de host ou modelo
quando ela não puder ser comprovada pela conexão.

Reutilizar o versionamento, a revisão da frente 1 e a exportação atual.
Adicionar somente a ferramenta externa necessária e a permissão de escrita.
A comparação e a leitura de versão antiga devem usar versões persistidas;
não criar outro armazenamento de minutas.

Aceite: recebimento, repetição sem duplicação, conflito de versão, bloqueio
de referências de outro caso, escrita revogada, comparação e DOCX da versão
correta. Não inclui publicação, envio processual ou efeito externo da peça.

## 6. Sequência, validação e limites

Executar e validar a frente 1 antes de desenvolver a frente 2; desenvolver
a escrita externa somente depois da leitura autorizada. Cada frente recebe
um plano de implementação proporcional antes de alterar código.

Usar testes focados de serviço/persistência, API e navegador; verificar
fluxos de correção, teclado e telas estreitas com dados descartáveis.
Sucesso local, integração, publicação e uso no host real são evidências
distintas. Registrar somente verificações efetivamente realizadas.

Preservar a política atual de pesquisa e custos. Novas operações de contexto
e recebimento não devem herdar cobrança da busca jurisprudencial. Definir
seus contratos explicitamente na política existente antes de expô-las.
Consumo do ChatGPT/Claude continua sujeito à conta e às condições do host.

Ficam para avaliação posterior: OCR, retenção do PDF original, modelos
forenses de DOCX, análise semântica por IA dentro do site e novos tribunais.
O acompanhamento operacional vigente continua sem bloquear evolução por
prazo de calendário.

## 7. Evidências consultadas

- `docs/product/document-io.md` e registro de publicação de 02/10/2026.
- `packages/legal-tools/src/review/review-service.ts`: marcações e vínculos,
  checagens estruturais e persistência dos achados.
- `packages/legal-tools/src/research/research-service.ts`: alcance da
  verificação no caminho de corpus persistente.
- `packages/legal-tools/src/drafting/draft-service.ts` e
  `packages/persistence/src/repositories/draft-repository.ts`: versões,
  carregamento dos achados e aprovação.
- `apps/web/src/screens/DraftStudioScreen.tsx`: edição, referências,
  revisão, histórico e exportação.
- `packages/mcp-server/src/external-tool-pack.ts` e `mcp-handler.ts`:
  superfície externa e contexto de execução existentes.
- `apps/web/src/navigation/routes.ts`: áreas e rotas preservadas.

Este documento registra o desenho proposto. Não certifica implementação,
testes, migração, commit, integração ou publicação dessas três frentes.
