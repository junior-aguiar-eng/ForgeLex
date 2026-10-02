# Fase 7 — protocolo de estudo com cinco usuários jurídicos

Estado atualizado em 02/10/2026: **roteiro externo opcional, fora do gate da fase 7**. Boni informou que realizou pessoalmente a validação. O critério da fase foi alterado para aceitar essa validação individual. Não foram informados duração, notas por item, navegador ou versão do teste pessoal; não atribuir a ele os resultados deste protocolo de cinco participantes.

## Participantes e ambiente

Selecionar cinco pessoas com formação ou atuação jurídica, sem participação no desenvolvimento do ForgeLex. Registrar apenas códigos P01–P05 e perfil amplo (ex.: advocacia, assessoramento, estudante graduado); nomes, e-mails, dados de clientes e processos privados ficam fora do repositório. Não enviar convites sem autorização específica de Boni.

Usar a versão publicada em `https://nexojuris.ia.br/`. Antes de cada sessão, registrar data local/fuso, navegador, dispositivo, SHA runtime e revisão Cloud Run observados naquele momento. Preferir contas de teste individuais; não compartilhar a conta real ou credencial de Boni. Não comprar créditos, conectar hosts, criar chaves nem encerrar contas durante esta tarefa de compreensão.

## Instrução entregue ao participante

“Observe o ForgeLex por até dois minutos. Você pode navegar pelas páginas disponíveis. Dentro desse prazo, explique com suas palavras para que ele serve, como você o conectaria ao seu serviço de IA, qual ação consome créditos e onde conferiria a fonte de uma informação jurídica.”

Iniciar o cronômetro ao carregar a página inicial. Não orientar, apontar botões, fornecer glossário nem mostrar o gabarito abaixo. Registrar a sequência de páginas e pedidos de ajuda. O prazo de 120 segundos inclui exploração e as quatro respostas. Ao atingir esse limite, interromper a tarefa e registrar como não demonstrados os itens ainda sem resposta; a entrevista posterior serve apenas para diagnóstico, sem converter esses itens em aprovação. Dificuldades de carregamento invalidam a sessão técnica, não a compreensão do participante; registrar e repetir após resolução.

## Rubrica exclusiva do moderador

| Item | Evidência de compreensão sem ajuda |
| --- | --- |
| Finalidade | Organiza o trabalho jurídico, casos e evidências, pesquisa STJ com proveniência e rascunhos sujeitos à revisão humana. Não atribui ao produto decisão ou protocolo automático. |
| Conexão | Localiza guia/central de conexão e reconhece que o host e o plano precisam oferecer MCP; conexão não é necessária para usar o espaço ForgeLex. Não precisa memorizar a configuração técnica. |
| Cobrança | Identifica a pesquisa jurisprudencial válida como faturável, inclusive sem resultados; abrir/verificar autoridade não têm cobrança própria no contrato vigente. Distingue créditos ForgeLex de assinatura/tokens do host. |
| Fonte | Indica abrir o resultado/autoridade e conferir origem, referência oficial, proveniência ou estado de verificação antes de utilizar a informação. |

Para cada item marcar `compreendeu`, `parcial` ou `não compreendeu`, com fala breve anonimizada. Uma resposta só é `compreendeu` quando satisfaz o sentido da rubrica sem pistas. Não transformar respostas parciais em aprovação. Registrar separadamente o tempo de exploração e o tempo da entrevista; o limite de dois minutos abrange navegação e respostas válidas para o gate.

## Registro e encerramento

Preencher [a ficha CSV](2026-10-01-phase7-user-study-results.csv), mantendo a versão em branco até sessões reais. Registrar dificuldades observáveis e sua etapa, sem inferir causa. Depois das cinco sessões, consolidar cada item (n/5), tempos, pedidos de ajuda, defeitos demonstrados e limitações da amostra. Cinco participantes não sustentam generalização estatística.

Se o estudo externo opcional vier a ser realizado, avaliar os quatro itens no recorte previsto e registrar dificuldades demonstradas. Ele não impede o encerramento da fase 7 no critério revisado por Boni. OAuth/ChatGPT real e acessibilidade mantêm seus gates próprios.
