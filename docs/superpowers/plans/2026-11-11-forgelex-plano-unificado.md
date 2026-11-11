# ForgeLex — Plano unificado de execução

**Versão 3 · 11 de novembro de 2026 · Elaborado para aprovação de Boni**

> Este é o único plano vigente do ForgeLex. Ele substitui o plano v2 da Mesa guiada (10/11/2026), cujo conteúdo foi
> incorporado aqui, e o plano de reestruturação visual e integração com o Ratione elaborado em 09/11/2026 fora do
> repositório. Os planos anteriores em `docs/superpowers/plans/` permanecem como histórico e não abrem tarefas novas.
> Boni é o único avaliador e aprovador humano ([AGENTS.md](../../../AGENTS.md)). Cada etapa só começa com a
> autorização dele, e commit, push, migração e deploy seguem o escopo que ele conceder.

## 0. Como usar este plano

1. **Uma etapa por vez, uma PR por etapa.** Cada etapa tem objetivo, dependências, arquivos, passos, verificação,
   aceite e reversão. Uma PR não mistura frentes.
2. **Nada muda para o cliente sem flag.** Fluxo novo, tema novo e domínio novo entram desligados ou em paralelo ao
   atual, e são ligados por configuração, com reversão pela mesma configuração.
3. **Registro único de execução.** Toda etapa concluída registra HEAD, arquivos, comandos, resultados e riscos
   residuais em [`docs/architecture/2026-11-10-mesa-guiada-execucao.md`](../../architecture/2026-11-10-mesa-guiada-execucao.md),
   numa seção com o código da etapa (E1, V0, D1…). Não criar novo arquivo de registro, plano ou checklist.
4. **Estado publicado** continua em `PENDENCIAS.md` (seção “Estado publicado atual”), atualizado a cada deploy.
5. **Marcar o progresso aqui.** Ao concluir uma etapa, marcar os itens `[x]` e acrescentar uma linha de evidência com
   link para a seção do registro. Uma decisão nova de Boni entra na seção 2, com data.
6. **Publicações de risco separadas.** A troca de tema (V6) e a virada de domínio (D3/D4) nunca saem na mesma
   publicação nem na mesma semana.

## 1. Ponto de partida

| Item                         | Situação em 11/11/2026                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`                       | `df8c714` (PR #137). 30 commits após `a44035e`, quase todos da Mesa guiada.                                                                                                                                                        |
| Verificação local            | Build, tipos, lint e Prettier aprovados. Vitest: 2.014 aprovados e 17 ignorados (dependem de PostgreSQL). Playwright: 6/6 da orientação e 37/37 da Mesa e revisão (este último exige ambiente com locale UTF-8; ver E7).           |
| Não verificado nesta revisão | Ensaios PostgreSQL, demais suítes Playwright, produção.                                                                                                                                                                            |
| Produção documentada         | `5757733` em `PENDENCIAS.md`. Os PRs #132 a #137 foram integrados depois e não têm registro de publicação.                                                                                                                         |
| Flags                        | Mesa agêntica, casos e pesquisa salva com padrão `false` no `cloudbuild.yaml`. `FORGELEX_DESK_GUIDANCE_ENABLED` e `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED` não aparecem em `ops/gcp`.                                                |
| Visual atual                 | Paleta `ivory`, `cognac`, `champagne` e tons `stone` do Tailwind; Georgia e Inter. Uso medido: 824 classes `stone`, 243 `cognac`, 96 `champagne`, 10 `ivory`, 79 `amber`, 50 `emerald` e 48 cores hexadecimais literais em `.tsx`. |
| Domínio atual                | `nexojuris.ia.br` (produção) e `hml.nexojuris.ia.br`. 165 referências no repositório, em código, testes, ops e documentação.                                                                                                       |

## 2. Decisões de Boni

Em 11/11/2026 Boni decidiu todas as questões abaixo, exceto o arquivamento dos planos antigos (DEC-9), que está em andamento fora deste plano. A coluna “Recomendação” guarda o texto da decisão; uma decisão nova entra aqui, com data.

| ID     | Decisão                                                                                                 | Recomendação                                                                                                                                                                                                                                                                                                                                                                     | Bloqueia           |
| ------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| DEC-1  | Nome exato do domínio novo e do subdomínio de homologação                                               | **Decidido por Boni em 11/11/2026:** marca “ForgeLex”, domínio `forgelex.com.br` no Registro.br, homologação em `hml.forgelex.com.br`. Sem reserva de grafia alternativa                                                                                                                                                                                                         | D2 em diante       |
| DEC-2  | Paleta do tema novo                                                                                     | **Decidido por Boni em 11/11/2026:** branco gelo com petróleo, conforme o protótipo de 09/11 (seção 7.1). Substitui a diretriz do v2 de preservar `ivory`, `cognac` e `champagne`                                                                                                                                                                                                | Nada               |
| DEC-3  | Tipografia                                                                                              | **Decidido por Boni em 11/11/2026:** Spectral (títulos e texto jurídico) e Inter (interface), hospedadas no próprio site, sem dependência de terceiros                                                                                                                                                                                                                           | V1                 |
| DEC-4  | Origem do catálogo de habilidades                                                                       | **Decidido por Boni em 11/11/2026:** manter e incorporar as 2.077 fichas capturadas (MinutaIA), com origem e hash registrados. Substitui a recomendação de catálogo próprio                                                                                                                                                                                                      | Nada (M3 liberada) |
| DEC-5  | Reserva de R$ 11,50 por trabalho comercial (PR #135, antes R$ 5,00)                                     | **Decidido por Boni em 11/11/2026:** manter R$ 11,50. Aumento já autorizado até R$ 20,00, se necessário, com nova política de preço versionada e exibida na Conta e na confirmação de custo. Acima de R$ 20,00 exige nova decisão                                                                                                                                                | M1                 |
| DEC-6  | Tarifa da análise de aderência na busca ancorada                                                        | **Decidido por Boni em 11/11/2026:** gerar a frase de aderência na mesma chamada da pesquisa, sem tarifa adicional, enquanto o uso real é medido                                                                                                                                                                                                                                 | M4                 |
| DEC-7  | Título principal e posicionamento do site público                                                       | **Decidido por Boni em 11/11/2026:** todo o frontend e a parte externa do site se adaptam ao modelo MCP originário (a IA do cliente conectada ao ForgeLex, mais a Mesa). O título novo é escolhido na V5A entre propostas escritas por mim; até lá vale o título atual, travado em `tests/public-copy.test.ts`                                                                   | V5A                |
| DEC-8  | Destino do Ratione (`ratione.nexojuris.ia.br`) na troca de domínio                                      | **Decidido por Boni em 11/11/2026:** por ora o Ratione continua em `ratione.nexojuris.ia.br`. O domínio `nexojuris.ia.br` e esse subdomínio permanecem ativos e renovados; a troca de domínio não os toca                                                                                                                                                                        | D5 e Frente R      |
| DEC-9  | Arquivamento dos planos antigos de `docs/superpowers/plans/`                                            | Boni informa que o Claude Code já está fazendo o arquivamento. Em 11/11/2026 não havia essa mudança em `main` nem em branch remota; a E6 só confere o resultado e atualiza os links, ou executa se ainda faltar                                                                                                                                                                  | E6                 |
| DEC-10 | Mesa: peça e matéria em uso, sem lista exposta                                                          | **Decidido por Boni em 11/11/2026:** a Mesa mostra expressamente só a peça e a matéria que serão usadas naquele momento, nunca uma lista do catálogo. O cliente chega a elas por grande área, por texto livre e, depois, pela leitura de um PDF anexado. Conteúdo, IDs e hashes das fichas continuam ocultos. Revisa a decisão do v2 de manter Forma e Matéria só nos bastidores | Nada (U3 liberada) |
| DEC-11 | Modo de piloto fechado (`closedPilot`, `ClosedPilotPanel`, `closed-pilot*.ts`, `task6-homologation.ts`) | **Decidido por Boni em 11/11/2026:** manter enquanto servir a testes. Fica isolado fora da Mesa nova e é reavaliado ao fim da Frente U                                                                                                                                                                                                                                           | Nada               |
| DEC-12 | Anexos: guardar o arquivo original ou só o texto extraído                                               | **Decidido por Boni em 11/11/2026:** guardar só o texto, como na importação de PDF atual (a especificação de 03/10/2026 deixou a retenção do original para avaliação posterior)                                                                                                                                                                                                  | U5                 |
| DEC-13 | Motor de OCR                                                                                            | **Decidido por Boni em 11/11/2026:** OCR no navegador (Tesseract.js, idioma português), sem enviar o arquivo ao servidor, preservando a promessa atual de que a extração ocorre no navegador. OCR no servidor só se a qualidade não bastar, com decisão própria sobre custo e retenção                                                                                           | U6                 |
| DEC-14 | Tela “Casos” (`/app/casos`, `MatterWorkspaceScreen`)                                                    | **Decidido por Boni em 11/11/2026:** a tela é dispensável e sai, mas só depois de a Mesa absorver o que ela faz (criar e renomear caso, arquivar, restaurar e excluir caso e documento, importar PDF), porque o caso continua sendo o eixo da Mesa, da busca ancorada (M4) e das ferramentas MCP. Etapa U7                                                                       | U7                 |

## 3. O que já está concluído (herdado do v2)

O plano v2 definiu a Mesa guiada: perguntas objetivas com opção “Não sei”, seleção interna de habilidades no
servidor, nada do catálogo exposto ao usuário. As etapas abaixo têm código e validação local registrados.
Os contratos, princípios e critérios A01–A19 continuam valendo e estão no Apêndice A.

| Etapa v2 | Entrega                                                                             | Situação                                                               |
| -------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| R0       | Baseline e protocolo v11 opt-in                                                     | Concluída                                                              |
| R1       | Inventário técnico das 2.077 fichas (303 Forma, 1.774 Matéria), fora do repositório | Concluída. Incorporação em M3                                          |
| R2       | Contratos `desk-guidance`, `GuidanceSnapshot`, `SkillBinding` e hashes              | Concluída                                                              |
| R3       | Orientação persistida antes da inferência, rotas `/api/agentic/guidance`            | Concluída                                                              |
| R4       | Seleção única da Mesa e URL (`desk-selection.ts`, `desk-location.ts`)               | Concluída. Defeito de compatibilidade em E2                            |
| R5       | Resolvedor e vínculo de habilidades                                                 | Concluída com fichas sintéticas                                        |
| R6       | `GuidedQuestion`, `GuidanceSummary`, `GuidancePanel`                                | Concluída. Aceite visual migra para V3                                 |
| R7       | Interpretação no fluxo agêntico e hipótese confirmável                              | Concluída                                                              |
| R8       | Edição delimitada sobre versão e hash (protocolo v12)                               | Concluída                                                              |
| R9       | Pesquisa salva e fontes na Mesa                                                     | Concluída. Base da busca ancorada (M4)                                 |
| R10      | Revisão, aprovação e histórico na Mesa                                              | Concluída                                                              |
| R11      | Salvamento atômico com recibo (`persistence-0041-draft-save-commands`)              | Concluída em código. Migração manual pendente (E4)                     |
| R12      | Manifesto real, contexto medido e controles financeiros                             | Concluída                                                              |
| R13      | Regressão integrada e exposição pública                                             | Concluída localmente                                                   |
| R14      | Piloto Penal e regressão Cível                                                      | Técnica concluída com fichas sintéticas. Incorporação vai para M3      |
| R15      | Expansão por área                                                                   | Suspensa por decisão de 11/11/2026. Passa a ser o ciclo de lotes da M3 |

## 4. Frentes e ordem

```mermaid
flowchart LR
    E["E · Estabilização"] --> M1["M1 Publicar código com flags desligadas"]
    M1 --> M2["M2 Homologar Mesa guiada"]
    M1 --> V0["V0 Tokens sem mudança visual"]
    V0 --> V1["V1 Tema, fontes e primitivos"]
    V1 --> V2["V2 Casca e site público"]
    V2 --> V3["V3 Mesa"]
    M2 --> V3
    V3 --> M4["M4 Busca ancorada no caso"]
    V3 --> V4["V4 Jurisprudência e fontes"]
    M4 --> V4
    V4 --> V5["V5 Casos, Conectar e Conta"]
    V5 --> V5A["V5A Site público no modelo MCP e Mesa"]
    M2 --> V5A
    U6 --> V5A
    V5A --> V6["V6 Ligar o tema novo"]
    V6 --> V7["V7 Limpeza do tema antigo"]
    E --> D0["D0 Decidir e inventariar domínio"]
    D0 --> D1["D1 Código com domínio configurável"]
    D1 --> D2["D2 Homologação no domínio novo"]
    D2 --> D3["D3 Produção nos dois domínios"]
    D3 --> D4["D4 Redirecionar o site"]
    D4 --> D5["D5 Encerrar o uso do domínio antigo"]
    M1 --> M3["M3 Catálogo: mapa, incorporação e cruzamento"]
    M1 --> U0["U0 Inventário da Mesa"]
    U0 --> U1["U1 Remover duplicidade e código morto"]
    U1 --> U2["U2 Nova estrutura da Mesa"]
    M3 --> U3["U3 Peça e matéria na Mesa"]
    U2 --> U3
    U3 --> U4["U4 Ações: voltar, alterar, excluir, adicionar"]
    U4 --> U5["U5 Anexos"]
    U5 --> U6["U6 OCR"]
    V3 --> U7["U7 Absorver Casos na Mesa"]
    U6 --> U7
    U7 --> V5
    U4 --> V3
    V3 --> M5["M5 Selo de terceira origem"]
    M5 --> R["R · Ratione"]
    V6 --> R
```

As Frentes V, D e U andam em paralelo depois de E, mas a estrutura da Mesa (U) vem antes do visual da Mesa (V3),
para não pintar uma tela que será reorganizada. A sequência sugerida, sem prazo fixo: E, M1, V0, D0, D1, U0, U1,
V1, M2, M3, U2, U3, U4, V2, D2, U5, U6, V3, U7, M4, V4, D3, D4, V5, V5A, V6, V7, D5. A Frente R só começa quando V6 estiver
estável.

## 5. Etapa E — estabilização

Objetivo: corrigir os defeitos da revisão de 11/11 e alinhar documentação e operação ao código antes de qualquer
mudança de produto.

### E1 — Registrar o estado publicado real

- [ ] Ler a revisão ativa dos serviços `forgelex-api-prod` e `forgelex-closure-hml-private` (`FORGELEX_SOURCE_SHA`).
- [ ] Atualizar a seção “Estado publicado atual” de `PENDENCIAS.md` e reescrever como “publicado” ou “integrado, não
      publicado” as linhas que ainda dizem “ainda não publicado” para os PRs #132 a #135.
- [ ] Registrar o padrão efetivo das flags de produção e homologação.

**Aceite.** `PENDENCIAS.md` descreve exatamente o que está no ar. **Reversão.** Não se aplica.

### E2 — URL da Mesa em navegadores sem `URLSearchParams.size`

Defeito: `apps/web/src/navigation/desk-location.ts:32` decide pela propriedade `query.size`, ausente no Safari e iOS
anteriores ao 17 e no Chrome anterior ao 113. Nesses navegadores a URL sai sem caso, peça e conversa, e recarregar ou
voltar perde a seleção. O mesmo padrão existe em `apps/web/src/navigation/routes.ts:80`, que descarta os parâmetros
de retorno.

- [ ] Teste que remove `size` de `URLSearchParams.prototype` e confere `deskLocation` e a preservação em `routes.ts`.
- [ ] Trocar a decisão por `query.toString()` (string vazia quando não há parâmetros) e fazer o mesmo em `routes.ts`.
- [ ] Procurar outros usos de API recente sem fallback (`rg "\.size\b|structuredClone|Array\.prototype\.at"` no web).

**Verificação.** `desk-location.test.ts`, testes de rotas, `playwright.writing-desk.config.ts`.
**Aceite.** URL idêntica com e sem a propriedade. **Reversão.** Reverter o commit.

### E3 — Verificação periódica da chave do provedor

Defeito: `ProviderKeyMonitor` só consulta a OpenAI quando alguém acessa `/readyz`, e nada no repositório chama
`/readyz` periodicamente em produção (só o deploy). O alerta `provider.key_invalid` pode nunca disparar.

- [ ] Conferir no Cloud Run se há sonda de prontidão ou de vida apontando para `/readyz`.
- [ ] Se não houver, criar `ops/gcp/production/provision-readiness-check.ps1` com Cloud Monitoring Uptime Check (ou
      Cloud Scheduler) chamando `/readyz` a cada 5 minutos, idempotente e com remoção documentada.
- [ ] Ensaio em homologação com chave inválida, confirmando o log e o e-mail do alerta.
- [ ] Documentar em `ops/gcp/production/README.md`, na seção do alerta já existente.

**Aceite.** Uma chave inválida gera alerta em até 15 minutos sem ação de cliente. **Reversão.** Remover a checagem.

### E4 — Flags e migração da Mesa guiada no roteiro de deploy

- [ ] Declarar `FORGELEX_DESK_GUIDANCE_ENABLED=false` e `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED=false` no
      `cloudbuild.yaml` e nos scripts de deploy, com o mesmo tratamento das demais flags.
- [ ] Incluir no `ops/gcp/production/README.md` a ordem obrigatória: migração `0041` (procedimento em
      [`draft-save-recovery.md`](../../operations/draft-save-recovery.md)) antes de ligar
      `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED`. A API recusa subir com a flag ligada e sem a tabela; isso é intencional.

**Aceite.** Deploy com valores explícitos e roteiro com a ordem. **Reversão.** Flags em `false`.

### E5 — Área digitada no resumo da orientação

Defeito: quando o usuário escreve a área em vez de escolher uma opção, a resposta vira `unknown` e o resumo mostra
“Área a definir”. Só o texto livre da tarefa reaparece como `description` em `guidance-service.ts`.

- [ ] Teste no serviço: resposta de área com texto livre aparece na projeção pública.
- [ ] Projetar o texto livre mais recente de cada campo (`detail`) a partir das mensagens, sem alterar o snapshot nem
      o `guidanceHash`.
- [ ] Exibir em `GuidanceSummary` (“Área: previdenciário, a confirmar”).

**Aceite.** O que o usuário escreveu aparece no resumo, e o estado continua `unknown` até a confirmação.
**Reversão.** Reverter o commit; o snapshot não muda.

### E6 — Higiene documental

- [ ] Com DEC-9, mover os planos concluídos de `docs/superpowers/plans/` para `docs/historico/planos/` e atualizar
      os links (`rg -l "superpowers/plans"`).
- [ ] Atualizar o link do registro de execução para este plano.

### E7 — Robustez dos testes de interface

- [ ] Definir `LANG=C.UTF-8` e `LC_ALL=C.UTF-8` nos jobs Playwright da CI e documentar em `README.md`. Sem isso,
      Chromium em Linux nomeia como `download` o arquivo de título acentuado e o teste de exportação Word falha.

**Verificação da etapa E.** `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run`,
`pnpm exec playwright test --config playwright.writing-desk.config.ts` e `--config playwright.desk-guidance.config.ts`.

## 6. Frente M — Mesa guiada: fechamento e busca ancorada

### M1 — Publicar o código integrado com flags desligadas

Depende de E1, E4 e DEC-5.

- [ ] Deploy de `main` (com E) por `deploy-from-main.ps1`, flags da Mesa guiada e do salvamento desligadas.
- [ ] Conferir no `mcp.call` o efeito do #132 (chave de idempotência em `required`) no Claude e no ChatGPT, e o piso
      de 5 decisões por pesquisa.
- [ ] Conferir a reserva de R$ 11,50 numa execução comercial de teste e a mensagem de saldo insuficiente.

**Aceite.** Produção sem mudança visível para o cliente, exceto o que DEC-5 aprovar. **Reversão.** Tráfego para a
revisão anterior (`--to-revisions=...=100`).

### M2 — Homologar a Mesa guiada (A18)

- [ ] Aplicar a migração `0041` em homologação, com backup registrado.
- [ ] Ligar `FORGELEX_DESK_GUIDANCE_ENABLED` e `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED` em homologação.
- [ ] Percorrer: pedido completo, “Me ajude a começar”, “Não sei”, correção pelo resumo, duas abas, recarga, criação,
      revisão sem nova versão, edição delimitada, pesquisa salva, salvamento com perda de resposta simulada.
- [ ] Registrar o resultado funcional. O aceite visual (A19) passa a ser feito em V3, no tema novo.

**Aceite.** A18 registrado em homologação. Ligar em produção é decisão separada de Boni, depois de V3.

### M3 — Catálogo de habilidades: mapa, incorporação e cruzamento

Decisão de Boni (DEC-4, 11/11/2026): as 2.077 fichas originais (303 Forma, 1.774 Matéria) são mantidas e incorporadas
como estão. A revisão é um cruzamento de dados em massa; só os alertas chegam a Boni. O R1 já validou o ZIP, o
manifesto, as contagens e os hashes. Todas as fichas ficam no catálogo, mas o resolvedor só seleciona as `elegível`.

**M3.0 — Mapa de correspondência.** O resolvedor (`skill-resolver.ts`) exige igualdade exata: Forma por área e tipo de
peça; Matéria por área e tópico. As fichas não trazem essas chaves prontas, então elas são geradas e conferidas antes
de qualquer incorporação.

- [ ] Gerar por script (`scripts/skills/map-catalog.mjs`) a tabela `stableId → área da Mesa, tipo de peça ou tópico`,
      a partir de `materia`, caminho, título e `triggers`, com relatório de cobertura.
- [ ] **Forma:** as 303 fichas não têm área. Atribuir uma ou mais áreas da Mesa a cada uma. Como o catálogo hoje aceita
      uma só área por ficha, avaliar o contrato `areas` (lista) em `skill-catalog.ts`, com testes. Desambiguar
      `notificacao-extrajudicial` e `notificacao-extrajudicial-civel`, que compartilham o mesmo tipo e hoje gerariam
      `FORM_CONFLICT`.
- [ ] **Matéria:** usar o `stableId` como tópico (único; evita depender das 655 subáreas, e 580 fichas não têm subárea
      no caminho). A classificação das questões do caso escolhe entre candidatos pré-filtrados por área e `triggers`;
      o resolvedor continua exigindo igualdade exata. Escrever os testes dessa classificação.
- [ ] **Vocabulário de área:** as grandes áreas da Mesa passam a ser as das próprias fichas (25: `civil`,
      `processo-civil`, `penal`, `processo-penal`, `constitucional`, `administrativo`, `tributario`, `trabalho`,
      `previdenciario`, `consumidor`, `empresarial`…), no lugar das seis atuais (`penal`, `civel`, `trabalhista`,
      `administrativo`, `tributario`, `outra`). A Matéria dispensa tabela de conversão. Boni pode agrupar áreas
      próximas depois, sem mexer nas fichas. A mudança alcança o contrato `desk-guidance` e `guidance-rules.ts`.
- [ ] **Orçamento de contexto:** a ficha mediana tem 9,3 KB, 34 fichas passam de 15 KB, e hoje o excesso devolve
      seleção vazia (`SKILL_BUDGET_EXCEEDED`). Definir o limite por papel com fichas reais e avaliar seleção parcial
      (Forma primeiro, depois Matéria por relevância) com limitação registrada.
- [ ] Fichas sem mapeamento claro entram numa fila de ambíguas. Nenhuma ficha fica sem resultado.

**Aceite da M3.0.** As 2.077 fichas têm resultado de mapeamento (mapeada ou na fila), sem chave duplicada.

**M3.1 — Incorporação.**

- [ ] Definir onde o conteúdo fica (fora dos assets públicos e do bundle do navegador), como o servidor o carrega e
      como a versão do catálogo é fixada por execução.
- [ ] Gravar em cada ficha a origem (MinutaIA), a versão original, o hash original e a data da decisão. Descrever
      apenas condições de reutilização que existam de fato, sem criar exigência de terceiro.
- [ ] Estado de revisão por ficha: `pendente`, `em revisão`, `ajustada`, `elegível`, `inelegível`, `adiada`.
- [ ] Resolvedor ignora fichas fora de `elegível` e registra na seleção a versão do catálogo.
- [ ] Manter `tests/fixtures/desk-pilot-revised/*` e as fichas sintéticas dos testes de regressão.

**M3.2 — Cruzamento em massa (aprovado por Boni em 11/11/2026).** Sem leitura ficha a ficha.

- [ ] Script que extrai de cada ficha as referências (artigos, súmulas, precedentes) e confere existência e vigência
      no texto oficial e no índice do STJ do ForgeLex.
- [ ] Comparar fichas do mesmo tema para achar contradição entre Forma e Matéria (como na `resposta-acusacao` contra a
      ficha de cadeia de custódia).
- [ ] Relatório com uma marcação por ficha: sem alerta ou com alerta, e o tipo. Fichas sem alerta ficam `elegível`,
      marcadas como cruzadas. Fichas com alerta vão para a fila.
- [ ] Boni olha só a fila, em lotes de alertas por área de maior uso. Para cada ficha decide manter, ajustar (só aí
      nasce nova versão, preservando a original) ou excluir. Registrar decisão e data no registro de execução.
- [ ] O cruzamento não detecta tese exagerada ou generalizada, defeito encontrado nas quatro fichas conferidas à mão.
      Cobrir esse risco incluindo na fila as fichas mais selecionadas nos casos reais.

**M3.3 — Lote 0 (piloto).** As quatro fichas do `penal-civel-r15-v1` (`resposta-acusacao`,
`cadeia-custodia-cpp-158`, `contestacao-civel`, `adimplemento-pagamento-cc-304`) com os ajustes da
[conferência amostral](../architecture/2026-11-10-mesa-guiada-execucao.md#avaliação-das-quatro-fichas-capturadas).
O piloto Penal e a regressão Cível (R14) são repetidos com o catálogo incorporado. A R15 (expansão por área) passa a
ser a ampliação da elegibilidade por esse cruzamento e reabre por nova decisão de Boni.

**Aceite.** 2.077 fichas incorporadas, mapeadas e rastreáveis, sem exposição de conteúdo, ID ou hash na interface
(A02, revisado). Lote 0 e regressão aprovados por Boni. **Reversão.** Catálogo versionado: voltar à versão anterior
preserva as execuções já registradas.

## 6A. Frente U — Mesa: estrutura, ações e anexos

Objetivo: uma só Mesa, organizada como as interfaces de conversa modernas (Claude, ChatGPT), em que o cliente chega à
peça (Forma) e à matéria com poucos cliques, controla o que foi pedido e anexa documentos. Esta frente entrega a
estrutura e o comportamento; a pele visual vem depois, em V3.

### U0 — Inventário da Mesa

Depende de E1 e M1. Só leitura; produz a lista do que sai.

- [ ] Registrar em E1 as flags de produção `VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED` e
      `VITE_FORGELEX_CASE_WORKSPACE_ENABLED`. Hoje `App.tsx` define `integrated` como as duas ligadas: com
      `integrated`, `WritingDeskScreen` envolve `AgenticWorkspaceScreen`, `DraftStudioScreen` e `DashboardScreen`; sem
      ela, `AgenticWorkspaceScreen` e `DraftStudioScreen` aparecem sozinhas em `/app/trabalho` e `/app/rascunhos`.
      São as duas Mesas.
- [ ] Listar o que existe nos dois caminhos: telas (`WritingDeskScreen` 337 linhas, `AgenticWorkspaceScreen` 858,
      `DraftStudioScreen` 1.156, `DashboardScreen` 54, `ResearchDeskScreen` 150), rotas e abas.
- [ ] Rodar um relatório de código sem uso (por exemplo, `knip`, só em modo relatório) e `rg` por exemplos, dados de
      demonstração e textos de teste visíveis na interface. Nada é apagado nesta etapa.
- [ ] Classificar cada item: `mantém`, `migra para a Mesa nova`, `remove`. Boni aprova a lista.

**Aceite.** Lista aprovada por Boni, com evidência de uso. **Reversão.** Não se aplica.

### U1 — Remover duplicidade e código morto

Depende de U0 e da confirmação das flags em produção.

- [ ] Eliminar o caminho não integrado em `App.tsx` (`!integrated`) e fazer `/app/rascunhos` e `/app/revisao`
      redirecionarem para a Mesa, preservando links.
- [ ] Remover o que a lista de U0 marcou como `remove`, em PRs pequenas por área, cada uma com os testes
      correspondentes removidos ou migrados no mesmo commit.
- [ ] Com DEC-11: manter o piloto fechado enquanto servir a testes, isolado fora da Mesa nova (`ClosedPilotPanel` e
      `closed-pilot*.ts` não entram no `DeskShell`).
- [ ] Remover exemplos e dados de demonstração mortos da interface e das fixtures não usadas.

**Verificação.** Etapa E completa, mais o relatório de código sem uso de U0 sem item novo. **Aceite.** Uma só Mesa em produção e
nenhuma rota órfã. **Reversão.** Reverter a PR; remoções de dados só depois de uma versão estável.

### U2 — Nova estrutura da Mesa

Depende de U1. Atrás de flag (`VITE_FORGELEX_DESK_SHELL`), desligada por padrão.

- [ ] Dividir `AgenticWorkspaceScreen` e `DraftStudioScreen` em componentes menores sob `apps/web/src/desk/`, sem
      mudar comportamento (refatoração com os testes atuais passando).
- [ ] Casca única `DeskShell`: coluna de conversas e casos recolhível à esquerda; conversa no centro, com compositor
      fixo no rodapé; painel da peça e das fontes à direita, aberto sob demanda. Abaixo de `lg`, alternância
      Conversa/Peça.
- [ ] Estado vazio com o compositor em destaque e atalhos para os fluxos comuns (nova peça, revisar texto, pesquisar).
- [ ] Preservar o buffer da peça ao abrir fonte, trocar de aba ou responder (A07, A09).

**Verificação.** `playwright.writing-desk.config.ts`, `playwright.desk-guidance.config.ts` e capturas desktop e
celular. **Aceite.** Mesma funcionalidade da Mesa atual na nova estrutura. **Reversão.** Desligar a flag.

### U3 — Entrada em linguagem natural, grande área e peça identificada

Depende de U2, M3.0 e DEC-10. Nenhuma lista do catálogo aparece ao cliente: a Mesa mostra só a peça e a matéria em uso.

- [ ] Primeira pergunta em linguagem natural, no próprio compositor: “Explique de forma simples o que você gostaria
      de fazer: área, tribunal, tipo de peça”. Ao lado, as grandes áreas como atalho (as 25 de M3.0, com busca).
- [ ] A IA identifica área, tribunal e tipo de peça a partir do texto. O que ela inferir vira **hipótese** que o
      cliente confirma (“Pelo que você informou, a peça é uma resposta à acusação, no TJ-AL. Está correto?”), como
      no fluxo atual da hipótese material. Se disser que não, a Mesa propõe a próxima candidata, uma por vez.
- [ ] Ao escolher uma grande área sem texto, a Mesa correlaciona internamente as peças daquela área e pergunta pelo
      objetivo, sem mostrar a lista; propõe uma peça por vez.
- [ ] Incluir o **tribunal** como decisão da orientação, com “Não sei”. Isso muda o contrato `GuidanceSnapshot`:
      nova versão das regras (`mesa-v3`), leitores antes dos escritores e compatibilidade com orientações já
      persistidas e seus hashes.
- [ ] Mostrar como chips apenas a área, o tribunal, a peça e a matéria em uso. Rótulos legíveis; conteúdo, ID e hash
      da ficha nunca vão ao navegador (A02, revisado).
- [ ] Peça ou matéria sem ficha elegível: dizer que ainda não há apoio específico e seguir como pedido livre, sem
      prometer o que o catálogo não tem.
- [ ] Cliques determinísticos não chamam provedor nem reservam saldo; a identificação por texto segue o
      consentimento e o custo vigentes (A14). Os rótulos de “Peça” e “Matéria” saem do mapa de M3.0.

**Aceite.** Do pedido em texto livre ou da grande área, o cliente confirma a peça em até três interações, vê só a
peça em uso, e a seleção interna registra a ficha usada. **Reversão.** Flag; a orientação por perguntas permanece.

### U4 — Ações: voltar, alterar, excluir, adicionar

Depende de U3. Regra geral: toda ação destrutiva é reversível por padrão (arquivar com “Desfazer”); exclusão
definitiva só na lixeira, com confirmação (`ConfirmationDialog`).

| Ação                              | Onde                                       | Comportamento                                              | Base existente                                                                 |
| --------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Voltar                            | Pergunta guiada, peça aberta, fonte aberta | Volta um passo sem perder o que foi digitado               | “Voltar ao pedido livre” em `GuidancePanel`                                    |
| Alterar área, peça ou matéria     | Resumo do pedido e chips do compositor     | Cria nova revisão e reavalia as decisões dependentes (A05) | “Alterar” em `GuidanceSummary`                                                 |
| Adicionar matéria ou peça         | Chips do compositor                        | Soma ao pedido atual                                       | A criar                                                                        |
| Remover matéria ou peça do pedido | Chip com “x”                               | Retira do pedido; não apaga conteúdo salvo                 | A criar                                                                        |
| Excluir conversa                  | Lista de conversas                         | Vai para a lixeira, com “Desfazer”                         | “Excluir do histórico”                                                         |
| Excluir peça (rascunho)           | Painel da peça                             | Arquiva com “Desfazer”; definitivo só na lixeira           | Ciclo de caso e documento (`matter-lifecycle`); verificar a rota para rascunho |
| Excluir anexo                     | Chip do anexo                              | Retira do pedido; remove o texto salvo conforme o caso     | A criar com U5                                                                 |
| Nova peça, nova conversa          | Cabeçalho da Mesa                          | Abre fluxo limpo                                           | Parcial                                                                        |

- [ ] Cada ação com rótulo acessível, foco previsível, atalho de teclado onde fizer sentido e registro de auditoria.
- [ ] Rota de exclusão e restauração de rascunho, se a verificação mostrar que não existe, com testes.
- [ ] Nenhuma ação destrutiva consome saldo nem interrompe execução paga sem aviso.

**Aceite.** Cada ação testada em E2E, com desfazer funcional. **Reversão.** Flag por grupo de ações.

### U5 — Anexos

Depende de U4 e DEC-12.

- [ ] Botão de clipe no compositor para anexar PDF, DOCX, TXT e imagens. A extração de PDF reaproveita
      `extractPdfText` (hoje usada só na tela de casos): limite de 15 MB e 300 páginas.
- [ ] Anexo vira chip no pedido; pode ser aberto, trocado ou removido. Pode alimentar “revisar um texto” e a análise
      de documentos, e ser salvo no caso como documento.
- [ ] Armazenar somente o texto, conforme DEC-12, com aviso claro ao cliente.
- [ ] **Identificação pela leitura do PDF:** o texto extraído alimenta a mesma hipótese de U3 (área, tribunal e
      peça), confirmada pelo cliente. Segue consentimento e custo vigentes; o PDF não escolhe nada sozinho.
- [ ] Estados: lendo, concluído, sem texto extraível (oferece OCR em U6), erro, arquivo grande demais.

**Aceite.** Anexar, revisar e remover por teclado e por clique. **Reversão.** Flag de anexos.

### U6 — OCR

Depende de U5 e DEC-13.

- [ ] Quando o PDF ou a imagem não tem texto selecionável, oferecer “Reconhecer texto (OCR)”. Hoje o erro manda o
      cliente fazer OCR por fora.
- [ ] OCR no navegador, em português, com progresso, cancelamento e limite de páginas definido por medição de tempo.
- [ ] O texto reconhecido é marcado como “reconhecido por OCR — conferir”, editável antes de salvar.
- [ ] Fixtures próprias de PDF escaneado e imagem, com teste E2E.
- [ ] Medir qualidade em documentos reais autorizados por Boni; só então avaliar OCR no servidor, em decisão separada.

**Aceite.** Um PDF escaneado de teste vira texto editável e utilizável no pedido. **Reversão.** Flag de OCR.

### U7 — Absorver a tela “Casos” na Mesa e removê-la

Depende de U4, U5, U6 e de V3 (seletor de caso e “Criar caso a partir desta conversa”). DEC-14.

- [ ] Levar para a Mesa o que só existe em `MatterWorkspaceScreen` (904 linhas): criar e renomear caso, ciclo de
      vida de caso e documento (`matter-lifecycle`: arquivar, restaurar, excluir definitivamente) e importação de
      PDF (`PdfTextImport`, substituída pelo anexo de U5).
- [ ] Manter o caso como entidade de dados: busca ancorada (M4), ferramentas MCP `case.*` e A07 dependem dele.
- [ ] Redirecionar `/app/casos` para a Mesa, preservando links, e retirar o item “Casos” da lateral.
- [ ] Remover `MatterWorkspaceScreen` e seus testes só depois de a Mesa passar nos mesmos cenários de E2E.

**Aceite.** Nenhuma função hoje exclusiva da tela “Casos” se perde. **Reversão.** Reverter a PR; a rota antiga
volta enquanto a tela existir no histórico.

## 7. Frente V — refatoração visual

Objetivo: levar o ForgeLex ao sistema branco gelo do protótipo de 09/11, sem quebrar seletores de teste, rotas ou
contratos, com tema trocável por configuração até a limpeza final.

### 7.1 Especificação de tokens (tema “gelo”)

| Token semântico | Uso                                              | Gelo              | Contraste medido                 |
| --------------- | ------------------------------------------------ | ----------------- | -------------------------------- |
| `canvas`        | fundo da aplicação                               | `#F4F7F8`         | —                                |
| `surface`       | cartões, painéis, editor                         | `#FFFFFF`         | —                                |
| `surface-muted` | cabeçalho translúcido, áreas secundárias         | `#F7FAFB`         | —                                |
| `line`          | divisórias e bordas decorativas                  | `#E2E8EB`         | decorativo                       |
| `line-control`  | borda de campo, botão fantasma, caixa de seleção | `#7E8B92`         | 3,50:1 no branco, 3,25:1 no gelo |
| `ink`           | títulos e texto principal                        | `#101619`         | 16,95:1 no gelo                  |
| `ink-soft`      | corpo de texto longo                             | `#2A363C`         | 11,37:1 em `accent-soft`         |
| `muted`         | texto de apoio                                   | `#4C585F`         | 6,80:1 no gelo                   |
| `subtle`        | metadados e legendas                             | `#67727A`         | 4,57:1 no gelo, 4,92:1 no branco |
| `accent`        | ação principal, links, foco                      | `#0F5C6E`         | branco sobre ele 7,56:1          |
| `accent-strong` | hover e títulos de destaque                      | `#0B4552`         | 9,68:1 em `accent-soft`          |
| `accent-soft`   | fundo de destaque, citação                       | `#F0F6F7`         | —                                |
| `ok`            | selo verificada                                  | `#1F6B4C`         | 6,43:1 no branco                 |
| `warn`          | lacunas e pendências                             | `amber-700` atual | conferir em V1                   |
| `danger`        | erro e exclusão                                  | `red-700` atual   | conferir em V1                   |

Tipografia (DEC-3): Spectral 400/500/600 para títulos, ementas e texto da peça; Inter 400/500/600 para interface.
Raios: 10 px em controles, 16 a 18 px em cartões. Foco: contorno de 2 px em `accent` com 2 px de afastamento.
Alvos de toque mínimos de 44 × 44 px. Borda de controle sempre em `line-control`, nunca em `line` (WCAG 1.4.11).

### 7.2 Composição por tela (do protótipo)

| Tela                 | Composição                                                                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Casca                | Lateral com Mesa, Casos, Jurisprudência e conta no rodapé; cabeçalho translúcido; “Andamento processual” no lugar de “Consulta processual”                                                                                                                                                             |
| Mesa                 | Desktop em três áreas (v2 §9.1): conversas recolhíveis, conversa com resumo do pedido e pergunta ativa, peça ou fonte aberta. Seletor de caso no cabeçalho com “Sem caso — somente texto”. Painel da peça com abas Texto, Fontes e Revisão. Etapas do trabalho visíveis. Celular: abas Conversa e Peça |
| Estado vazio da Mesa | Campo de conversa, “Me ajude a começar”, exemplos e explicação curta dos dois selos                                                                                                                                                                                                                    |
| Sem caso             | Lista de fontes comum e ação “Criar caso a partir desta conversa”                                                                                                                                                                                                                                      |
| Jurisprudência       | Busca comum ou ancorada (M4), aderência por resultado, verificação gratuita                                                                                                                                                                                                                            |
| Leitor de decisão    | Ementa em Spectral, proveniência, selo verificada, bloco de aderência ao caso, “Onde esta decisão já aparece”, citação formatada                                                                                                                                                                       |
| Casos                | Linha de situação e cobertura das questões (verificadas e lacunas)                                                                                                                                                                                                                                     |
| Caso novo            | Só o nome é obrigatório; importar PDF ou colar texto; “Outros jeitos de começar” (pela Mesa, pela IA via MCP)                                                                                                                                                                                          |
| Visão                | Cartão “Primeiros passos” que pode ser ocultado                                                                                                                                                                                                                                                        |
| Conectar e Conta     | Estado da conexão sem custo; saldo, extrato e custos por operação vindos do serviço                                                                                                                                                                                                                    |

### 7.3 Estratégia técnica

O tema novo entra por variáveis CSS e atributo `data-theme` no `<html>`. Os nomes atuais (`ivory`, `cognac`,
`champagne`, `stone`) passam a apontar para variáveis, então as 1.173 classes existentes mudam de cor juntas quando o
tema muda, sem reescrever telas. Só depois do tema estabilizado as classes migram para nomes semânticos (V7).

### V0 — Tokens sem mudança visual

- [ ] Capturar screenshots de referência (desktop 1440 px e celular 390 px) de Entrar, site público, Visão, Mesa vazia,
      Mesa com peça, Jurisprudência, leitor, Casos, Conectar e Conta. Guardar fora do Git; registrar o local.
- [ ] Em `index.css`, criar variáveis RGB (`--fl-canvas: 248 246 240` etc.) para todos os tons usados: `ivory`
      50–300, `cognac` 50–900, `champagne`, `stone` 50–950 (todos os 11 tons estão em uso), `amber` e `emerald` usados.
      Valores do tema `classico` idênticos aos atuais.
- [ ] Em `tailwind.config.js`, apontar `ivory`, `cognac`, `champagne` e `stone` para `rgb(var(--x) / <alpha-value>)` e
      acrescentar os nomes semânticos da 7.1 apontando para as mesmas variáveis.
- [ ] Substituir as 48 cores hexadecimais literais em `.tsx` por tokens (inclui `bg-[#FDFBF7]` do editor).
- [ ] Sombras `card` e `card-hover` com cor por variável.

**Verificação.** Screenshots antes e depois comparados pixel a pixel (`toHaveScreenshot` local, não versionado);
Vitest, lint, `axe` e as suítes Playwright da Mesa e do site público.
**Aceite.** Diferença visual zero. **Reversão.** Reverter o commit.

### V1 — Tema gelo, fontes e primitivos

Depende de V0 e DEC-3.

- [ ] Bloco `[data-theme="gelo"]` em `index.css` com os valores da 7.1 e mapeamento dos tons legados para os tons gelo
      equivalentes (tabela no registro de execução).
- [ ] `VITE_FORGELEX_THEME` (`classico` padrão, `gelo`) aplicado no `index.html` antes da primeira pintura. Em
      homologação, prévia por `?tema=gelo` guardada em `localStorage` (com `try/catch`); desativada em produção.
- [ ] Spectral e Inter em `woff2` no próprio site (`public/fonts`), subconjunto latino, `font-display: swap`,
      `preload` só da Inter 400; conferir CSP `font-src 'self'`.
- [ ] Primitivos em `index.css` (`.btn-primary`, `.btn-secondary`, `.input-control`, cartão, selo, foco) usando só
      tokens semânticos.
- [ ] Medir contraste de todos os pares usados com script (registro com a tabela).

**Aceite.** Tema `classico` inalterado; tema `gelo` sem violação `axe` nas telas da V0.
**Reversão.** `VITE_FORGELEX_THEME=classico`.

### V2 — Casca e site público

Depende de V1 e DEC-7.

| Entrega                                                                         | Arquivos                              | Aceite                                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| Lateral com Mesa, Casos, Jurisprudência e conta                                 | `Sidebar.tsx`, `navigation/routes.ts` | Aliases antigos (Rascunhos, Revisão) continuam redirecionando para a Mesa |
| Cabeçalho enxuto                                                                | `Header.tsx`                          | Nenhum item leva a ferramenta removida                                    |
| Entrar, Produto e páginas públicas (só estrutura e visual; o texto muda na V5A) | telas públicas                        | `public-copy.test.ts` e `public-seo.test.ts` verdes                       |
| Visão com “Primeiros passos” ocultável                                          | tela de visão geral                   | Estado persiste por usuário                                               |
| “Andamento processual”                                                          | rotas e rótulos                       | Testes de cópia atualizados no mesmo commit; rota antiga redireciona      |

**Verificação.** `playwright.public.config.ts`, `accessibility.spec.ts`, suíte da Mesa nos dois temas.

### V3 — Mesa

Depende de V2, M2 e U4. É a maior etapa; entregar em duas PRs (composição e abas; depois seletor de caso e estados).

| Entrega                                                                  | Arquivos                                                                      | Aceite                                                               |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Composição em três áreas e abas Conversa/Peça abaixo de `lg`             | `WritingDeskScreen.tsx`, `AgenticWorkspaceScreen.tsx`                         | Buffer da peça preservado ao abrir fonte, responder ou trocar de aba |
| Painel da peça com abas Texto, Fontes, Revisão                           | `DraftStudioScreen.tsx`, `DraftCanvas`, `ReviewPanel`, `EditorialReviewPanel` | Revisão cria zero versões (A09); aplicar aceitas cria uma            |
| Orientação no tema novo                                                  | `GuidedQuestion`, `GuidanceSummary`, `GuidancePanel`, `QuestionOptions`       | Uma pergunta ativa; “Não sei” visível como estado                    |
| Seletor de caso e “Sem caso — somente texto”                             | cabeçalho da Mesa, `desk-selection.ts`                                        | Trocar caso não aplica decisão de outra conversa (A07)               |
| “Criar caso a partir desta conversa”                                     | Mesa e `/api/v2/matters`                                                      | Caso nasce só com nome                                               |
| Etapas do trabalho a partir de STATUS, QUESTION, DELIVERY, SOURCE, ERROR | `agentic-workspace/*`                                                         | ERROR sempre visível e anunciado                                     |
| Estado vazio com exemplos e os dois selos                                | `Composer.tsx`                                                                | Primeiro uso sem documentação                                        |

- [ ] Rótulos e papéis ARIA usados pelos testes mantidos; qualquer mudança de texto atualiza o teste no mesmo commit.
- [ ] Capturas desktop e celular para Boni: **A19 é decidido aqui.**

### V4 — Jurisprudência, leitor e fontes

Depende de V3 e M4. `ResearchDeskScreen.tsx`, `DecisionReader`, `SavedResearchPanel`, `DeskCaseSources`,
`SaveAuthorityToCase`. Linguagem visual única para os selos: verificada (verde, ícone e texto), análise da IA
(petróleo, rotulada), origem externa (M5).

### V5 — Casos, Caso novo, Conectar e Conta

Depende de U7: sem a tela “Casos”, o que for dela já está na Mesa e só Conectar e Conta mudam aqui. Telas da 7.2. Remover ou dar comportamento real aos botões inertes. Valores financeiros sempre vindos do serviço.

### V5A — Site público no modelo MCP e Mesa

Depende de DEC-7, M2, U6 e do estado publicado registrado em E1. Decisão de Boni (11/11/2026): o frontend e a parte
externa do site representam o modelo MCP originário e precisam refletir o produto novo. Hoje o texto vende “pesquisa
jurisprudencial dos tribunais superiores e consulta processual”; o comentário de `tests/public-copy.test.ts` registra
que o site oferece o escopo congelado, e o título “A inteligência jurídica que pensa antes de peticionar.” está
vetado por ter prometido além do publicado.

**Regra.** O site só afirma o que está em produção e com preço publicado. Texto e funcionalidade saem na mesma
publicação, por flag (`VITE_FORGELEX_PUBLIC_MODEL`), e uma frase sem função publicada correspondente não entra.

- [ ] Posicionamento **aprovado por Boni em 11/11/2026**, com base no que ele descreveu: (1) conectar o ForgeLex à própria IA do
      cliente por MCP, com o raciocínio no ChatGPT ou Claude dele; (2) conferência de jurisprudência com
      proveniência e vigência; (3) agentes analíticos por função (analisar, mapear teses, avaliar provas, estratégia,
      redigir), só depois de publicados; (4) a Mesa, para elaborar e revisar peças com orientação, anexos e OCR;
      (5) pagamento por uso, com recarga e valores sempre vindos do serviço.
- [ ] Clientes de IA citados: só os com conexão ensaiada em M1 e D2 (hoje ChatGPT e Claude, “conforme a
      disponibilidade do MCP”). O Gemini entra no texto só depois de ensaio de conexão.
- [ ] Escrever três propostas de título e subtítulo; Boni escolhe uma. O resultado entra no registro de execução.
- [ ] Reescrever, no modelo escolhido: `HomePage`, `ProductPage`, `HowPage`, `IntegrationsPage`, `CreditsPage`,
      `GuidePage`, `ApiDocsPage`, `PublicSections.tsx`, `LandingScreen.tsx` (remover a dupla versão do título por
      `CASE_WORKSPACE_ENABLED`), `ConnectionsScreen` (Conectar IA), `index.html`, `public-metadata.ts`,
      `sitemap.xml`, imagem Open Graph e `README.md`.
- [ ] Textos legais em `apps/web/public/legal/` (termos, privacidade, retenção, encerramento): revisar para o modelo
      novo, incluindo anexos (só o texto é guardado), OCR no navegador e os agentes. Descrever apenas o que
      acontece de fato; a aprovação é de Boni.
- [ ] Atualizar no mesmo commit `tests/public-copy.test.ts`, `tests/public-seo.test.ts` e
      `apps/web/src/public/PublicSite.test.ts`; manter o veto ao título rejeitado.
- [ ] A consulta processual gratuita (DataJud) continua descrita como é, sem sugerir mais do que oferece.
- [ ] URLs canônicas e `og:url` com o domínio vigente na ocasião (D3), sem valor fixo no texto.

**Verificação.** `playwright.public.config.ts`, `accessibility.spec.ts`, testes de cópia e SEO. **Aceite.** Cada
afirmação do site corresponde a uma função publicada; título aprovado por Boni. **Reversão.** Desligar
`VITE_FORGELEX_PUBLIC_MODEL` e fazer novo deploy do web.

### V6 — Ligar o tema gelo

- [ ] Passada completa em 360, 768 e 1440 px; `axe` em todas as telas; leitor de tela nos eventos da Mesa.
- [ ] Favicon, imagem Open Graph e cores de `theme-color` no tema novo.
- [ ] `VITE_FORGELEX_THEME=gelo` em homologação, depois em produção, em publicação isolada (seção 0, item 6).

**Reversão.** `VITE_FORGELEX_THEME=classico` e novo deploy do web.

### V7 — Limpeza

Depois de ao menos duas semanas de V6 sem reversão.

- [ ] Migrar classes `ivory`, `cognac`, `champagne` e `stone` para nomes semânticos, por tela, com screenshots iguais.
- [ ] Remover o tema `classico`, a flag e os tons legados do `tailwind.config.js`.
- [ ] Teste ou regra de lint que impeça cor literal nova em componentes.

## 8. Frente D — mudança de domínio

Objetivo: levar site, API, MCP e OAuth para o domínio novo sem quebrar conexões existentes de ChatGPT e Claude,
pagamentos em curso, login nem SEO. O domínio antigo continua respondendo por um período e nunca deixa de ser
renovado.

### D0 — Decisão e inventário

Depende de DEC-1.

- [ ] Registrar `forgelex.com.br` no Registro.br em nome de Boni (DEC-1).
- [ ] Inventário completo e registrado: `rg -n "nexojuris" --glob '!**/dist/**'` (165 ocorrências em 11/11), mais o que
      fica fora do repositório:

| Sistema           | O que muda                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro.br e DNS | Registros A/AAAA do balanceador, CAA para o emissor do certificado                                                                                                                    |
| GCP               | Certificado gerenciado com os dois domínios, regras de host no balanceador, revisões de homologação                                                                                   |
| Supabase Auth     | Site URL, Redirect URLs (antigo e novo durante a transição), servidor OAuth com caminho `/oauth/consent`, links dos e-mails                                                           |
| Login social      | Origens e redirecionamentos autorizados no provedor, se houver                                                                                                                        |
| MCP e OAuth       | `FORGELEX_PUBLIC_URL`, `FORGELEX_MCP_RESOURCE_URL`, metadados `/.well-known/oauth-protected-resource/mcp`; conectores já criados no ChatGPT e no Claude apontam para o domínio antigo |
| Mercado Pago      | URL de notificação; pagamentos criados antes da virada notificam o domínio antigo                                                                                                     |
| CORS              | `FORGELEX_ALLOWED_ORIGINS`                                                                                                                                                            |
| SEO               | `index.html` (canonical, `og:url`), `sitemap.xml`, `robots.txt`, `public-metadata.ts`, Search Console                                                                                 |
| Ratione           | `ratione.nexojuris.ia.br` (DEC-8)                                                                                                                                                     |
| Documentação      | `ops/gcp/production/README.md`, runbooks e registros vigentes; registros históricos mantêm o domínio da época                                                                         |

### D1 — Código com domínio configurável e duplo

Sem mudança de infraestrutura nem de comportamento em produção.

- [ ] Web: `CANONICAL_ORIGIN` a partir de `VITE_PUBLIC_ORIGIN` (obrigatória no build de produção); `index.html` com
      `%VITE_PUBLIC_ORIGIN%`; `sitemap.xml` e `robots.txt` gerados no build.
- [ ] API: `FORGELEX_MCP_RESOURCE_URLS` (lista) além do valor único atual. Metadados de recurso devolvidos conforme o
      host da requisição; validação de token aceita qualquer recurso da lista. Teste com os dois hosts e com recurso
      fora da lista (`RESOURCE_MISMATCH`).
- [ ] `mcp.call` passa a registrar o host, para medir o uso do domínio antigo.
- [ ] Testes: centralizar o domínio de fixture numa constante de teste e trocar as ocorrências.
- [ ] Scripts de ops com o domínio por parâmetro, sem valor padrão de produção embutido.

**Aceite.** Com as variáveis atuais, comportamento idêntico (testes de OAuth, MCP e SEO verdes).
**Reversão.** Reverter o commit; nenhuma configuração externa mudou.

### D2 — Homologação no domínio novo

- [ ] DNS e certificado de `hml.<domínio novo>`; regras do balanceador.
- [ ] Supabase de homologação com as duas origens.
- [ ] Ensaio completo: login, OAuth do MCP no Claude e no ChatGPT com o host novo, conexão antiga continuando a
      funcionar, pagamento de teste com notificação, pesquisa, Mesa.

**Aceite.** Os dois domínios funcionam em homologação. **Reversão.** Remover o host novo do balanceador.

### D3 — Produção nos dois domínios

- [ ] Certificado com os dois domínios, DNS do novo, `FORGELEX_MCP_RESOURCE_URLS` com os dois, CORS com os dois,
      Supabase com as duas origens.
- [ ] Domínio novo passa a ser o canônico (`FORGELEX_PUBLIC_URL`, `VITE_PUBLIC_ORIGIN`); notificação do Mercado Pago
      aponta para o novo.
- [ ] Tela Conectar mostra a URL nova e orienta a reconexão.

**Aceite.** Conexões MCP antigas e novas funcionam; pagamentos novos notificam o domínio novo.
**Reversão.** Voltar o canônico para o antigo; os dois continuam servidos.

### D4 — Redirecionar o site

- [ ] No domínio antigo, redirecionamento 301 só para páginas do site (`GET` de HTML), preservando caminho e query.
- [ ] Não redirecionar `ratione.nexojuris.ia.br` (DEC-8): o subdomínio continua servindo o Ratione.
- [ ] Sem redirecionamento para `/mcp`, `/oauth/*`, `/.well-known/*`, `/api/*` e notificações de pagamento, que
      continuam servidos no domínio antigo.
- [ ] Search Console: propriedade nova e mudança de endereço.

**Aceite.** Páginas antigas chegam ao domínio novo; nenhuma chamada de máquina quebra.

### D5 — Encerrar o uso do domínio antigo

- [ ] Acompanhar o host no `mcp.call` e nas notificações até o uso antigo chegar a zero por 30 dias.
- [ ] Comunicar data limite aos usuários com conector antigo.
- [ ] Remover o recurso antigo de `FORGELEX_MCP_RESOURCE_URLS` e as origens antigas do Supabase.
- [ ] Manter o redirecionamento do site e **renovar o domínio antigo indefinidamente** (também por abrigar `ratione.nexojuris.ia.br`, DEC-8); um domínio vencido poderia ser
      registrado por terceiro e receber retornos de OAuth.

## 9. Frente R — integração com o Ratione (posterior)

Começa depois de V6 estável e de M5. Integração por contrato entre serviços, sem fundir repositórios.

| Etapa | Entrega                                                                                               | Aceite                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| R-a   | Auditoria: mesmo projeto Supabase ou não, rotas e parâmetros do PrazoZero, NormaViva e TeseMap        | Registro com a resposta                                                  |
| R-b   | Links profundos: artigo citado → NormaViva; tema ou súmula → TeseMap; movimentação → PrazoZero        | Nenhum dado do caso na URL                                               |
| R-c   | API de serviço somente leitura no Ratione (prazo, norma na data, precedentes por tema ou dispositivo) | Determinística, versionada, autenticação entre servidores                |
| R-d   | Selos de origem Ratione na aba Fontes (M5)                                                            | Fonte e data visíveis; STF como fonte Ratione, não como pesquisa cobrada |
| R-e   | Funções equivalentes no MCP do ForgeLex                                                               | Separadas de `research_*` e do módulo de agentes comerciais              |
| R-f   | Argumenta no “Analisar documento” e conta única                                                       | Só com decisão de produto (DEC-8) e política de retenção                 |

## 10. Verificação padrão de cada etapa

```powershell
pnpm typecheck
pnpm lint
pnpm format:check:code
pnpm exec vitest run
pnpm exec playwright test --config playwright.writing-desk.config.ts
pnpm exec playwright test --config playwright.desk-guidance.config.ts
pnpm test:e2e:public
pnpm test:e2e:accessibility
```

Acrescentar as suítes PostgreSQL (`test:postgres:agentic-runtime`, `test:postgres:agentic-case-task`) quando a etapa
tocar persistência ou execução, e as suítes de MCP e OAuth (`test:e2e:mcp-site`, `scripts/smoke-mcp-oauth.mjs`) nas
etapas D. Falhas preexistentes e testes ignorados são registrados sem contar como aprovação.

## 11. Riscos

| Risco                                                 | Mitigação                                                                         | Etapa      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- | ---------- |
| Tema novo quebra seletores de teste                   | Testes localizam por papel e rótulo; texto alterado muda o teste no mesmo commit  | V0–V5      |
| Diferença visual não intencional ao introduzir tokens | Screenshots pixel a pixel em V0                                                   | V0         |
| Contraste insuficiente em bordas de controle          | `line-control` com 3,5:1; medição por script                                      | V1         |
| Fontes externas lentas ou bloqueadas                  | Fontes no próprio site e `font-display: swap`                                     | V1         |
| Conectores MCP antigos param na troca de domínio      | Recurso duplo, sem redirecionar `/mcp` e OAuth, desligamento só com uso zero      | D1–D5      |
| Notificação de pagamento perdida                      | Domínio antigo continua servindo notificações                                     | D3–D5      |
| Domínio antigo registrado por terceiro                | Renovação indefinida                                                              | D5         |
| Fichas com erro jurídico ou de escopo                 | Ajustes da conferência amostral em nova versão; avaliação de Boni por lote        | M3         |
| Reserva de R$ 11,50 impede uso com saldo baixo        | DEC-5 e mensagem clara                                                            | M1         |
| Remover código ainda usado em produção                | U0 com flags de produção e relatório de uso; PRs pequenas; reversão por PR        | U1         |
| Seleção sem ficha por falta de chave no mapa          | M3.0 gera e confere o mapa; fila de ambíguas                                      | M3, U3     |
| OCR lento ou fraco em documento ruim                  | OCR com cancelamento, limite de páginas e texto editável; servidor só por decisão | U6         |
| Site promete função ainda não publicada               | V5A: texto e função saem juntos, por flag; título vetado mantido                  | V5A        |
| Alerta de chave não dispara                           | Checagem periódica de `/readyz`                                                   | E3         |
| Duas mudanças de risco juntas                         | Seção 0, item 6                                                                   | V6, D3, D4 |

## 12. Referências

- Protótipo interativo do novo visual (canvas de 09/11/2026, privado de Boni): fonte da seção 7.1 e 7.2.
- Registro de execução: [`docs/architecture/2026-11-10-mesa-guiada-execucao.md`](../../architecture/2026-11-10-mesa-guiada-execucao.md).
- Salvamento atômico: [`docs/operations/draft-save-recovery.md`](../../operations/draft-save-recovery.md).
- Estado publicado: [`PENDENCIAS.md`](../../../PENDENCIAS.md).

## Apêndice A — Mesa guiada: decisões, contratos e critérios herdados do v2

### A.1 Decisões de produto

- A condução ocorre por perguntas seletivas e objetivas, uma ativa por vez, com texto livre no mesmo compositor.
- “Não sei” é resposta válida e persistida; a IA ajuda a identificar o contexto e a hipótese material exige
  confirmação.
- A área influencia as perguntas seguintes; Forma, Matéria, especialistas e ferramentas são escolhidos no servidor.
- Conteúdo, hashes e identificadores internos das fichas ficam nos bastidores. Desde 11/11/2026 (DEC-10) a Mesa
  mostra só a peça e a matéria em uso, identificadas por área, texto livre ou leitura de PDF e confirmadas pelo cliente; isso revisa a decisão original de manter Forma e Matéria só nos
  bastidores.
- Cliques em opções determinísticas não chamam provedor nem reservam saldo; inferências seguem consentimento e custo
  vigentes.
- Penal é a jornada principal do piloto; Cível é a regressão.

### A.2 Contratos

`GuidanceSnapshot`, `DecisionValue` e `SkillBinding` estão em `packages/domain/src/contracts/desk-guidance.ts`, com
regras em `packages/legal-workflows/src/desk-guidance/guidance-rules.ts` (`mesa-v2`) e serviço em
`apps/api/src/agentic-workspace/guidance-service.ts`. `guidanceHash` identifica regras e decisões; `resolutionHash`
identifica a seleção interna; nenhum hash concede acesso nem substitui o comando idempotente. Leitores novos entram
antes dos escritores; checkpoints antigos continuam no protocolo original.

### A.3 Critérios de aceite

| ID  | Critério                                                                                            | Situação                                |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------- |
| A01 | Inventário com as 2.077 fichas (303 Forma, 1.774 Matéria) e verificação de origem e hash            | Atendido localmente; incorporação em M3 |
| A02 | A interface não expõe conteúdo, IDs ou hashes das fichas (rótulos de peça e matéria são permitidos) | Atendido localmente                     |
| A03 | Pedido completo evita perguntas redundantes                                                         | Atendido localmente                     |
| A04 | “Não sei” persiste e mantém hipótese separada de resposta confirmada                                | Atendido localmente                     |
| A05 | Correção cria nova revisão e reavalia decisões dependentes                                          | Atendido localmente                     |
| A06 | Seleção de habilidades reproduzível                                                                 | Atendido localmente                     |
| A07 | Conversa, caso, documento, versão e alvo enviado correspondem                                       | Atendido localmente; reconferir em V3   |
| A08 | Hash independente de autorização e de comando                                                       | Atendido localmente                     |
| A09 | Revisão cria zero versões; edição preserva o que está fora do escopo                                | Atendido localmente; reconferir em V3   |
| A10 | Concorrência e replay não duplicam escritas                                                         | Atendido localmente                     |
| A11 | Pesquisa conservada abre sem busca nova, com caso e proveniência corretos                           | Atendido localmente; reconferir em M4   |
| A12 | Conferência, decisão editorial e aprovação ligadas à versão correta                                 | Atendido localmente                     |
| A13 | Checkpoints históricos legíveis                                                                     | Atendido localmente                     |
| A14 | Perguntas determinísticas sem provedor nem reserva                                                  | Atendido localmente                     |
| A15 | Manifesto corresponde às ferramentas reais                                                          | Atendido localmente                     |
| A16 | Jornada completa por teclado e em celular                                                           | Atendido localmente; reconferir em V6   |
| A17 | Piloto Penal e regressão Cível na mesma revisão                                                     | Técnico atendido; jurídico em M3        |
| A18 | Homologação de produção com registro próprio                                                        | Pendente (M2)                           |
| A19 | Boni valida a jornada visual em desktop e celular                                                   | Pendente (V3)                           |
| A20 | Uma só Mesa em produção, sem rota órfã nem código morto                                             | Pendente (U1, U7)                       |
| A21 | Mesa mostra só a peça e a matéria em uso, sem listar o catálogo; conteúdo e IDs ocultos             | Pendente (U3)                           |
| A22 | Voltar, alterar, adicionar e excluir com desfazer, testados por teclado                             | Pendente (U4)                           |
| A23 | Anexo e OCR no pedido, com texto editável antes de salvar                                           | Pendente (U5, U6)                       |
| A24 | Cada afirmação do site público corresponde a uma função publicada e a um preço do serviço           | Pendente (V5A)                          |
