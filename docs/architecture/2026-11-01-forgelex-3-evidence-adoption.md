# ForgeLex 3 — incorporação probatória revisada

Incremento 4 solicitado por Boni, implementado no worktree local
`codex/forgelex-3-quality`, sobre `025f6dd`. A revisão humana passa a selecionar,
editar, incorporar ou descartar propostas da análise probatória no caso já
vinculado ao trabalho. Nada é selecionado ou aprovado automaticamente.

## Comportamento

Na entrega de **Analisar fatos e provas**, abrir **Revisar itens para incorporar
ao caso**, conferir textos e fontes e selecionar os itens desejados. O botão
**Aprovar e incorporar selecionados** confirma a decisão. Provas exigem que o
fato relacionado já tenha sido incorporado ou seja selecionado no mesmo lote;
a interface não acrescenta esse fato à seleção. Descartes também são explícitos.

Os itens abrangem alegações, provas documentais, eventos, questões, lacunas e
contradições. Relatos entram como `ASSERTED`; conflitos como `DISPUTED`; nunca
como `CONFIRMED`. Datas incertas exigem data de calendário informada na revisão.
Trechos documentais precisam corresponder à versão atual, ao hash, ao offset e
às âncoras existentes. Citações que cruzam parágrafos são divididas entre essas
âncoras; somente espaços e quebras de linha podem ficar entre elas.
Neste incremento, a incorporação revalida documentos selecionados, contexto
escrito e respostas. Referências a outras categorias de fonte bloqueiam o item
para incorporação; não são convertidas em provas documentais nem consultadas
externamente durante a aprovação.

Cada decisão conserva autor, data, texto aprovado, data do evento quando
pertinente, proposta com proveniência e IDs criados. A entrega original e seu
hash permanecem intactos. A cobrança, as reservas e os checkpoints anteriores
não são alterados; a revisão não chama modelo nem pesquisa externa.

## Persistência e controles

- Migration aditiva `persistence-0037-native-evidence-review`: coluna nullable
  `agentic_task_deliveries.evidence_review_json`. Entregas anteriores começam
  sem revisão. Os expurgos existentes continuam removendo a linha inteira.
- Reutilização dos repositórios de fatos, provas, cronologia e questões e do
  escritor compartilhado com a análise OAuth. Os contratos e grants OAuth
  existentes permanecem separados da revisão nativa.
- GET `/api/agentic/deliveries/:id/evidence-review`: sessão, proprietário,
  `research:read`, `matter:read`, execução concluída/contexto atual/caso ativo e
  acesso vigente. Preserva também a fronteira do runtime piloto/comercial.
- POST no sufixo `/decisions`: acrescenta `matter:write`, `approved: true`,
  revisão/token atuais e `commandId` UUID. Não é ferramenta de agente/MCP.
- Locks tenant → conversa → caso → documentos. Criações e decisões pertencem
  à mesma transação, com revalidação de acesso antes do commit. Repetição do
  mesmo comando não duplica dados; concorrência sobre revisão antiga conflita.
- Até 50 decisões por comando, 1.000 propostas e 1.000.000 bytes de revisão;
  excesso falha explicitamente, sem truncamento.

## Validação local

Resultados e hashes estão no
[recibo de validação](evidence/2026-11-01-evidence-adoption-validation.json).

| Verificação                                | Resultado                                                |
| ------------------------------------------ | -------------------------------------------------------- |
| Suíte integral Vitest, um worker           | 1.552 aprovados, zero falhas, 17 condicionais pulados    |
| Rodada PostgreSQL                          | 41 aprovados, cobrindo 16 condicionais da suíte integral |
| Persistência e rotas novas                 | 21 aprovados, incluídos na suíte integral                |
| Smoke PostgreSQL entre processos           | Sete checks aprovados                                    |
| E2E comercial Chromium                     | Três cenários aprovados; rodada final de 40,2 s          |
| Apresentação após inspeção visual          | Oito testes aprovados e build web refeito                |
| Build, tipos, lint e formatação pertinente | Aprovados                                                |

As contagens se sobrepõem. O único condicional não executado é a homologação
paga com provedor real. O upgrade/idempotência da migration está incluído na
suíte integral. O E2E cobre perda da
resposta após commit, repetição sem duplicação, recarga, subconjunto editado,
descarte, navegação ao caso, cobrança/entrega intactas e acessibilidade em 375 px.
Captura do ensaio: [revisão probatória em tela móvel](evidence/2026-11-01-evidence-adoption-mobile.png).

A revisão técnica de IA apontou dois problemas de interface, corrigidos:
identificação da fonte por referência e preservação da incerteza quando um
retry de resposta perdida recebe erro de acesso/conflito. A inspeção visual
posterior identificou um aviso estático que negava incorporações mesmo após a
aprovação. O texto agora informa que a análise não incorpora automaticamente;
os oito testes de apresentação, o build web e o E2E foram revalidados após
essa alteração textual, sem repetir a suíte integral inalterada nos demais módulos.
Testes não constituem
aprovação jurídica de itens reais. Boni continua como único aprovador humano.

## Limites e operação futura

Não foram executados commit, push, integração, deploy, migration remota ou
inferência paga. Nenhum item de caso real foi aprovado durante o desenvolvimento.
Uma publicação futura precisa aplicar a migration 0037 antes da imagem nova;
a coluna é aditiva e pode permanecer caso a imagem seja revertida. A avaliação
semântica jurídica com modelo real continua distinta dos ensaios sintéticos.
