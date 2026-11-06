# Um chat e a peça ao lado — PR #111

## Fluxo determinado por Boni

A mesa tem uma conversa e um documento editável ao lado. Criar, revisar, explicar e alterar são pedidos escritos no mesmo campo. A revisão aparece na conversa; um pedido explícito de alteração produz uma nova versão da peça aberta. Não há mesa de revisão, modal editorial, importação de proposta ou botão para iniciar a revisão.

A lista de conversas permanece na lateral. As respostas anteriores permanecem no chat após continuar ou recarregar. No desktop, o texto da conversa rola enquanto o campo do pedido permanece disponível; a peça tem sua própria rolagem. No celular, conversa e peça compartilham o espaço disponível, preservando a mesma conversa.

## Implementação

- Reutiliza `AgenticWorkspaceScreen`, `Composer`, `DraftStudioScreen` e `DraftCanvas`. O documento não possui outro campo de conversa. Mantém edição manual, histórico de versões e exportação Word/PDF.
- O envio guarda a edição manual vinculada a um caso antes de fornecer sua versão à IA. Peças locais sem caso seguem no contexto escrito e podem ser revisadas e alteradas sem exigir cadastro de caso. Edições feitas enquanto uma resposta é produzida são preservadas.
- O protocolo interno v10 distingue `review_text`, criação e edição explícita. É uma extensão do protocolo v8, utilizado pela API, sem adotar implicitamente o protocolo v9 de calibração. Os perfis v1–v9 permanecem inalterados para retomada dos checkpoints históricos.
- Edição vincula `replacesVersionId` ao snapshot da peça. A persistência cria uma versão do mesmo draft, com ancestralidade, controle otimista e transação. Replay do mesmo resultado não duplica versões; mudança concorrente causa conflito. Criação de outra peça continua possível por pedido no chat.
- Revisão não grava documento e mostra os apontamentos na conversa, incluindo a conferência aritmética já existente. Revisão concluída sem sugestões deve responder explicitamente com conclusão vinculada ao texto; permanece cobrável conforme a política aprovada. Falha ou resposta vazia não é fabricada como revisão concluída.
- O preço e o teto aparecem junto ao campo. No fluxo integrado, Enviar autoriza o pedido e sua política vigente; não abre outra tela para iniciar o trabalho. Sem preço ou saldo suficiente, o envio fica indisponível. Permanecem o teto, a idempotência e o recibo na conversa.

## Referências consultadas

- [Vercel Chatbot — artefatos associados à conversa](https://github.com/vercel/chatbot/blob/main/lib/artifacts/server.ts).
- [Tiptap — agente que lê e edita o documento pelo chat](https://tiptap.dev/docs/ai/ai-toolkit/agents/ai-agent-chatbot).

As referências orientaram a ligação conversa/documento. Não foram adicionados SDK, serviço pago, dependência Tiptap nem Docling; a tarefa usa texto já disponível na mesa.

## Validação e limite operacional

Os testes locais usam dados sintéticos, banco descartável e `FakeAgentProvider`. Cobrem criação → revisão sem alteração → edição da mesma peça/conversa; revisão de edição manual e de peça local; preservação de versões, replay, conflito; preço, saldo, idempotência e recibo simulados; edição/exportação e acessibilidade desktop/mobile. Testes históricos verificam a retomada dos contratos anteriores.

Resultados locais: 1.819 testes unitários/integrados aprovados e 17 ignorados; 16 cenários de navegador aprovados (12 da mesa/comercial e 4 do fluxo comercial com transporte simulado). Build do monorepo, TypeScript web e lint aprovados. A formatação dos arquivos alterados foi verificada; a checagem global local acusa CRLF em arquivos preexistentes do checkout Windows, sem mudanças nesses arquivos.

Nenhuma inferência paga, migration de produção, merge ou deploy foi executado nesta correção. A qualidade da interpretação por um modelo real ainda precisa de ensaio autorizado depois da revisão desta PR por Boni.
