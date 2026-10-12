# Leitor MCP e pesquisas salvas — ensaios reais de 11 e 12/10/2026

Este registro complementa a [publicação de 11/10](2026-10-11-saved-research-publication.md), já integrada pelas PRs #68/#69 e servida pela revisão `forgelex-api-prod-saved-5be473d0`. Em 12/10, a consulta ao Cloud Run confirmou a mesma revisão recebendo 100% do tráfego. Boni autorizou publicar estes registros após ser informado de que estavam somente locais. Não há alteração de código, nova migração ou novo deploy neste incremento.

## ChatGPT e site

Ensaio concluído em 12/10/2026 às 01:53:32 UTC, ainda 11/10 às 22:53:32 em Maceió. Boni autorizou gerenciamento somente para ChatGPT e uma pesquisa STJ sobre “juros capitalizados”, ao custo exibido de R$ 0,20, com salvamento. Após atualização do catálogo e conversa nova, 14 ferramentas foram anunciadas. Antes da permissão específica, a coleção recusava corretamente o acesso.

A única pesquisa executada neste ensaio retornou 20 decisões. O salvamento no site ocupou uma vaga; recarregar e reabrir conservou critérios, data original, textos e ordem. No ChatGPT, listagem e reabertura mostraram as mesmas 20 decisões. Salvar a mesma operação pelo leitor conservou o mesmo registro e data de salvamento, permanecendo 1 de 6. A comparação final das respostas confirmou resultados completos e ordem idênticos. Não houve uma segunda pesquisa faturável nesse ensaio.

Leitor embutido, painel lateral e tela cheia foram observados. Expandir a partir do leitor embutido abriu o painel; a ampliação do painel usa o controle próprio do ChatGPT. Anterior/próxima e Origem e fonte funcionaram, com julgamento/publicação separados. A cópia automática falhou; o campo manual permitiu copiar 1.356 caracteres, incluindo identificação, ementa e fonte. Excluir mostrou a confirmação identificando a pesquisa; Cancelar conservou o item, sem executar exclusão. Boni aprovou a apresentação real: “ficou perfeito no chatgpt”.

## Claude Web e Desktop

Boni relatou o leitor funcionando no Web e apresentou captura do Desktop com decisão, relatoria, datas, ementa e expansão. No seu teste Desktop, precisou pedir expressamente para abrir o painel. Isso comprova exibição, sem atribuir a esse teste outras ações da coleção.

Ao investigar o aviso de gerenciamento no Claude Web, o site mostrava três conexões Claude, todas com a permissão específica desligada; somente ChatGPT estava habilitado. A autorização geral de conexão era distinta da autorização de coleção. A conexão Claude mais recente tinha autorização em 12/10 às 11:27:16, no fuso local.

Durante a investigação, o agente acionou essa permissão antes da resposta de Boni, imediatamente a desligou, verificou a restauração e comunicou o erro. Após a resposta expressa “Autorizar somente o Claude mais recente”, a permissão foi habilitada dentro desse escopo. Recarregar o site confirmou Claude recente e ChatGPT habilitados, com as duas conexões Claude anteriores desligadas.

No leitor Claude Web, Pesquisas salvas retornou 1 de 6; Abrir apresentou as 20 decisões conservadas, com data original de pesquisa 11/10 às 22:21:02 e primeira decisão 1457691. Expandir exibiu tela cheia. O painel inicial conservava o estado de salvamento e o aviso recebidos antes da permissão; a listagem já estava autorizada, e reabrir pela coleção removeu o aviso. Nenhuma pesquisa faturável, escrita ou exclusão foi executada nessa investigação. A reabertura comprova o acesso atual da conexão, sem dispensar as verificações do servidor em ações posteriores.

## Evidência e limites

Os recibos locais de ChatGPT e Claude e as capturas foram conferidos antes desta publicação. A captura de Boni comprova o Desktop; a interação direta no navegador comprova a coleção no Claude Web. [Prova sanitizada do ensaio ChatGPT](2026-10-12-chatgpt-live-validation-proof.json), encerrada antes da autorização posterior do Claude: seus campos sobre Claude registram aquele momento.

Capturas integrais e conversas permanecem locais para não publicar a barra lateral pessoal ou identificadores de conversas. Foram conferidas as capturas `chatgpt-reader-proof.png`, `chatgpt-live-save-idempotent.png`, a captura Desktop fornecida por Boni e `claude-saved-reader-authorized.png`. Este recibo não valida juridicamente as decisões ou explicações da IA.

Falta executar salvamento pelo Claude e operações da coleção no Claude Desktop. Não foram reproduzidos na conta real preenchimento das seis vagas, sétimo bloqueado, exclusão confirmada, revogação da conexão, expiração do histórico ou encerramento/restauração da conta. Os testes automatizados anteriores continuam como evidência distinta desses ensaios reais. Cobrança e pagamentos de outros usos não foram auditados por este incremento; R$ 0,20 refere-se somente à pesquisa de teste autorizada descrita acima.
