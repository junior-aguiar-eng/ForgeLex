# Mesa e edição da peça — 05/11/2026

Publicada pela PR #105, fonte `98f6c3d`, em 05/11/2026.
[Recibo e verificações](../operations/agentic-workspace/2026-11-05-mesa-publication.md).
Direção de Boni: fundir elaboração e
revisão numa mesa limpa, com conversa e documento lado a lado e agentes nos
bastidores. Este desenho substitui a separação de navegação descrita em
`2026-11-02-forgelex-mesa-menu.md`.

## Experiência

- Mesa, Casos e Pesquisa permanecem na navegação principal. Rascunhos e Revisão
  deixam de ser destinos separados quando as capacidades de Mesa e Casos estão
  habilitadas. Os links anteriores continuam abrindo a peça ou as conferências
  na mesa integrada.
- A entrega documental abre como peça editável ao lado da conversa. No celular,
  o usuário alterna entre Conversa e Peça. Recolher a peça e navegar pela
  aplicação preservam a edição em memória.
- O editor básico permite alterar título, títulos das seções e texto diretamente
  no documento, sem inferência. Um texto novo começa com uma seção em branco.
  Para persistir no servidor, o usuário escolhe ou cria um caso e salva uma versão.
- Pedir ajuste preenche a conversa, inclusive com o trecho selecionado. O envio
  continua explícito. A solicitação usa o caso, a peça e a versão salva abertos;
  uma edição não salva bloqueia o pedido contextual. A confirmação comercial
  continua separada e é descartada se o contexto da peça mudar.
- Conferência, fontes, histórico e aprovação abrem sob demanda. Os controles de
  revisão editorial existentes preservam as confirmações de custo, decisões e
  aplicação. Uma nova versão aplicada atualiza a peça; se houver texto local
  alterado, ele é preservado e o conflito permanece visível.

## Exportação e limites

Word gera um `.docx` no navegador com o texto em edição. Uma edição local é
identificada como não salva, sem fabricar hash ou registro de versão. Exportar
não aprova a peça nem a envia a terceiros.

PDF abre uma folha A4 própria na impressão do navegador: o usuário escolhe
**Salvar como PDF**. Não é download automático de PDF. O texto é escapado antes
de renderizar o HTML, e as referências são incluídas.

O editor básico é textual, não um processador completo de formatação Word.
Alterações não salvas vivem na memória da aba, com aviso ao sair; não há promessa
de armazenamento offline persistente. Docling não é necessário para editar ou
exportar este conteúdo, e nenhum conversor externo foi adicionado.

## Operação

Sem migration, mudança de preço, habilitação editorial comercial ou chamada
paga. API e serviço de encerramento publicados com o mesmo digest, mantendo
o editor comercial desativado. A navegação integrada e o recolhimento da peça
foram conferidos em sessão autenticada de produção, sem salvar ou enviar pedidos.

Os testes usam API local, SQLite descartável e inferência sintética. Não
constituem avaliação jurídica nem ensaio pago do editor comercial.

## Validação local

- `pnpm exec playwright test --config playwright.writing-desk.config.ts --max-failures=4`:
  42 cenários aprovados, incluindo cobrança, recuperação, fontes, versões,
  links antigos, edição local, exportação e acessibilidade desktop/mobile.
- `pnpm exec vitest run apps/web/src`: 226 testes aprovados em 40 arquivos.
- `pnpm --filter @forgelex/web build`: TypeScript e ambos os builds Vite aprovados.
- ESLint dos componentes alterados: sem erros ou avisos.
- Prettier dos arquivos cobertos pela configuração e `git diff --check`: aprovados.

Capturas sintéticas da mesa: [desktop](evidence/2026-11-05-mesa-editor/desktop.png)
e [celular](evidence/2026-11-05-mesa-editor/mobile.png).
O PDF foi verificado até a abertura da folha de impressão com o texto correto;
a escolha nativa de destino e o salvamento final do arquivo cabem ao usuário.
