# Análise documental do caso — implementação local

Escopo autorizado por Boni em 10/10/2026: **Analisar documentos do caso**.
Checkout `C:\Users\Boni Jr\.antigravity-ide\SDK`, branch
`codex/case-document-analysis`, HEAD-base
`df57c43f85397a8f02670a55560537ff11686cc3`. O conteúdo dessa base era igual a
`origin/main` (`f5f9316dd0255e49029972806fb161963ab4d54a`, PR #65).
Este registro descreve alterações no working tree, ainda sem commit.

## Entrega

Permissão independente de receber análises, desabilitada por padrão, com
objetivo e seleção de versões documentais. O host externo faz a análise e
usa `case.save_analysis`, gratuito, com OAuth, revisão e referências exatas.
O recibo não altera fatos, provas, cronologia ou questões automaticamente.

No site, Boni pode abrir a fonte fixada, editar o texto e incorporar ou
descartar seletivamente. Incorporações mantêm origem e decisão, são atômicas
e não confirmam a veracidade dos fatos. Referências inválidas, fonte
indisponível, permissão revogada e revisão divergente bloqueiam a operação.
API de conferência exige sessão; MCP não pode aprovar a própria proposta.

Migration incremental `persistence-0030-case-document-analysis`, compatível
com SQLite e PostgreSQL. Recibos são eliminados pela exclusão definitiva do
caso e pelo encerramento da conta. Nenhuma tarifa, modelo interno ou fonte
jurisprudencial foi adicionada.

## Verificações locais

- `pnpm exec vitest run`: 821 testes aprovados e 17 ignorados; 154 arquivos
  aprovados e dois ignorados. Exit code zero na suíte geral final.
- Contratos, repositório, MCP/REST e OpenAPI: 27 testes aprovados em quatro
  arquivos na verificação focada final. Identificadores reservados de
  JavaScript foram recusados após reprodução do defeito e correção.
- `pnpm exec playwright test --config playwright.case-ai.config.ts`: nove
  cenários aprovados, incluindo o percurso novo e os oito anteriores de
  contexto/retorno de rascunhos. O novo cenário recebeu pelo MCP, repetiu o
  envio, abriu a fonte, editou e incorporou um fato e descartou uma lacuna.
  Tela pequena sem transbordamento horizontal; axe sem violações nos
  critérios WCAG executados no cenário, sem certificar acessibilidade total.
- `node scripts/smoke-case-analysis-postgres.mjs`: nove checks aprovados em
  PostgreSQL 16 local e isolado: migration, concorrência de recebimento,
  isolamento, referência inválida, rollback, decisões concorrentes,
  cancelamento, revogação e exclusão pela conta. Container temporário
  `forgelex-analysis-postgres` encerrado e removido após o ensaio.
- `pnpm lint`: concluído sem erros no estado final.
- `pnpm typecheck`: build de todos os pacotes/aplicações e verificações de
  tipos concluídos sem erros no estado final.

Os logs locais ficam em `.git/case-analysis-*.log`; não são artefatos
versionados. Dados sintéticos, sem conexão a bancos ou serviços de produção.

## Limites e publicação

Não houve commit, push, integração, migration remota ou deploy nesta tarefa.
Também não houve homologação do novo tool em uma conversa real de ChatGPT
ou Claude; os testes usaram chamadas MCP locais com conexão sintética.
O procedimento de uso e os limites de tamanho, lista e edição constam em
[Analisar documentos do caso](../../product/case-document-analysis.md).
A aprovação do escopo por Boni não constitui execução de publicação nem
aprovação do conteúdo jurídico produzido pelo host externo.
