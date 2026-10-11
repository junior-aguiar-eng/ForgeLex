# Congelamento reversível do site — evidência local

Execução autorizada por Boni em 11/10/2026, conforme
[plano](../../superpowers/plans/2026-10-11-site-mcp-scope-freeze.md).
Base/HEAD: `f5f9316dd0255e49029972806fb161963ab4d54a` (origin/main atualizado).
Branch: `codex/site-mcp-scope-freeze`. Este registro descreve a etapa local
anterior ao commit e deploy. A publicação posterior está no
[registro de publicação](2026-10-11-site-mcp-publication.md).
Worktree: `C:/Users/Boni Jr/.codex/worktrees/site-mcp-scope-freeze/SDK`.

## Resultado e limites

Flag pública `VITE_FORGELEX_CASE_WORKSPACE_ENABLED`, default `false`;
somente `true` habilita o fluxo antigo. Casos, rascunhos, revisão e atalhos
ficam ocultos; aliases antigos convergem para `/app/conectar`, por substituição
do histórico, sem parâmetros de caso. A fila não é solicitada no modo enxuto.
Pesquisa, fontes, cópia, OAuth, revogação, conta, billing, chaves, API Docs e
consulta processual gratuita permanecem acessíveis. O site público e seus
metadados descrevem o escopo de pesquisa e integração.

Não houve alteração em `apps/api`, `packages`, scripts, schema, OpenAPI ou
catálogo MCP, nem exclusão de arquivos rastreados. As ferramentas MCP de casos
continuam disponíveis conforme suas permissões. Nenhum grant foi revogado.
Os planos de simplificação e V2 estão suspensos; o plano visual MCP é independente.
[Matriz e procedimento de reversão](../../product/site-mcp-scope-freeze.md).

Testes locais usam contas, provedores e fontes sintéticas. Não comprovam
execução real no ChatGPT/Claude, pagamentos reais, tráfego ou publicação.
PostgreSQL não estava disponível na porta local 55432; fixtures usam SQLite
descartável, sem banco remoto. Não houve migration operacional, restauração,
commit, push, integração ou deploy. A aprovação visual pertence a Boni.

## Proteção do trabalho anterior

Checkout original `C:/Users/Boni Jr/.antigravity-ide/SDK`, branch
`codex/case-flow-simplification`, HEAD `101ee331fc621ebf38fd536a549c38b0f9340d12`.
Os 47 arquivos protegidos têm cópia, inventário, patch binário e hashes em
`C:/Users/Boni Jr/.codex/backups/forgelex-site-freeze-2026-10-11`.
Nova conferência SHA256: 47 verificados, zero divergências.
Artefatos ignorados anteriores continuam no checkout original; credenciais
não foram copiadas. Nenhum patch anterior foi incorporado a esta execução.

## Verificações

Baseline íntegra em arquivo de HEAD: build aprovado; 794 testes aprovados,
17 ignorados, 150 arquivos aprovados e dois ignorados. O arquivo usa dependências
locais existentes, sem instalação/purge. A primeira tentativa de baseline
coincidiu com novos testes RED e não foi utilizada como baseline íntegra.

| E2E/configuração | Modo | Resultado final |
| --- | --- | --- |
| MCP/onboarding/site enxuto | false | 32 aprovados |
| Público, metadados iniciais, âncoras e axe | false | 17 aprovados |
| Pesquisa, histórico e persistência de julgado | true | 10 aprovados |
| Encerramento de conta | false | 4 aprovados |
| Recuperação de chunks | false | 3 aprovados |
| Documentos e menu em tela baixa | true | 5 aprovados |
| Leitor documental | true | 4 aprovados |
| Conferência de rascunhos | true | 9 aprovados |
| Permissões/contexto de IA por caso | true | 8 aprovados |
| Lifecycle de casos | true | 5 aprovados |
| Fase 7 | true | 1 aprovado |
| Acessibilidade existente, 320 e 1366 px | true | 38 aprovados |

Total: 136 execuções E2E aprovadas nessas configurações, sem novos skips.
O site enxuto também verifica teclado, Escape/foco, ausência de overflow,
erros JS e requisições de casos/fila em 390 e 1440 px. O menu foi testado
em 375x568 nos dois modos. O público foi auditado em 375 e 1440 px.

`pnpm lint`: aprovado. `pnpm exec vitest run`: 821 aprovados/17 ignorados,
152 arquivos aprovados/dois ignorados; mesmos skips da baseline, 27 testes
adicionais. Execução completa final após as alterações, sem ajuste de timeout.
Uma execução anterior retornou SQLITE_ERROR em teste MCP inalterado e timeout
na importação fria do SSR; não se repetiram no MCP isolado nem na suíte completa
final. Nenhum teste de backend foi alterado para compensar essas ocorrências.

## Prévia compilada e reversão

Build web com flag `true` aprovado. A prévia Vite do bundle em 3300 foi testada
com API/Auth sintéticos em 3301/15531: um E2E aprovado abriu caso e documento,
conferiu texto integral no leitor, conteúdo do rascunho salvo e a revisão
pendente sem aprová-la. As capturas foram inspecionadas. A inicialização normal
da fixture monta seu banco descartável; a reativação da UI não executa SQL de
reversão ou restauração. O teste usa os registros sintéticos locais da fixture,
sem inferir estado de dados de produção.

Evidência: `build-preview-true.log`, `preview-true-reader.log` e quatro PNGs em
`preview-true-results/`, sob o diretório do ledger. A prévia de entrega é
reconstruída com flag `false`; a variável runtime não alterna um bundle compilado.

Entrega inicial (antes da nova vistoria): `pnpm build` e `pnpm -r run typecheck` aprovados, flag `false`, API
local 3001 e Auth sintético 54321. Os quatro E2E do bundle Vite preview passaram
(rotas antigas, resultados, recursos preservados, axe e menu em tela baixa).
Sete URLs públicas adicionais inspecionadas: HTTP 200, H1 única e zero erros JS.
Capturas desktop/mobile conferidas. SHA256 de `dist/index.html`:
`3D8568271B6EF95DEABCA0D499AE2B81C8FF5C4B4ECECD1F8C05EBBDFFEC0409`.
O manifesto `bundle-false-hashes.json` contém hashes de todos os arquivos do bundle.

Prévia sintética disponível em `http://127.0.0.1:3000`. Login de demonstração:
`fase7@forgelex.test`, senha `senha-controlada-fase-7`. Não usar credenciais reais.
Na entrega inicial, API local em processo 8680 e web em sessão gerenciada 58884;
esses processos foram encerrados para a vistoria. Sessões atuais abaixo.
O estado fica somente na fixture descartável e termina ao encerrar a API.
O URL MCP apresentado na prévia é local; conexão em host externo não foi testada.
Logs: `build-delivery.log`, `typecheck-delivery.log`, `unit-delivery.log`,
`lint-delivery.log`, `preview-false.log` e `public-preview-inspection.json`.

## Revisão e correções verificadas

Revisão automatizada independente encontrou um P2: menu móvel sem rolagem
vertical deixava recursos fora de telas baixas. Teste RED reproduziu
`scrollTop=0`; navegação passou a rolar e cabeçalho/rodapé permanecem fixos.
O teste passou em ambos os modos. A revisão posterior não encontrou problemas
adicionais e não deixou itens sem avaliação; não substitui a decisão de Boni.

O axe identificou contraste insuficiente na data do histórico e no estado de
chave revogada; apenas suas cores foram corrigidas. HTML/OpenGraph/Twitter
iniciais também receberam a nova apresentação. O mock de ApiRequester recebeu
o `status` exigido por seu contrato. As assertions Supabase do Docker foram
preservadas e ampliadas para a flag, e as expectativas de copy foram atualizadas.

Adaptações registradas: suítes antigas de pesquisa/documentos mantêm flag true;
as de MCP/público fixam false e não reutilizam servidor desconhecido. Saídas
Playwright foram isoladas após colisão de traces entre suítes simultâneas.
Uma corrida no teste de pesquisa foi resolvida aguardando a resposta antes de
conferir saldo; todas as assertions funcionais foram mantidas. Tentativas
iniciais com PostgreSQL indisponível e configs de prévia em diretório incorreto
não contam como resultados de produto. Logs de tentativas permanecem disponíveis.

Logs, screenshots e ledger estão em
`.superpowers/sdd/2026-10-11-site-mcp-scope-freeze/`, neste worktree.
Artefatos Playwright ficam em `test-results/`, `temp/playwright-chunk-recovery/`
e no diretório local das prévias. Os resultados finais de cada suíte são os
indicados na tabela, não suas tentativas anteriores.

## Nova vistoria antes de commit e push — 11/10/2026

Solicitada por Boni após a entrega local. HEAD e branch da execução permanecem
os mesmos. A nova inspeção confrontou as quatro etapas e restrições do plano
com o diff completo, navegação, carga operacional e tratamento de callbacks.
Nenhum diff em API, packages, scripts, autenticação, cliente de API, operações,
políticas legais ou lockfile; nenhum arquivo rastreado excluído. O index real
continua vazio. Os 47 hashes protegidos do checkout original foram novamente
conferidos: zero divergências, HEAD original inalterado.

A revisão automatizada independente encontrou apenas um P3 de apresentação:
três textos da Visão geral ainda remetiam à preparação/revisão do caso. No modo
enxuto, agora dizem “Pesquisa jurídica por MCP”, “Conferência das fontes” e
“Fontes e proveniência”; o modo habilitado conserva os textos originais.
Teste RED reproduziu a assertion, e o GREEN padrão passou nos dois modos.
A conferência independente posterior confirmou a correção sem novo achado.

Regressão fresca: 821 testes unitários aprovados, 17 skips anteriores; 152
arquivos aprovados e dois skips anteriores. As 12 configurações da tabela
foram repetidas, totalizando novamente 136 E2E aprovados nos respectivos
modos. Lint passou após a correção dos textos. Nenhuma assertion foi retirada,
nenhum novo skip ou ajuste permanente de timeout foi introduzido.

A primeira rodada unitária herdou a URL da prévia em VITE_FORGELEX_API_URL,
divergindo das expectativas de URL padrão de dois testes inalterados; também
capturou o RED dos textos antes da correção. A rodada completa com ambiente
limpo passou. O primeiro RED isolado teve timeout de importação fria; uma
execução diagnóstica com 15 s confirmou a assertion, e o GREEN usou o padrão.

Durante as suítes simultâneas, a API sintética 3301 da conferência de rascunhos
encerrou inesperadamente: primeiro ECONNREFUSED, seguido de falhas de login.
A execução foi interrompida e os traces mantidos. Repetida sem outra suíte em
paralelo, com fixture nova, a conferência passou nos nove testes; permissões
de IA, lifecycle e pesquisa também passaram. A causa exata da saída da fixture
não foi confirmada; esses resultados não certificam estabilidade do ambiente
local ou runtime de produção. Não houve alteração de backend para compensá-la.

Após a correção, `pnpm build` e `pnpm -r run typecheck` passaram novamente.
Os quatro E2E da prévia do bundle compilado com flag false passaram. Inspeção
adicional confirmou os três textos novos visíveis, seis aliases sem parâmetros
de caso, zero requisições de módulos compilados de casos/fila e zero erros JS.
Capturas da Visão geral em desktop e celular foram inspecionadas.
SHA256 atual de `apps/web/dist/index.html`:
`C6B2DE2B8F316C7D72C12C734FD8BEBFB83350FCFAF2C1C3ED66728924F5C60F`.
Manifesto atual: `bundle-false-hashes.json` no diretório desta vistoria.
Prévia restaurada em `http://127.0.0.1:3000`, com as mesmas credenciais sintéticas;
sessões gerenciadas atuais: API 57361, web 39786. Estado apenas na fixture local.

Logs e resultados desta vistoria: `.superpowers/sdd/2026-10-11-precommit-audit/`;
traces em `test-results/precommit-audit/`. `browser-results.json` registra os
136 resultados finais; `draft-review-interrupted.log` e os traces anteriores
preservam a tentativa interrompida. A vistoria técnica não substitui a avaliação
visual de Boni nem demonstra conexão em hosts reais, PostgreSQL ou produção.
Commit e push continuam não executados.

## Vistoria externa complementar em 11/10

A pedido de Boni, produção publicada, PostgreSQL real somente leitura e hosts
ChatGPT/Claude foram verificados nesta data. A regressão em PostgreSQL
descartável aprovou 39 testes e 55 checks; a conexão gratuita OAuth foi
confirmada nos hosts e correlacionada com logs do runtime. O congelamento
continua local, sem deploy. [Resultados e limites específicos](2026-10-11-site-mcp-external-validation.md).
