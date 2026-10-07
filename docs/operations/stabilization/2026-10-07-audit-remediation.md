# Execução das recomendações da auditoria — 07/10/2026

Autorização: “Vamos executar as recomendações”. Base `8ba33e0`, branch
`codex/audit-remediation`, worktree `document-reader/SDK`. O checkout antigo
`.antigravity-ide/SDK` permanece separado. Nenhum saldo ou registro de conta
foi alterado nesta classificação.

## Entregas e evidências locais

- Lifecycle: RED ao trocar filtro com POST pendente; bloqueio dos filtros de
  casos/documentos; GREEN 5/5. Não se atribui com certeza a falha do runner Linux
  37670562857 a essa corrida. CI agora preserva traces/contexto em falha.
- Vitest: cópias ignoradas em `tmp` entravam na descoberta; exclusão adicionada,
  preservando os testes legítimos, inclusive `tests` e `scripts`.
- Dependências: dois advisories corrigidos; CSS idêntico antes/depois; `braces`
  permanece vulnerável e está explicitamente acompanhado.
- Pesquisa → Caso: preservação integral da fonte RED/GREEN; ação ausente RED;
  salvar/deduplicar/arquivar GREEN; suíte research 10/10. Complemento mobile
  390px, zero violações Axe no diálogo, cópia e seletor da tese: 1/1.
- Retenção: inspeção RED/GREEN, comando com gate explícito RED/GREEN: 6/6.
  Inspeção PostgreSQL remota em transação somente leitura concluída. Smoke de
  inspeção/expurgo em banco PostgreSQL exclusivo adicionado ao job da CI.
- `pnpm test`: build e 764 testes aprovados, 17 ignorados, 148 arquivos aprovados
  e 2 ignorados. Testes ignorados não constituem prova. Lint e build web/API
  aprovados. Os gates remotos da entrega serão registrados separadamente.

## Classificação da reserva histórica

Leitura agregada em 07/10/2026, 20:42:44 UTC: uma operação PENDING, 20 centavos,
criada em 21/09 às 03:46:10 UTC; lease vencido e fingerprint ausente. Zero leases
ativos e zero débitos associados à chave dessa operação no ledger. A regra de
reserva disponível considera apenas leases válidos. A pendência é histórica;
não foi demonstrada cobrança duplicada ou bloqueio de saldo. Não houve estorno,
mudança de status, preenchimento de fingerprint ou exclusão de prova.

## Retenção e acompanhamento

Contagens de elegibilidade na mesma medição: histórico 0, snapshots 0, corpos
de webhook 0, corpos financeiros 0, auditoria 0, recibos de encerramento 0.
Isso é um retrato da data, não prova de expurgo ativo ou ausência futura de
registros vencidos. O worker permanece desligado; o comando inspeciona por
padrão e exige flag específica para `--apply`.

Scheduler de encerramentos existente confirmado: serviço privado com IAM,
sem `allUsers`. Escolha desta entrega: CLI em Cloud Run Job, com identidade
autenticada, evitando acrescentar endpoint na API pública. A inspeção pode ser
agendada separadamente da autorização de exclusão.

Automação `forgelex-acompanhamento-operacional` atualizada pela ferramenta do
app: preservados ID, thread, status ativo e frequência diária 15h; passou a
consultar main em `draft-review/SDK`, `PENDENCIAS.md`, continuidade/status e o
runtime efetivamente publicado. Silêncio quando não houver mudança acionável.

## Limites humanos e decisões de execução

O aceite documental da Fase 4C não equivale à comprovação operacional. Roteiro
de suporte e matriz fiscal/privacidade/comércio eletrônico preparados em
[comprovações operacionais](2026-10-07-operational-proof-checklist.md).
Não foram fabricadas assinaturas, pareceres, contratação de cláusulas,
atendimento humano ou nomes de revisores.

Decisões no escopo aprovado: reaproveitar APIs/storage; preservar CaseLaw
original; CLI em vez de nova rota de retenção; corrigir somente overrides
compatíveis e acompanhar braces; evitar mudanças de ledger sem defeito
demonstrado. Se a escolha de CLI precisar mudar, o custo é adaptar o disparo
autenticado, sem mudar a política ou a interface do produto.

Integração, CI final, digest/tráfego e job operacional devem ser comprovados
antes de atualizar as linhas correspondentes de `PENDENCIAS.md` para publicado.
