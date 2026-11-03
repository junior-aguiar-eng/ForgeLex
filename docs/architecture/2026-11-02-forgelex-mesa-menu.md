# Mesa: opções dentro da mensagem

Em 02/11/2026, Boni esclareceu a referência desejada: manter as opções de pedido
e apresentá-las em menu selecionável na própria caixa de mensagem.

O `Composer` agora apresenta o seletor **Opções** junto da mensagem e do envio.
Reutiliza o catálogo existente recebido do servidor, sem modificar ações,
contratos, nomes ou permissões. As quatro opções originais continuam disponíveis;
a capacidade probatória já adicionada localmente continua no catálogo local.
A linha de botões abaixo da caixa foi retirada. A escolha é opcional, preserva
o texto e pode ser desfeita voltando a **Opções**. Selecionar não envia nem cobra.
Continuações preservam o comportamento anterior e a ação do contexto recebido.

Rascunhos e Revisão não foram removidos ou redesenhados: o primeiro é o acesso
ao editor, versões e exportação; o segundo reúne pendências de aprovação humana.
A ação **Revisar um texto** da mesa solicita análise pela IA e não substitui
aprovação humana. O menu global não representa uma sequência obrigatória.

Validação executada após a implementação:

- `pnpm --filter @forgelex/web build`: TypeScript e dois builds Vite aprovados.
- Playwright comercial: quatro cenários aprovados, incluindo menu, ausência de
  envio/cobrança ao selecionar, navegação por teclado, Axe e largura móvel.
- Playwright workspace: dois cenários de opções/pedido livre aprovados.
- Playwright flags: um cenário de isolamento da navegação aprovado.
- ESLint do `Composer`, Prettier dos arquivos pertinentes e `git diff --check`
  aprovados. A configuração ESLint não cobre os testes E2E; estes foram executados
  pelo Playwright e conferidos pelo Prettier.
- Capturas desktop e mobile inspecionadas em `tmp/forgelex-mesa-menu-desktop.png`
  e `tmp/forgelex-mesa-menu-mobile.png`.

Não houve alteração de backend, preço, autorização ou estado de produção,
nem chamada paga de IA. Sem commit, push ou deploy.

O candidato congelado para a avaliação final precede esta mudança de apresentação.
Antes de executar a avaliação real, regenerar seu manifesto e snapshot; não
atribuir os testes ou hashes anteriores automaticamente a esta versão.
