# Receber no editor o texto produzido na sua IA

Em **Usar este caso na IA**, escolha o aplicativo conectado e os materiais permitidos. Marque **Permitir que esta IA envie textos ao editor** e escolha **Novo rascunho** ou um rascunho existente do caso. Confira a prévia, salve a permissão e copie a instrução inicial para sua conversa no ChatGPT ou Claude.

Peça à IA para salvar o texto no ForgeLex. O recebimento é gratuito e usa a conexão do seu próprio aplicativo. O ForgeLex não gera esse texto por API nem solicita uma chave de OpenAI ou Anthropic.

Se você escolheu um rascunho existente, o texto chega como uma versão separada. A edição aberta e a versão atual permanecem preservadas. No editor, clique **Atualizar textos recebidos**, abra **Ver texto recebido** e, quando quiser adotá-lo, escolha **Usar esta versão**. Se houver alterações não salvas, você poderá salvá-las, descartá-las explicitamente ou continuar editando. Se outra aba tiver mudado a versão atual, o site recusa a adoção e conserva sua edição para uma nova decisão.

Um novo rascunho já abre com o texto recebido. Em ambos os destinos, o texto exige conferência das fontes e revisão humana antes do uso. Recebimento, vínculo de uma fonte e localização de um documento não significam confirmação jurídica ou aprovação. As versões anteriores e suas decisões continuam no histórico.

Referências documentais apontam para a versão selecionada, mesmo que o documento tenha uma versão posterior. Edições humanas derivadas conservam essas referências. A conferência mostra documento indisponível como pendência bloqueante. O DOCX exporta a versão salva, suas fontes e o aviso de revisão pendente; alterações ainda não salvas ficam fora do arquivo.

Desabilitar o recebimento ou revogar o acesso impede novos envios e repetições. O texto já recebido permanece no histórico. Os nomes dos aplicativos são metadados informados pela conexão e não comprovação da identidade comercial do fornecedor.

## Contrato técnico

`draft.save_from_ai` é a única ferramenta nova de escrita externa. Exige OAuth MCP ativo, concessão vigente, permissão explícita do usuário para aplicativo/caso e revisão atual da permissão. O destino pertence à permissão salva. Sessões web e API keys não substituem essa identidade. Consultas de materiais e pesquisas mantêm suas regras existentes.

A entrada estrita aceita `matterId`, `expectedGrantRevision`, `idempotencyKey`, `title`, `sections`, `references` e `notes` opcionais. São até 100 seções, 500 referências e 512 KiB UTF-8; cada referência precisa pertencer à seleção autorizada. Documentos fixam `documentVersionId` e podem incluir `anchorId`. Campos de identidade, aprovação e confirmação da fonte são recusados.

Repetir a mesma chave com o mesmo conteúdo retorna o mesmo recibo. Conteúdo diferente com essa chave gera conflito. A autorização é revalidada inclusive para repetição. Em falha de entrega, repetir a chave original permite recuperar o recibo sem duplicar a versão. A transação bloqueia o caso antes do rascunho e serializa escritores humanos e externos. O cancelamento anterior ao commit reverte as inserções.

O recibo público contém identificadores da versão, data, origem declarada, `reviewPending:true`, `isReplay` e caminho do editor. Não contém texto integral, chave, hashes privados ou saldo. A resposta tem até 24 KiB e `billing:{mode:'FREE',chargedCents:0,isReplay}`. A auditoria registra somente metadados. Falha de auditoria após gravação não duplica o envio.

As rotas `ai-receipts` do editor exigem sessão web, têm `Cache-Control: no-store` e são escopadas ao proprietário. A adoção exige ainda `matter:write` e `draft:write`, com `expectedCurrentVersionId`. Migration aditiva `persistence-0027-draft-ai-receipts` habilita o armazenamento; permissões preexistentes permanecem sem recebimento. Recibos entram na exclusão de conta e na verificação de resíduos após restauração.

## Validação e publicação

O runner `pnpm test:postgres:draft-ai` utiliza somente `FORGELEX_LOCAL_POSTGRES_URL`, destinada a um banco de testes isolado. A CI executa esse smoke no serviço PostgreSQL 16 existente. Ele verifica migrations, idempotência concorrente, numeração humana/externa, preservação de versão aprovada, rollback, cancelamento aguardando bloqueio real, revogação, adoção, fontes fixadas e restauração/exclusão de recibos.

O teste de navegador cobre sessão, autorização explícita, envio OAuth, replay, prévia segura, conservação de edição, conflito entre abas, adoção e DOCX com fonte. Autenticação e dados são sintéticos. Essa prova local não comprova comportamento do modelo no ChatGPT ou Claude real.

Publicação exige CI no SHA proposto e integrado, backup, migration explícita e promoção da revisão. A homologação real deve testar separadamente ChatGPT e Claude com caso sintético, envio/repetição, fontes, adoção e recusa após revogação. Nova concessão OAuth deve ser confirmada no momento correspondente. Integração, deploy e homologação desta frente permanecem pendentes nesta entrega local.
