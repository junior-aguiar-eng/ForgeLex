# Prompt de implementação — navegação e hierarquia visual do ForgeLex

## Objetivo

Refatore exclusivamente o frontend atual do ForgeLex para eliminar duplicidades, tornar as ações intuitivas e dar presença adequada às áreas administrativas e técnicas. Não implemente cadastro, autenticação, pagamentos, billing, endpoints ou mudanças de backend neste escopo.

## Contexto e limites

O projeto possui as telas de Visão geral, Casos, Pesquisa, Rascunhos, Revisão, Configurações de modelos, Créditos e Documentação da API. Preserve as funcionalidades, contratos, estados vazios honestos, Draft Studio, pesquisa, API/MCP e alterações locais existentes.

Não reintroduza saldo, bônus, transações, resultados, aprovações, conexões ou credenciais fictícias. Não remova Documentação da API. Não faça push. Não inclua este prompt ou outros documentos de workflow no commit.

## Correções obrigatórias

### Pesquisa

Os três controles atuais têm a mesma finalidade: `Nova pesquisa` no cabeçalho, `Nova pesquisa` na Home e `Pesquisar` no formulário.

Consolidar a experiência assim:

- cabeçalho: no máximo um CTA de entrada, preferencialmente `Pesquisar`;
- Home: `Abrir caso` como ação contextual e foco visual no campo de pesquisa;
- formulário: somente `Consultar` como botão de envio.

Não exibir dois CTAs destacados que iniciem o mesmo fluxo na mesma viewport.

### Créditos

Remover a duplicidade entre `Créditos` no cabeçalho e no rodapé. O acesso deve existir uma única vez no menu lateral e usar o nome `Conta e faturamento`.

Não exibir saldo, bônus, quantidade de pesquisas, extrato ou status de pagamento sem dados reais retornados pelo backend.

### Cabeçalho

Manter no cabeçalho apenas:

- marca ForgeLex;
- `Casos`;
- `Pesquisa`;
- `Rascunhos`;
- `Revisão`;
- estado ativo claramente identificável;
- um único CTA de entrada para pesquisa, se necessário;
- botão do menu lateral em telas menores.

Não misturar navegação jurídica, conta, configurações e documentação técnica no mesmo nível visual.

### Menu lateral esquerdo

Criar ou consolidar um menu lateral esquerdo, recolhível, com presença visual moderada e legível. Ele deve conter:

- `Visão geral`;
- `Conta e faturamento`;
- `Modelos e integrações`;
- `Documentação da API`.

O menu deve ter largura suficiente para leitura, ícone acompanhado de texto, área clicável confortável, estado ativo visível, foco visível e suporte a teclado. Em modo sobreposto, deve fechar por botão, Escape e clique fora. Usar `aria-expanded`, `aria-controls` e `aria-current` adequadamente.

Discreto não significa microscópico ou escondido exclusivamente no rodapé.

### Home

Manter a Home centrada no trabalho jurídico:

- `Abrir caso`;
- campo principal de pesquisa;
- `Consultar` como envio da consulta;
- nenhuma grade de produtos ou atividades fictícias;
- sugestões apenas se forem explicitamente exemplos de temas, nunca histórico real;
- histórico vazio com orientação `Nenhuma consulta realizada` ou equivalente;
- nenhum saldo ou atividade de suposta equipe.

### Rodapé

Reduzir o rodapé a informação institucional e, no máximo, um acesso técnico essencial. Não repetir conta, créditos, pesquisa, configurações ou os itens do menu lateral. O rodapé deve usar o mesmo container do conteúdo.

## Rótulos visíveis

Adotar esta nomenclatura:

| Atual | Recomendado |
|---|---|
| Início | Visão geral |
| Nova pesquisa | Pesquisar |
| Botão de envio da pesquisa | Consultar |
| Créditos | Conta e faturamento |
| Configurações de modelos | Modelos e integrações |
| Área técnica | Documentação da API |
| Research Desk | Pesquisa |
| Matter Workspace | Área do caso |
| Draft Studio | Rascunhos |
| Review Center | Revisão |

Preserve nomes internos, rotas e identificadores em inglês quando forem necessários à compatibilidade técnica. A regra se aplica aos textos da interface do advogado.

## Dados e claims

Não exibir nem afirmar:

- saldo ou bônus fictício;
- transações pré-criadas;
- histórico de consultas fictício;
- métricas de atividade;
- conexões ativas sem verificação;
- credenciais mascaradas como se fossem reais;
- disponibilidade pública de API ou MCP não comprovada.

Quando não houver dados, utilizar estados como `Sem dados carregados`, `Nenhuma consulta realizada`, `Conta não conectada`, `Configuração não verificada` e `Exemplo de demonstração`.

## Responsividade e acessibilidade

Validar em 1440px, 1280px, 1024px e 768px:

- ausência de rolagem horizontal;
- cabeçalho sem colisão entre marca, navegação e ações;
- menu lateral sem ultrapassar a viewport;
- margens laterais proporcionais;
- botões sem texto cortado;
- rodapé alinhado ao conteúdo;
- cards, grids e formulários sem largura fixa incompatível.

Garantir navegação por teclado, foco visível, contraste suficiente, ordem de tabulação coerente, rótulos acessíveis para ícones, `type` correto nos botões e nenhum controle dependente apenas de hover.

## Preservação funcional

Não remover ou descaracterizar:

- Casos, documentos, fatos, provas e linha do tempo;
- Pesquisa e proveniência;
- Rascunhos e Draft Studio;
- Revisão humana;
- API e Documentação da API;
- MCP;
- auditoria, contratos e identificadores internos.

O Draft Studio deve continuar acessível por `Rascunhos`, sem novos itens técnicos no cabeçalho e sem expor token, endpoint, hash, nome de tool ou ID técnico no fluxo comum de redação.

## Validação obrigatória

Antes de alterar, confirme diretório, branch, HEAD, remoto e estado do Git. Leia `AGENTS.md` e preserve mudanças não relacionadas.

Depois execute:

    pnpm install --frozen-lockfile
    pnpm --filter @forgelex/web build
    pnpm typecheck
    pnpm test
    pnpm build
    git diff --check

Confira também `git status --short --branch`, `git diff --stat` e `git diff --name-only`.

Se o controle visual do navegador estiver disponível, abra `http://localhost:3000` nas quatro larguras. Se não estiver, declare a limitação e não alegue QA visual completo.

## Critérios de aceite

A implementação somente estará concluída quando:

- a navegação jurídica tiver exatamente quatro itens principais;
- existir no máximo um CTA de entrada para pesquisa;
- `Consultar` for o único envio do formulário;
- não houver créditos duplicados;
- conta, faturamento, modelos e documentação estiverem no menu lateral;
- o menu lateral for legível, acessível e localizável;
- o cabeçalho não misturar administração e fluxo jurídico;
- a Home não apresentar catálogo fictício;
- o rodapé não repetir ferramentas;
- os textos visíveis estiverem em português-BR;
- API e Documentação continuarem acessíveis;
- Draft Studio continuar acessível;
- não houver dados fictícios apresentados como reais;
- não existir overflow horizontal nas quatro larguras;
- build, typecheck, testes e `git diff --check` passarem;
- o diff ficar limitado à navegação e hierarquia visual;
- nenhum push for realizado.

## Entrega final

Relate telas e componentes alterados, duplicidades removidas, estrutura final do cabeçalho e menu lateral, localização das áreas administrativas/técnicas, rótulos traduzidos, larguras verificadas, comandos e resultados, limitações da validação visual e estado do Git. Se o commit estiver autorizado, informe seu hash e confirme expressamente que não houve push.
