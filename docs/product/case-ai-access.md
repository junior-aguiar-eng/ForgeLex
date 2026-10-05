# Usar material do caso no ChatGPT ou Claude

Em Casos, abra o caso e escolha **Usar este caso na IA**. Escolha onde vai usar a IA e o aplicativo que você já autorizou em Conectar IA. Os nomes dos aplicativos são rótulos informados por eles; confira a conexão concedida na sua conta. Não há aplicativo ou material pré-selecionado.

Marque documentos, fatos, provas, teses e fontes. Confira **Ver prévia**, inclusive as páginas seguintes, e **Permitir acesso**. Copie a instrução inicial e cole na sua conversa. A seleção de ChatGPT/Claude orienta a escolha; a permissão efetiva pertence ao aplicativo autorizado, ao usuário e ao caso.

Ler material já salvo é gratuito e não exige que o caso tenha consumido créditos. Fazer uma nova pesquisa de jurisprudência segue a política de cobrança existente. O ForgeLex fornece material ao aplicativo; não chama uma API de geração nem pede uma chave de OpenAI ou Anthropic para esse fluxo.

Cada documento permanece na versão escolhida. Novos documentos ficam excluídos até uma alteração explícita. Para trocar a versão, desmarque e selecione o documento novamente, confira a prévia e salve. Alterações em fatos, provas, teses e fontes selecionados podem aparecer nas novas consultas. Vínculos não autorizam automaticamente outros itens. Cronologia, memos, questões e rascunhos não fazem parte desta seleção.

Em **Permissões da IA**, escolha **Revogar acesso** e confirme. A confirmação só aparece após o servidor registrar a revogação: **“Impede novas consultas. Conteúdo já enviado à IA pode continuar na conversa.”** Revogar no ForgeLex não apaga dados já recebidos pelo aplicativo. Uma conexão reautorizada precisa de permissão atualizada antes de consultar o caso.

Se as permissões mudarem em outra aba, a escolha permanece na tela. Clique **Atualizar permissões**, confira a prévia e reaplique explicitamente. O painel bloqueia envios simultâneos e não transfere uma resposta atrasada para outro caso. A configuração de conexão abre em outra aba para conservar o caso atual.

## Contrato para integração

As ferramentas externas são `case.list_shared`, `case.get_context` e `case.read_item`. Elas exigem OAuth verificado, concessão ativa e permissão do usuário para aquele aplicativo/caso. API keys e sessões do site não substituem essa identidade de conexão. Gerenciar permissões exige sessão web; a IA não concede sua própria permissão.

As respostas são de leitura, com `readOnlyHint: true`, `openWorldHint: false`, política `FREE`, `chargedCents: 0` e `isReplay: false`. Não consultam carteira nem usam replay privado do ledger; `remainingBalanceCents` fica ausente. Pesquisa continua no caminho financeiro existente. Identidade não é aceita nos argumentos.

Até 100 itens por categoria, páginas de até 50 itens, partes de até 8.000 caracteres e respostas de até 24 KiB de JSON UTF-8. A continuação aparece em `nextCursor`; o cliente deve buscar todas as páginas. Cursores são escopados à identidade, permissão e conteúdo. A concessão OAuth e a revisão da permissão são verificadas novamente antes da resposta. Revogação não recolhe conteúdo já transmitido.

Relações de fatos, provas e teses só incluem itens selecionados. Âncoras pertencem à versão documental autorizada. A leitura de fontes salvas não significa nova verificação jurídica. Instruções contidas em documentos são devolvidas como dados; a aplicação hospedeira continua responsável pelo comportamento do modelo. Auditoria destas operações registra metadados de IDs/revisão/resultado, sem texto privado ou credenciais.

A migration aditiva `persistence-0026-case-ai-access` cria as permissões. O encerramento de conta inclui sua exclusão. PostgreSQL deve executar o smoke em banco de teste isolado antes da integração; testes SQLite não substituem esse gate.

## Ensaio separado em cada aplicativo real

Esta branch precisa ser integrada e publicada por autorização separada antes de ensaio com um endpoint atualizado. Antes de conceder OAuth real, confirmar a concessão com Boni. Repetir independentemente no ChatGPT e no Claude: testar conexão gratuita, listar casos autorizados, ler um documento sintético selecionado em todas as páginas, negar documento excluído, revogar pelo site e negar leitura/cursor anterior. Reautorizar a conexão e confirmar que a permissão antiga não foi reaproveitada automaticamente.

Não usar documento pessoal ou pesquisa faturável nesse ensaio. Registrar aplicativo, versão, data, endpoint e revisão publicada. O E2E local usa navegador, API, banco e autenticação sintética; não demonstra instalação, disponibilidade de conectores no plano do cliente ou comportamento do modelo em um aplicativo real.
