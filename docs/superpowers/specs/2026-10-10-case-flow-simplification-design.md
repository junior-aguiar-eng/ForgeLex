# Simplificação do ciclo documental do caso

Aprovada por Boni em 10/10/2026. Implementação local na branch `codex/case-flow-simplification`; publicação permanece fora deste escopo.

## Objetivo e evidência

Concluir documento → análise → conferência → rascunho → aprovação → DOCX com menos navegação, cliques mecânicos e controles simultâneos, preservando decisões e rastreabilidade. Boni permanece o único avaliador e aprovador humano, conforme `AGENTS.md`.

Base inspecionada: checkout SDK, branch `codex/case-document-analysis`, HEAD `101ee331fc621ebf38fd536a549c38b0f9340d12`, árvore limpa antes destes documentos. A simulação local usou dados fictícios, retorno de IA por MCP simulado e aprovação pela API. Não demonstrou execução real em Claude/ChatGPT nem aprovação completa pela interface.

Problemas confirmados no código e na simulação:

- `MatterWorkspaceScreen`: formulários de cadastro e ferramentas de várias etapas ocupam a mesma página; os atalhos de rascunho/revisão não transportam explicitamente todos os identificadores.
- `CaseAiAccessPanel`: conexão, catálogo, prévia, análise, envio de texto e permissões coexistem no diálogo; análise e recebimento de rascunhos são permissões independentes.
- `CaseAnalysisPanel`: lista e conferência repetem atualização; todas as propostas não decididas aparecem como textareas; seleção seguida de incorporação é necessária até para um item.
- `DraftStudioScreen`: mapa de teses e vínculos de cada seção competem com a edição; salvar, conferir, salvar e conferir, encaminhar e baixar coexistem. O token emitido fica somente no estado React.
- `ReviewPanel`: cada verificação gera um cartão e botão, mesmo quando confirmou apenas a localização de um documento.
- `OperationsClient.resolveReview`: rascunhos são rejeitados incondicionalmente com `APPROVAL_TOKEN_REQUIRED`; a fila apresenta uma ação que não consegue executar.

## Alternativas e decisão proposta

1. Apenas recolher formulários: menor alteração, mas mantém a fragmentação e a aprovação quebrada.
2. Conduzir a tarefa nas telas existentes, com navegação contextual, ações por estado e painéis sob demanda: recomendada; aproveita contratos, leitor, revisão e editor existentes.
3. Criar um editor único e substituir as telas: maior refatoração e risco; não necessário neste incremento.

Adotar a alternativa 2. As três etapas são navegação flexível, não um assistente obrigatório que impeça voltar ou trabalhar manualmente.

## Experiência proposta

| Etapa | Conteúdo principal | Ação principal conforme o estado |
| --- | --- | --- |
| Documentos e análise | Documentos do caso, objetivo e resumo de acesso | Adicionar documento; com material disponível, Preparar análise |
| Conferência | Proposta, classificação, trecho de origem e decisão | Conferir análise; dentro dela, incorporar o item ou seleção |
| Texto e conclusão | Texto por seção, pendências e versão | Salvar e conferir; depois, Aprovar esta versão; aprovada, Baixar DOCX |

Um cabeçalho contextual identifica caso, etapa e pendências. Links permitem retornar a documentos/conferência/texto mantendo `matterId`, `draftId` e, quando aplicável, `analysisId`. URLs atuais permanecem acessíveis e voltar/avançar do navegador funciona. A posição no fluxo deriva dos dados disponíveis; não é persistida como uma conclusão jurídica.

### Documentos e autorização

- Um ponto de entrada para análise. “Usar este caso na IA” continua em Acesso da IA como opção geral, sem competir com a tarefa documental.
- Formulários de documento/fato/prova/evento/questão aparecem ao acionar Adicionar no conjunto correspondente; listagens e contagens permanecem visíveis. Cadastro manual continua disponível.
- Acesso da IA apresenta conexão, documentos/versões, objetivo e duas opções explícitas: receber análises e receber textos. Nenhuma permissão de escrita começa marcada automaticamente.
- Uma conexão ativa pode aparecer selecionada para facilitar o preenchimento; isso não concede acesso. Conexão ausente/revogada leva à configuração existente e volta ao mesmo caso.
- A prévia completa é carregada com a seleção, sem botão extra para iniciá-la. Consumir todas as páginas antes de permitir autorização, como exige o fluxo atual; resumo com todos os títulos/versões e permissões permanece visível e trechos podem ser expandidos. Qualquer alteração invalida a prévia anterior.
- A confirmação “Autorizar e copiar instrução” persiste a permissão e tenta copiar a instrução. Falha de clipboard oferece Copiar novamente sem duplicar a concessão. Não acionar host externo automaticamente.
- Explicar a passagem real: “Cole esta instrução na conversa da sua IA. O resultado aparecerá aqui quando ela enviar.” O ForgeLex não executa o modelo e não deve simular processamento interno.
- Resumo persistente de acesso e comando Revogar acessíveis em um nível, fora de um menu de detalhes técnicos.

### Conferência das propostas

- Ao receber uma análise, mostrar contagem de pendências e um único acesso à conferência. Atualizar ao retornar/focar a página; enquanto aguarda resultado, consultar a lista a cada 30 segundos somente com a tela visível. Pausar após 10 minutos e oferecer Tentar novamente. Parar ao sair, revogar ou encontrar erro de autorização. Não apresentar ausência de resultado como falha da IA nem como conclusão.
- Não substituir análise aberta, seleção ou texto editado durante atualização; notificar chegada de outra análise.
- Texto em leitura por padrão; Editar abre o campo apenas da proposta escolhida. Classificação e citação literal ficam visíveis. O leitor completo abre na versão/âncora exata sem perder a edição.
- Incorporar e Descartar disponíveis diretamente no item. Ao selecionar múltiplos itens, uma barra contextual oferece as mesmas operações em lote; não duplicar barra por item.
- Explicitar dependência entre prova e fato. Se o fato ainda não foi incorporado, oferecer selecionar ambos com confirmação da seleção, sem adoção silenciosa. Se foi descartado, explicar o impedimento e manter os itens.
- Após cada decisão, atualizar contador e manter a posição. Decididos saem da lista de pendências e ficam em Conferidos; original, texto adotado e histórico permanecem acessíveis.
- Encerramento mostra o que entrou no caso e oferece Ir para o texto. Não adotar propostas restantes automaticamente.

### Editor, vínculos e revisão

- Texto ocupa o centro; mapa de teses, criação de vínculos, citações e histórico ficam em painéis nomeados. Não substituir todos por um menu genérico “Mais”.
- Mostrar em cada seção resumo dos vínculos existentes; Gerenciar fontes e vínculos abre ferramentas completas somente para a seção ativa. Preservar vínculos recebidos e os salvos ao editar, trocar de seção e criar versões.
- Incorporação ao caso não vincula todos os fatos a todas as seções. Sugestões de novos vínculos requerem escolha explícita; preservar os existentes evita seleção repetida.
- Sem autosave neste incremento. Salvar e conferir encadeia o salvamento explícito de nova versão e a revisão dessa mesma versão. Se só a revisão falhar, indicar “Versão salva; conferência não concluída” e repetir apenas a revisão.
- Revisão mostra primeiro bloqueios e pontos de atenção, agrupados por problema, com ligação à seção/fonte. Verificações bem-sucedidas ficam em “Verificações concluídas”, sem perder detalhes, quantidades ou referências individuais.
- Texto fixo: “Conferência automática concluída: X pontos de atenção”. Se houver bloqueio, identificá-lo separadamente. Localização de trecho não equivale a veracidade, suficiência ou pertinência jurídica.

### Aprovação no editor

- Aprovar esta versão abre confirmação com título, número/data da versão, síntese de alertas e alcance da decisão. Hash fica nos detalhes de integridade. A confirmação registra a decisão explícita do usuário autenticado; não exige segundo revisor.
- Depois da confirmação, emitir token e resolver pela API existente, sem expor token na UI, URL, clipboard, logs ou armazenamento persistente do navegador. Não utilizar OAuth/MCP para aprovação em nome do usuário.
- Falha entre emissão e resolução ou recarga deve permitir retomar a mesma versão. Implementar reemissão autenticada em sessão para a solicitação pendente: rotacionar token não utilizado, invalidar o anterior e auditar, sem criar versão fictícia. Revalidar tenant, usuário autorizado, caso ativo, versão atual, revisão atual sem bloqueios e contexto.
- A fila de revisão passa a oferecer Abrir para aprovar, levando ao editor com o caso/rascunho e a versão pendente identificados. Não apresentar aprovação direta de DRAFT enquanto não existir contrato seguro para isso. Memos conservam o fluxo próprio.
- Versão pendente antiga nunca redireciona silenciosamente a aprovação para uma versão nova. Mostrar “Esta solicitação é da versão N; a versão atual é M” e abrir o texto atual para nova conferência. Histórico antigo permanece histórico.
- Depois de aprovada, ação principal Baixar DOCX. Uma edição posterior cria nova versão que requer conferência/aprovação próprias; não herda aprovação.
- Download de minuta continua permitido como ação secundária contextual com aviso de versão/pendências. Edição não salva nunca entra silenciosamente no DOCX.

## Regras de simplicidade e qualidade

- Uma ação primária destacada por área de trabalho/estado; no máximo duas secundárias na barra principal, sem contar navegação, cancelamento e ações da proposta/seção ativa.
- Funções necessárias ficam a no máximo uma abertura de painel contextual. Permissões, revogação, bloqueios, conflitos e edições não salvas não ficam escondidos.
- Ícones têm nome acessível e rótulo claro; nenhuma função depende de hover. Teclado, foco de retorno, anúncios de resultado e leitor acessíveis em desktop e mobile.
- Estados indisponível, vazio, carregando, conflito e sucesso são distintos. Sucesso técnico não aprova conteúdo jurídico.
- Evitar cobranças novas e preservar tarifas existentes. Retomar/listar resultados não deve pesquisar jurisprudência nem usar modelo externo.
- Sem troca de provedor, novas bibliotecas de UI, redesign global, autosave, nova geração interna de IA ou migração de documentos. Manter contratos REST/MCP públicos; a única extensão prevista é recuperar autorização de aprovação.

## Critérios de aceitação e medição

Comparar antes/depois no mesmo roteiro sintético da demonstração, separando: primeira conexão, conexão já configurada, decisões sobre propostas e trabalho externo no host. Registrar manualmente cliques mecânicos, trocas de tela, ações simultâneas por estado e tempo da tarefa; sem telemetria de usuário.

Metas de projeto, ainda não medidas: reduzir pelo menos 40% dos cliques mecânicos dentro do ForgeLex no cenário com conexão configurada e pelo menos 50% dos botões simultâneos na visão inicial do editor; nenhuma navegação para a fila global é necessária para aprovar. Não contar menos decisões sobre fontes como ganho de produtividade. Se a meta conflitar com segurança ou clareza, preservar a decisão e revisar a meta com Boni.

Obrigatório: roteiro completo por UI, incluindo aprovação e download, sem CLI/API auxiliar do operador; MCP pode ser fixture identificada no teste. Pelo menos uma homologação separada em host real será necessária para alegar fluxo real externo. Arquivamento/lixeira, revogação, conflito, recarga e edição não salva devem preservar controles e conteúdo.

## Entrega e avaliação

Implementar em incrementos conforme o plano associado, com prévia local e registros dos cenários. Boni avalia a experiência. Commit, push, integração, migration remota e deploy seguem o escopo que ele efetivamente autorizar. Este documento não altera aprovação anterior nem certifica publicação.
