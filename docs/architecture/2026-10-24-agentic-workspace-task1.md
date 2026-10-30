# Tarefa 1 — contrato e persistência da execução

Autorização: Boni pediu a próxima etapa após confirmar `a7d8832`, em
24/10/2026. Recorte: Tarefa 1 do
[plano canônico](../superpowers/plans/2026-10-10-agentic-workspace-transition.md).
Base: `a7d883218a15674b63b2b0336cf0aa3877fdecca`, branch
`codex/agent-contracts-a0`, worktree `analise-release/SDK`.

## Implementação

- `packages/domain/src/contracts/agentic-workspace.ts`: schemas e tipos de
  contexto, conversa, mensagem, execução, evento, pergunta e resposta.
- `packages/persistence/src/repositories/agentic-workspace-repository.ts`:
  interfaces propostas, leitura do diálogo, perguntas, respostas e correções.
- Exports, schema Drizzle e migration `persistence-0031-agentic-workspace`:
  cinco tabelas aditivas de conversas, snapshots, mensagens, execuções e eventos.
- Testes de domínio/persistência e smoke PostgreSQL temporário:
  `pnpm test:postgres:agentic` (requer Docker e imagem `postgres:16-alpine`).

O contexto somente escrito dispensa caso/documentos. Referências documentais
exigem caso do mesmo tenant, documento ativo e versão existente daquele documento.
O repositório recebe identidade já autenticada pelo servidor e a compara com o
dono da conversa/execução; não autentica tokens nem substitui autorização de tools.

Revisões, mensagens e leituras completas do diálogo são serializadas por conversa
em transação com bloqueio da linha. Isso impede misturar revisão e snapshots
concorrentes, inclusive no isolamento padrão READ COMMITTED do PostgreSQL. Execuções usam
chave idempotente por tenant/usuário e hash do input validado; mudança do payload
gera conflito. Eventos têm sequência persistida e índice único por execução.
Snapshots, perguntas, respostas e entregas anteriores são preservados.

Cada execução consome um snapshot completo: uma revisão marca as execuções da
conversa como `requiresReevaluation`, expira perguntas e preserva os IDs de entregas.
Não se permite iniciar/concluir execução contra snapshot superado. O serviço
posterior deve reavaliar o trabalho dependente e criar execução sucessora usando
a revisão nova; este repositório registra a necessidade, sem executar inferência.
Correções de respostas rejeitam versões de pergunta já substituídas e validam
pergunta/versionamento originais e revisão atual,
acrescentando mensagem e snapshot sem apagar a resposta anterior. Todo snapshot
gerado é validado antes de persistir; exceder o limite de respostas causa rollback
da operação inteira, mantendo o diálogo legível.

## Evidência por critério

| Critério do plano                | Evidência executada                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolamento de duas contas        | Testes de tenant e de usuário para conversas, execuções, eventos e escritas; smoke em duas conexões PostgreSQL                                              |
| Sequência e idempotência         | Replay e conflito de payload nos unitários; 8 criações concorrentes resultam em um ID; 20 eventos concorrentes resultam na sequência 1–20 no PostgreSQL     |
| Contexto somente escrito         | Origem `USER`, snapshots sem anexos e tabela `legal_documents` vazia, inclusive no smoke                                                                    |
| Perguntas, respostas e reconexão | Seleção única, múltipla, texto livre e desconhecimento; reconstrução por nova instância e por processo Node separado                                        |
| Expiração e correção             | Opções alheias, versão/revisão incorreta, seleção dupla e unknown contraditório rejeitados; histórico e entregas preservados com sinalização de reavaliação |
| Tabelas aditivas e snapshots     | Migration 0031 aplicada duas vezes sem duplicar no smoke PostgreSQL; testes de referências reais                                                            |
| Recuperação PostgreSQL           | Conexões originais fechadas; processo filho recupera contexto, diálogo, eventos, checkpoint e entregas e cria execução na revisão nova                      |
| Build, testes e smoke            | `pnpm build`, typecheck dos dois pacotes, ESLint dos arquivos alterados e 20 testes focados aprovados; smoke PostgreSQL aprovado                            |

## Revisão e regressão

Revisão técnica independente por IA encontrou três problemas: snapshot gerado
sem validação completa, correção de versão de pergunta substituída e leitura
que misturava revisões concorrentes. Os três foram reproduzidos antes da
correção: dois testes unitários falharam por aceitar a operação inválida; o
smoke PostgreSQL concorrente devolveu revisão 1 com snapshot da revisão 2.
Após correção, 20 testes focados e o smoke passaram. O smoke verifica agora
60 leituras concorrentes durante 20 revisões de contexto, além das verificações
anteriores e recuperação por processo separado.

A primeira regressão integral teve 1002 testes aprovados, 18 ignorados e dois
timeouts de 5000 ms em testes existentes de webhooks e ciclo de vida. Não houve
mudança nesses testes. Reexecução isolada dos dois arquivos: 6 testes aprovados.
Regressão integral final: `pnpm exec vitest run --maxWorkers=1` aprovado,
179 arquivos aprovados e 3 ignorados; 1006 testes aprovados e 18 ignorados,
sem falhas. Nenhum teste ou timeout foi alterado para obter esse resultado.
Typecheck de todos os pacotes do workspace aprovado; após as correções, rebuild
e typecheck de persistência e ESLint de domínio/persistência aprovados.

## Limites e continuidade

Não foram criadas rotas, workers, chamadas de modelo, reservas financeiras,
capabilities MCP ou interface. IDs de autorização/reserva e provider/modelo são
referências anuláveis, sem escolha comercial nem permissão automática de execução.
O diálogo não concede acesso, orçamento, adoção de fatos ou aprovação jurídica.
Checkpoint é estado operacional serializável, sem cadeia privada de raciocínio
ou promessa de restaurar memória privada de SDK.

O smoke cria seu próprio container/banco PostgreSQL com dados sintéticos, verifica
concorrência e outro processo, e remove o container ao final. Não utiliza bancos
de outros projetos nem configurações de produção.

Antes de expor o módulo nas tarefas seguintes, integrar autorização/revogação,
projeção pública e retenção/expurgo dessas novas tabelas aos fluxos existentes.
O repositório desta etapa é interno; não há transporte novo recebendo dados reais.
As tarefas 2–7 continuam pendentes. Não houve commit, push, migration em banco
existente/remoto, integração, inferência paga ou deploy.
