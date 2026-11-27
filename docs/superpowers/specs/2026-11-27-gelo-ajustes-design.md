# Ajustes do gelo antes do aceite — desenho (27/11/2026)

Pedido de Boni em 27/11/2026, depois de ver as capturas do gelo: corrigir o que impede o aceite antes de qualquer outra
etapa do projeto. Vale só para o tema gelo e o modelo público novo; o clássico não muda (sai na V7).

## Intenção

O ForgeLex é uma conversa que produz peças (DEC-16). As telas ainda mostram o produto anterior: site centrado em
pesquisa e MCP, Conectar IA e Conta cheios de ferramentas antigas, lateral confusa e Mesa colada no topo. O objetivo é
que tudo que o usuário vê confirme a Mesa como centro, com a jurisprudência com fonte e o MCP como temas transversais.

**Não-objetivos:** logo novo (adiado por Boni); ambiente de controle de Boni (etapa posterior, desenho próprio);
mudar o clássico; ligar o gelo em produção (segue a V6, com autorização).

**Anti-objetivos:** realocar ferramenta antiga em outro lugar; criar tela, aba ou botão que a conversa substitua; o site
afirmar o que não está publicado.

## Abordagens

| Opção | Como | Por que não / por que sim |
| --- | --- | --- |
| Remendar cada tela | Esconder blocos com condicionais do gelo | Deixa código morto e contraria “proibido realocar” |
| **Remover e recompor (escolhida)** | Apagar do caminho do gelo o que saiu do produto; recompor lateral, Mesa e site com os componentes atuais | Menos código, alinhado à DEC-16 |
| Refazer o app do zero | Nova casca | Desproporcional; o gelo já tem tokens e componentes aprovados |

Lateral: Boni recebeu duas propostas (A, estilo Claude/ChatGPT com conta num menu; B, seções fixas). Seguimos a **A**,
recomendada; Boni pode trocar.

## O que muda

1. **Lateral (A), igual em todas as telas autenticadas, inclusive Conta e Conectar IA.** Topo: marca e “Nova conversa”.
   Meio: Recentes e Pasta (recolhível, com “+”). Rodapé: nome e saldo; o clique abre um menu com Conectar IA, Conta e
   créditos, Recarregar, Conversas excluídas e Sair. Fundo da lateral contínuo em páginas longas (corrige o corte aos
   1000 px).
2. **Mesa centralizada.** Conversa vazia: saudação e caixa de pedido no centro vertical e horizontal, largura máxima de
   680 px. Depois do primeiro envio, a caixa vai para o pé e a conversa ocupa o centro; com peça aberta, a peça fica à
   direita como hoje.
3. **Conta.** Sai a aba e o cartão “Chaves de API”. Ficam Faturamento, Atividade e Segurança (com o encerramento). Os
   textos de preço deixam de falar só “por busca”: mostram o custo do trabalho na Mesa e o da pesquisa.
4. **Conectar IA.** Fica: instruções para ChatGPT e Claude, URL do servidor, aplicativos autorizados (com revogação) e a
   nota de privacidade, que passa a dizer que a IA conectada lê os casos ativos (decisão de 26/11). Saem: gerenciar
   pesquisas salvas, “abra o caso em Casos”, teste de disponibilidade, exemplos de primeiro uso e as abas Guia e API.
5. **Site público (modelo novo).** Início centrado na Mesa: descrever, anexar, receber a peça para revisar. Jurisprudência
   com fonte e MCP como seções transversais. Páginas: Início, Como funciona, Preços e Conectar sua IA. Guia,
   Desenvolvedores/API, Integrações, Produto e Consulta processual saem do menu e do mapa do site; os endereços antigos
   levam ao Início. O título aprovado em 17/11 (“Sua IA, com jurisprudência que dá para conferir.”) não cabe mais no
   foco da Mesa: proponho título novo para Boni escolher no próprio aceite.
6. **Capturas.** A ferramenta `scripts/visual-baseline-lib.mjs` passa a listar só as telas que existem no produto atual
   e captura com o modelo público novo ligado.

## Restrições

- Só no gelo e com `VITE_FORGELEX_PUBLIC_MODEL=true`; o clássico sai igual.
- Testes de cópia, SEO e E2E atualizados no mesmo commit da mudança; axe sem violação em 360, 768 e 1440 px.
- Nada é publicado sem autorização de Boni.

## Decisões minhas, para Boni conferir

- A API de chaves continua no servidor por ora (só sai da tela e do site): remover as rotas exige saber se existe chave
  ativa em produção, o que confiro antes de propor.
- A consulta processual gratuita (DataJud) sai como página; continua disponível como pedido na conversa, se o agente já
  a usa, e não é anunciada à parte.
- Os textos legais seguem a proposta de 18/11 atualizada em 27/11 e dependem da aprovação de Boni; não entram nesta
  entrega.

## Fica para quem constrói

Nomes de componentes, divisão dos commits por etapa e o detalhe dos testes.
