# Mesa guiada do ForgeLex · registro de execução

O [plano v2](../superpowers/plans/2026-11-10-forgelex-mesa-guiada-v2.md) teve seu início autorizado por Boni em 10 de novembro de 2026. Fluxo limpo e visual moderno são critérios de aceite da Mesa.

## R0 · revisão de partida

- Branch local `codex/mesa-guiada` criada em worktree gerenciado e inicialmente limpo.
- Revisão de partida `5d854da2cdae9c7c867e202e71ab8f4551cba3f6`. `git ls-remote origin refs/heads/main` e `git rev-parse origin/main` retornaram esse mesmo SHA.
- A auditoria principal usou `8fcd1d0`. A comparação com a base de execução confirmou as alterações posteriores de limites de entrada, transporte e política comercial. A implementação usará os contratos dessa base de execução. Os valores históricos da auditoria não orientam cobrança.
- `pnpm install --frozen-lockfile` concluiu para 18 projetos com pnpm 11.19.0 e reaproveitou os 541 pacotes do cache. O lockfile permaneceu igual.
- Verificação focada de baseline com Vitest. 48 testes aprovados em três arquivos, cobrindo contrato agêntico, navegação e modelo de execução da interface.
- O schema de contexto é estrito. A extensão de orientação em R2/R3 exige leitores compatíveis antes de novos escritores e uma projeção pública que exclua os dados internos. O driver padrão usa v10, o schema v10 é o último da baseline e o leitor editorial ainda limita evidências até v8. O plano usa v11 como próximo número e mantém a leitura histórica em R7/R10.

## R1 · inventário técnico

O script `scripts/skills/inventory-catalog.mjs` verifica o hash da captura, confere o manifesto e os hashes de cada Markdown e conteúdo, cruza identidade, versão e categoria e gera o índice sem copiar o corpo das fichas para a saída.

| Evidência | Resultado |
|---|---|
| Captura validada | 2.077 registros. 303 de Forma e 1.774 de Matéria. |
| Cobertura | 302 tipos distintos de Forma e 91 grupos de Matéria por área/subárea, incluindo grupos com subárea ausente. |
| Classificação pendente | 580 fichas de Matéria têm área, mas não têm subárea identificável pelos campos examinados. Foram conservadas e sinalizadas. |
| Sobreposição exata | Nenhum título duplicado na mesma categoria ou conteúdo com hash idêntico. O tipo `notificacao-extrajudicial` está associado a duas formas e exige desambiguação futura. |
| Avaliação | As 2.077 fichas permanecem pendentes de avaliação para uso no runtime. |
| Índice local | `.superpowers/sdd/2026-11-10-forgelex-mesa-guiada-v2/catalog-inventory.json`, ignorado pelo Git. |
| SHA-256 do índice | `770eb0dc3eabc06349e481c396612bb7d037669fef1b07d00559ed617f06d9f7` |
| Verificação | Nove testes Node aprovados e Prettier aprovado nos dois arquivos novos. |

O inventário técnico é independente da elegibilidade. A lista elegível inicial para execução está vazia. Os candidatos registrados no plano para a futura avaliação de Boni são `resposta-acusacao` v3 e, quando a questão do caso a justificar, `cadeia-custodia-cpp-158` v3. A incorporação depende da decisão sobre origem e reutilização prevista no plano. O inventário e os textos da captura permanecem locais.

Para reproduzir em um worktree com as dependências instaladas, a partir da raiz:

```powershell
node --test scripts/skills/inventory-catalog.test.mjs
node scripts/skills/inventory-catalog.mjs --archive "<caminho do ZIP aprovado>" --out "<caminho local novo>.json"
```

## R2 · contratos de orientação e hashes

- `DecisionValue` distingue valores informados, desconhecidos, propostos e confirmados. Uma decisão de origem documental exige evidência. A confirmação pertence ao usuário. O contrato existente de respostas continua recusando opção inválida, resposta vazia e revisão obsoleta.
- `GuidanceSnapshot` aceita contexto interno opcional e versionado. Contextos históricos continuam legíveis. O hash v1 usa campos em ordem fixa e ordena referências de evidência. A revisão e os IDs de perguntas não alteram a identidade das decisões. O hash da seleção de habilidades inclui revisão do contexto, versão do catálogo, entradas e seus vínculos.
- Os contratos de orientação e de seleção não aceitam campos de autorização ou comando. A entrada pública de execução recusa a orientação interna, inclusive se o snapshot/hash for válido. A projeção pública continua omitindo a orientação. A validação de comandos de orientação com owner e revisão pertence a R3. O contrato das chaves já aceitas pelo cliente permanece compatível.
- Validação local: build completo, verificação de tipos de domínio e API, ESLint e Prettier nos arquivos alterados e 79 testes focados em seis suites. Os testes de API e persistência usam banco em memória. Não houve execução de inferência real ou operação em produção.

## R3 · orientação persistida anterior à inferência

A API prepara a conversa, registra cada resposta e reabre a pergunta ativa usando os snapshots existentes. A revisão e os recibos ficam no JSON do contexto. A gravação usa o lock já existente e preserva as revisões anteriores. Nenhuma migration é necessária para esta etapa.

| Operação | Contrato |
|---|---|
| `POST /api/agentic/guidance` | Inicia a orientação. Recebe `objective` e `matterId` opcionais e um `Idempotency-Key` UUID. |
| `GET /api/agentic/guidance/:conversationId` | Recupera decisões públicas e pergunta ativa em leitura consistente. |
| `POST /api/agentic/guidance/:conversationId/answer` | Registra `LegalAnswer` para a pergunta ativa na revisão indicada. |
| `POST /api/agentic/guidance/:conversationId/correct` | Corrige uma decisão ainda válida na revisão indicada. Invalida a peça dependente quando área ou tarefa mudam. |

- As rotas exigem sessão e `research:read`. Contexto vinculado a caso exige `matter:read` e caso ativo. A projeção pública omite hashes, recibos e conteúdos internos.
- A identidade do comando de início localiza a primeira revisão por UUID derivado no escopo do dono. Respostas e correções guardam o comando na revisão produzida. A repetição devolve essa revisão, inclusive após o avanço da conversa. Usar a mesma chave com outro pedido retorna conflito.
- A escolha “Não sei” fica registrada. As regras iniciais guiam área e tarefa e incluem peças de referência para Penal e Cível. A interpretação por IA e o consumo pelo compositor entram nas etapas seguintes.
- A execução que consome orientação precisa apontar para a revisão persistida, sem substituir esse contexto no pedido de início.
- A gravação é opt-in por `FORGELEX_DESK_GUIDANCE_ENABLED=true` junto ao workspace agêntico, fora do piloto fechado. O padrão preserva o rollout leitor antes do escritor.
- Validação local: build da API e dependências, tipos de API e domínio, lint e formatação dos arquivos alterados. 76 testes focados passaram em cinco suítes. Os novos casos cobrem concorrência de duas abas, acesso, chave UUID, opção inválida, retomada, replay histórico, invalidação de peça e recusa de revisão antiga. A preparação verificou ausência de execução, job, chamada e reserva de inferência. Os testes de persistência usam SQLite em memória.

Próxima tarefa: R4, seleção única e navegação da Mesa. O estado de cada etapa está nos checkboxes do plano.

## Evidências locais

As referências aprovadas estão na pasta Downloads de Boni. O ZIP e o conteúdo das fichas são insumos de análise local. O inventário completo será gerado no workspace local ignorado pelo Git.

| Insumo | Arquivo |
|---|---|
| Plano aprovado | `ForgeLex-Plano-Detalhado-Mesa-Guiada-Habilidades-Ocultas-v2-2026-11-10.md` |
| Auditoria ForgeLex | `ForgeLex-Auditoria-Arquitetural-Mesa-Juridica-2026-11-10.md` |
| Plano anterior | `ForgeLex-Plano-Implementacao-Mesa-Juridica-2026-11-10.md` |
| Análise Rimor | `JUIT-Analise-Reversa-REA-2026-11-10.md` |
| Análise MinutaIA | `MinutaIA-Analise-Reversa-Tecnica-REA-2026-11-10.md` |
| Acervo capturado | `MinutaIA-Habilidades-Oficiais-2077-2026-11-10.zip` |

SHA-256 verificado do ZIP `2a0efbbc301e53c357d5fe6baac1a896c84669fc1646a62c2aec410550543d01`.
