# ForgeLex — registro da implementação e validação local

Data: 11/10/2026. Avaliação humana: Boni. Implementação local no checkout
`C:\Users\Boni Jr\.codex\worktrees\saved-research-mcp-reader\SDK`, branch
`codex/saved-research-mcp-reader`, a partir de `origin/main`
`a7d1e0a04eaed4a7ffe394eec94be3c0bf131c9e`. Alterações ainda sem commit.

## Resultado implementado

A apresentação pública usa “Jurisprudência dos tribunais superiores e consulta
processual”, com a cobertura real informada junto de cada operação. O frontend
valida o tribunal pelas capacidades do servidor. Nenhum novo fornecedor ou
acervo foi habilitado. Pesquisa STJ e consulta processual TJAL permanecem.

A coleção conserva manualmente até seis pesquisas completas, com os critérios
executados, data, ordem, textos, fontes e versões originais. O salvamento
recupera uma operação concluída pertencente ao usuário e à conta; não aceita
ementas enviadas pelo navegador ou pelo modelo. A cópia persistida independe da
expiração do resultado operacional. Não inclui conversa ou explicação da IA.
Não há preenchimento histórico, substituição automática ou concessão automática
de acesso. O aviso de cobrança é compartilhado entre site e leitor MCP.

O leitor comum apresenta uma decisão por vez, navegação por teclado, datas
distintas, citação com alternativa manual e “Origem e fonte”. Conteúdo é texto
inerte; somente endereços HTTP/HTTPS disponíveis na fonte originam links.
Versão indisponível não é trocada por versão atual. A ementa tem aviso sobre
integralidade não confirmada. Nenhum texto é completado por inferência.

## Persistência e interfaces

Migração aditiva `persistence-0030-saved-research`: coleção, pesquisas e
permissões. Posições de 1 a 6, restrições no banco e transação com bloqueio por
proprietário impedem a sétima vaga, inclusive entre conexões PostgreSQL distintas.
Unicidade da operação evita duplicação. O codec existente conserva o limite de
8.388.608 bytes codificados, rejeitando excesso em vez de truncar.

As tabelas participam da exclusão privada, verificação residual e reaplicação
do encerramento após restauração de backup. Permissões participam da remoção de
credenciais. Desligar a funcionalidade conserva as pesquisas existentes.

Interfaces gratuitas, com autenticação de sessão no site:

- `GET/POST /api/v2/research/saved` e `GET/DELETE /:id`.
- `GET/PUT /api/v2/research/saved/permissions`, conferindo a conexão OAuth atual.
- MCP: `research.present_decisions`, `research.list_saved_searches`,
  `research.get_saved_search`, `research.save_search` e
  `research.delete_saved_search`.

A autorização “Gerenciar pesquisas salvas” pertence ao usuário, aplicativo e
concessão OAuth atual; pode ser revogada. Salvar exige solicitação explícita.
Excluir é ação da interface, exige confirmação e declara natureza destrutiva.
Nenhuma operação gratuita debita o saldo ou executa uma nova pesquisa.

## Controles reversíveis

Por padrão, todos estão desligados. Ativação precisa contemplar frontend e API:

| Controle | Efeito |
| --- | --- |
| `VITE_FORGELEX_SAVED_RESEARCH_ENABLED=true` | Coleção no site |
| `FORGELEX_SAVED_RESEARCH_ENABLED=true` | Serviço REST e operações de coleção MCP |
| `FORGELEX_MCP_DECISION_UI_ENABLED=true` | Apresentação visual e recurso MCP Apps |

O build Docker/Cloud Build tem argumento correspondente para o site, com padrão
`false`. A flag de casos conserva o congelamento existente. Estas configurações
foram usadas somente nos testes e na prévia; nenhuma configuração remota mudou.

## Evidências locais

Os logs estão em `.superpowers/sdd/2026-10-11-saved-research-mcp-reader/`.

| Verificação | Resultado e evidência |
| --- | --- |
| Base antes da implementação | 821 testes aprovados, 17 ignorados; `baseline.log` |
| Build de todos os pacotes | Concluído; `build-third.log` |
| Build final do leitor | Concluído; `contrast-green-build.log` |
| ESLint | Concluído sem erros; `lint-reviewed.log` |
| Suíte geral final | 159 arquivos aprovados e 3 ignorados; 839 testes aprovados, 18 ignorados; saída 0, sem erros do executor; `suite-final-forks.log` |
| PostgreSQL, SQLite, serviço, encerramento/restauração | 21 testes aprovados; `postgres-reviewed.log` |
| Concorrência PostgreSQL | 14 tentativas entre conexões: 6 salvas e 8 conflitos; também duplicação, restrição de posição e revogação |
| Coleção e leitor no navegador | 4 cenários aprovados; `saved-reviewed-final.log` |
| Pesquisa e recuperação existentes | 10 cenários aprovados; `research-regression.log` |
| Conexão, OAuth, conta e congelamento | 32 cenários aprovados; `mcp-site-reviewed.log` |
| Site público e consulta processual | 16 cenários aprovados em `public-final.log`; expectativa antiga do título corrigida e caso reaprovado em `public-copy-reviewed.log` |

Os quatro cenários novos cobrem seis vagas, sétimo bloqueado, cancelamento,
falha de exclusão, substituição manual, reabertura em outro dispositivo, nova
pesquisa faturável, navegação/cópia gratuitas, teclado, falha de cópia,
largura de 320 px, tema escuro e verificação automática de acessibilidade no
leitor. O ensaio do SDK oficial cobre seleção de uma decisão com salvamento da
pesquisa inteira, reabertura, dois julgamentos do mesmo processo, expansão,
texto malicioso inerte, exclusão confirmada e falha de abertura da fonte.

Suíte geral final executada com `pnpm exec vitest run --pool forks --maxWorkers 2`,
após o build, com testes PostgreSQL locais executados separadamente conforme
registrado acima. Os 18 testes ignorados mantêm suas condições de ambiente;
não são resultados aprovados. O ensaio novo PostgreSQL foi executado e aprovado
na verificação separada. ESLint foi novamente aprovado em `lint-last.log`.

As primeiras tentativas apresentaram tempo limite na importação fria das telas
e erros de encerramento de processos Vitest no Windows; não foram contabilizadas
como aprovação. O ensaio diagnóstico de telas e repositório passou 12 testes,
com um teste PostgreSQL ignorado (`runner-diagnosis.log`). O teste de telas passou
a preparar a compilação antes das asserções, preservando a verificação separada
das duas configurações e o prazo das asserções. Uma tentativa experimental com
threads apresentou falhas e encerrou por violação de acesso no processo nativo;
foi descartada. A execução final manteve processos separados, sem repetir o erro.

## Revisão da entrega

A revisão independente por IA não identificou P0/P1. Dois problemas P2 foram
corrigidos com regressão: abertura da fonte pelo protocolo do aplicativo, com
alternativa para copiar endereço; data da operação recuperada obtida do evento
de uso concluído, em vez da primeira tentativa. Também foram corrigidos o
contraste dos avisos no tema escuro e estados de carregamento/coleção vazia.

Decisões de implementação: SDK oficial MCP Apps fixado em `1.1.2`, compatível
com SDK MCP e Zod do projeto; versão 2 não foi adotada por incompatibilidade.
O leitor usa recurso isolado com CSP sem rede, sem credenciais e sem acesso à
conversa. Fontes abertas pelo protocolo recebem tratamento de erro.
Registro e expansão seguem o [padrão MCP Apps](https://apps.extensions.modelcontextprotocol.io/api/documents/Overview.html);
a entrada opcional no painel da conversa segue as
[extensões do ChatGPT](https://developers.openai.com/plugins/build/extensions).
Essas referências oficiais foram conferidas em 11/10/2026; suporte efetivo
continua sujeito ao ensaio no aplicativo e conta de Boni.

Ponto menor adiado: uma seleção pode repetir a mesma referência exata no leitor.
Isso não duplica o salvamento, não ocupa outra vaga e não troca a versão da
decisão. Pode receber deduplicação de apresentação em incremento posterior.

## Prévia e limites demonstrados

- Site: <http://127.0.0.1:3560/app>.
- Leitor MCP Apps local: <http://127.0.0.1:3562/>.
- Acesso fictício: `previa@forgelex.test`, senha `senha-local-controlada`.

A prévia usa API em 3561 e autenticação simulada em 15591, com banco SQLite
próprio e saldo fictício. Foram conservadas duas pesquisas de teste. A página
do leitor permite salvar outra pesquisa completa, listar, abrir, navegar,
copiar, expandir e excluir mediante confirmação. A autorização sintética fica
no processo local, fora do conteúdo visual. O ensaio PostgreSQL usa exclusivamente
o contêiner local `forgelex-saved-research-test`, porta 5445; não usa produção.

Captura da prévia: `.superpowers/sdd/2026-10-11-saved-research-mcp-reader/preview-mcp.png`.
Capturas dos ensaios: `test-results/saved-research/`, arquivos
`six-saved-mobile.png`, `saved-reader-dark.png`, `saved-permission.png` e
`mcp-apps-local-reader.png` nas respectivas pastas Playwright.

**Ainda não demonstrado:** instalação e funcionamento deste incremento no
ChatGPT e Claude reais, suas opções de painel/expansão e retorno textual quando
o aplicativo não renderiza MCP Apps. A prévia e o SDK local não substituem esse
ensaio. Não houve migração de produção, publicação, commit, push ou integração.
Essas operações dependem da autorização específica de Boni para esta entrega.

Os 47 arquivos de trabalho anterior no checkout original foram conferidos
contra o inventário protegido, sem divergência. Os servidores anteriores nas
portas 3000/3001 e o checkout da publicação anterior foram preservados.

## Correção da fidelidade visual após apontamento de Boni

A primeira entrega local implementou as funções do leitor, mas não reproduziu
a apresentação da prévia aprovada. Em 11/10/2026, após Boni apontar a divergência,
foi localizado e comparado o arquivo original `forgelex-mcp-decisions-preview.html`
no diretório de visualizações da conversa anterior. Uma
[cópia integral, sem alterações](../references/2026-10-11-mcp-decisions-approved-preview.html)
foi conservada neste checkout como referência verificável.

O leitor real compartilhado agora reproduz cabeçalho ForgeLex, identificação
compacta, relatoria/órgão acima das datas, aba Ementa, área de texto delimitada
com rolagem, ações compactas de citação e fonte e rodapé. Cores, tipografia,
espaçamentos e contornos derivam da referência. Alvos de toque de 44 px e avisos
sobre a fonte foram conservados. “Resultado do julgamento” não é fabricado:
continua ausente porque o contrato atual não fornece esse conteúdo próprio.
Salvar e abrir pesquisas ficam juntos, abaixo da identificação das fontes.

A prévia funcional oferece os dois arranjos originais e mantém a seleção
ao alterná-los, com tema claro/escuro e expansão com retorno à conversa.
Conversa ilustrativa e leitor real são explicitamente identificados. Abrir
<http://127.0.0.1:3562/?view=side> mostra diretamente o painel lateral;
`/referencia` oferece o exemplo original para comparação.

Verificações após a correção: build do site/leitor aprovado
(`visual-fidelity-build-verified.log`), 4 cenários completos no navegador
aprovados (`visual-fidelity-verified-e2e.log`), 3 testes de telas preservadas
aprovados (`visual-fidelity-regression.log`), ambos os arranjos/temas/320 px e
zero erros de página (`visual-fidelity-preview-verified.log`). A suíte de 839
testes acima é o registro anterior a esta correção visual, sem alegação de
nova execução integral. A comparação visual foi feita nas capturas
`approved-original-panel.png`, `preview-corrected-side.png`,
`preview-corrected-inline.png`, `preview-corrected-side-dark.png` e
`preview-corrected-mobile.png`, no diretório local de evidências.
ESLint também foi reaprovado após a última alteração
(`visual-fidelity-lint-verified.log`); `git diff --check` não apontou erros.

Esta correção não muda serviços, banco, cobrança ou permissões. Continua local,
sem commit ou publicação. A posição efetiva do painel em ChatGPT/Claude reais
continua pendente de ensaio; o simulador local não demonstra suporte real.

**Aprovação visual de Boni — 11/10/2026:** após comparar a apresentação
corrigida com o exemplo original, Boni confirmou na conversa: “agora sim,
aprovado!”. A aprovação abrange a apresentação corrigida do painel e do leitor.
Não constitui evidência de ensaio nos aplicativos reais nem autorização nova
para commit, integração, migração de produção ou publicação.

## Autorização de publicação e vistoria final

Depois da aprovação visual, em 11/10/2026 Boni autorizou expressamente commit,
push, integração em main, migração de produção e deploy desta entrega,
condicionados à última vistoria. Essa autorização substitui a limitação de
operação local para a cadeia descrita; não fabrica ensaio nos aplicativos reais.

A revisão final independente por IA não identificou P0/P1. Encontrou uma
inconsistência temporal: o leitor combinava o dia UTC da operação com a hora
local. A correção formata ambos no mesmo fuso do usuário, preservando as datas
de julgamento/publicação. Foi acrescentada regressão para uma operação de
11/10/2026 00:30 UTC, exibida em Maceió como 10/10/2026 às 21:30.

O CI passou a executar expressamente o teste das seis vagas entre conexões
PostgreSQL e os cenários da coleção/leitor MCP Apps. Vistoria geral renovada:
`pnpm test`, saída 0, 839 testes aprovados e 18 ignorados; um aviso de demora
no encerramento de um processo de testes Windows foi registrado no log,
sem falha de asserção. PostgreSQL/SQLite/serviço/encerramento: 21 aprovados.
Build final do site/leitor e ESLint aprovados. Os resultados finais do navegador
e a publicação serão registrados com seus recibos efetivos.

Navegador final: 5 cenários aprovados, incluindo a regressão temporal no fuso
de Maceió (`release-saved-e2e.log`, 38 s). O teste da data inicialmente reproduziu
o dia incorreto; uma tentativa intermediária encontrou indisponibilidade da
API local. A execução completa posterior passou os cinco cenários. O teste
isolado que havia emitido aviso de encerramento também passou, sem repetir
o aviso (`release-runner-check.log`). Todas as verificações registradas nesta
vistoria encerraram com saída 0. Os 47 arquivos anteriores foram reconferidos
sem divergência. Nenhum ensaio usa pagamento ou dados de conta real.

Inspeção remota anterior à migração: PostgreSQL 16.15, banco `forgelex`,
37 migrações registradas; somente `persistence-0030-saved-research` pendente.
As três tabelas novas não existiam. Transação `READ ONLY`, nenhuma mutação.
Produção ainda na revisão `forgelex-api-prod-site-a6672d49` a 100%; instância
de homologação isolada permanece parada. Os três backups diários consultados
constam concluídos com sucesso.

Reversão depois de salvar pesquisas deve conservar o código compatível com
as novas tabelas na exclusão e restauração de contas. Desligar as funcionalidades
preserva a coleção; não remover tabelas nem retornar à purga antiga depois de
criar conteúdo salvo. A aprovação de publicação não concede automaticamente
aos aplicativos a permissão “Gerenciar pesquisas salvas”.
