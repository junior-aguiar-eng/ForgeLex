# Correções locais após a avaliação técnica da v8

Data: 03/11/2026. Checkout `forgelex-3-audit/SDK`, branch
`codex/forgelex-3-quality`, base `adc823b518934e8b1bbdb0aaef8fb27ccd599698`.
A análise enviada por Boni foi tratada como apoio técnico, não aprovação jurídica.
Nenhuma avaliação humana pendente foi preenchida. A v9 é opt-in; o padrão
continua v8. Não houve inferência paga, aplicação automática, commit, push ou deploy.

## Confronto dos achados com os registros

| Item | Causa ou evidência confirmada | Correção local e limite |
| --- | --- | --- |
| D04 | Falha na primeira chamada do orquestrador, antes de concluir qualquer papel. O JSON guarda apenas `Error`, papel e `OPENAI_AGENT_ERROR`; faltam resposta, status HTTP, request ID e uso. Não há prova para atribuir a rede, schema ou recursos. | Callback de checkpoint aguardado antes de cada despacho; classes de transporte transitório, contrato, recursos e autorização quando a evidência permite. Erro desconhecido permanece desconhecido. Nenhuma recuperação retrospectiva da causa. |
| Checkpoint | O worker já persistia etapas concluídas. D04 não tinha trabalho de um papel anterior a recuperar. | Testes de falha inicial e posterior preservam respectivamente estado inicial e minuta já produzida. Falha ao persistir impede a chamada. O harness futuro usa o callback; registros antigos intactos. |
| Custos | US$ 0,189408 liquidados; até US$ 0,083620 incertos. Zero calculado no D04 não demonstra ausência de cobrança. | Reserva permanece incerta, sem reenvio automático. Teste HTTP 503 mantém reserva e diagnóstico permitido. Procedimento de reconciliação abaixo. |
| Proposições e ressalvas repetidas | A entrega agrega resultados ativos de papéis distintos e deduplicava por ID; os prefixos não demonstram duas gerações do mesmo agente. A ficha também repetia requisitos como avisos. | Consolidação literal e equivalências declaradas, com tipos/fontes/referências compatíveis, proveniência e originais em auditoria. Não há prova de eliminação de toda paráfrase semanticamente redundante em modelo real. |
| Correções versus avisos | Requisitos editoriais eram apresentados novamente como `EDITORIAL_REQUIREMENT_UNVERIFIED`. Aviso genérico de suporte não identificava sua proposição. | Seções próprias; correções não reaparecem como ressalvas; aviso de suporte inclui proposição e fonte. Avisos sem objeto e estado de capacidade ficam na trilha técnica. Isso não comprova execução de pesquisa. |
| Pesquisa “solicitada” | O planejamento marcou necessidade de normas; o grafo tentou pesquisa indisponível. Isso não prova pedido explícito de pesquisa pelo usuário. | `CAPABILITY_UNAVAILABLE` não aparece como solicitação do usuário na entrega v9. O registro original permanece consultável. |
| Tipos de proposição | O contrato anterior só permitia alegação, inferência e fato verificado. | `DOCUMENT_RECORD` exige um documento e trecho literal. Registro e inferência devem ser separados pelo perfil v9; declaração literal não vira prova de veracidade. Persistência classifica registro como `EXTRACTED`. Contratos de ferramentas antigas mantêm os três tipos originais. |
| Questões de D01 | Divergência da avaliação: o JSON contém cinco questões e a mesa já as renderiza. A ficha humana não as transcreveu. | Teste lê o artefato D01 e confirma sua apresentação. A ficha original não foi reescrita. Perfil v9 exige questões explícitas e pergunta sobre pretensão material ausente; lacunas materiais ganham seção própria. |
| Aptidão e exigibilidade | A v1 perguntou por elementos suficientes à exigibilidade; o planejamento v8 de D03 ficou concentrado em pagamento/quitação. Não foi encontrado filtro que removesse uma verificação existente. A mudança de cobertura pelo modelo não prova regressão causal de código. | Contrato v9 verifica partes, causa, vencimento e vínculo, com trecho para presença. Ausência de exame fica ambígua, nunca preenchida por presunção. Fixture novo distingue insuficiência do documento de inexistência do crédito. |
| Integridade | A saída v8 não executa a instrução, mas faltava alerta próprio de origem e possível contaminação dos derivados. | Sinal citado pelo modelo e detecção conservadora geram alerta de revisão, ligado ao documento; rascunhos recebem aviso de possível contaminação. Sinal de conflito com interesse declarado exige trecho. Não se afirma fraude nem se garante detecção universal de injeções. |
| Prefixo repetido | `0623a0beb6` deriva de SHA-256 de `JSON.stringify("matter-analyst:0")`, truncado a dez caracteres. É compartilhado pelo mesmo nó, não derivado de dado privado do caso. | Namespace v9 incorpora vínculo de execução e nó. IDs continuam estruturados para auditoria; texto público é validado contra IDs internos conhecidos. Testes de mesa e cópia não exibem IDs. Não é promessa de anonimização geral. |
| Requisito “verificado” | O booleano anterior era declaração do modelo; D01 descrevia preservação de classificação, D03 propunha edição. Não era aprovação humana. | Toda correção editorial v9 permanece não verificada; valor original fica na auditoria. Aceitação e aplicação continuam humanas. |
| Suporte documental | Conferência geral anterior limitava-se a normas/autoridades; matriz documental existia no fluxo específico de evidências, não cobria todos os fluxos de análise/revisão. | Verificador v9 recebe também documentos, texto do usuário e respostas. `MATCHED` segue sendo correspondência literal, separada do juízo de suporte. Teste com múltiplos recortes detecta citação trocada. |
| “Não informado” versus “desconhecido” | O deslocamento aparece na redação gerada; não havia guarda de literalidade para registro documental. | `DOCUMENT_RECORD` rejeita substituição não literal; inferências e avisos ainda exigem avaliação semântica. Não se afirma que esse controle sozinho elimina todo deslocamento em prosa. |

Uma avaliação documental ambígua/insuficiente, pergunta material ou alerta de
integridade mantém a entrega v9 como `LIMITED`. Consolidação nunca promove
conferência conflitante a suporte confirmado. Grupos que eliminariam referência
da matriz de evidências são rejeitados; não se reescreve essa matriz silenciosamente.

## Áreas e arquivos alterados nesta correção

- Diagnóstico: `packages/agent-core/src/runtime/agent-failure.ts`,
  `apps/api/src/agentic-workspace/{commercial-provider,failure-log}.ts` e testes.
  O diagnóstico admite apenas campos seguros; HTTP não exitoso conserva status
  e request ID permitido, sem corpo da resposta ou mensagem arbitrária.
- Contratos e perfil: `packages/domain/src/contracts/agentic-case-task.ts`,
  `packages/legal-agents/src/agentic-reviewed-delivery.ts` e exportação no índice.
- Fluxo: `packages/legal-workflows/src/agentic-case-task/{case-task,scoped-handoff,
  support-audit,reviewed-delivery}.ts`, testes de checkpoint/consolidação/fluxo,
  `apps/api/src/agentic-workspace/case-task-driver.ts` e callback do harness.
- Persistência: `packages/persistence/src/repositories/evidence-review-items.ts`
  e teste; nenhuma migration.
- Mesa: `apps/web/src/agentic-workspace/{execution-model,present-delivery}.ts`,
  teste de apresentação e novo caso em `tests/e2e/editorial-review.spec.ts`.
  Estrutura visual, revisão humana e aplicação versionada existentes preservadas.
- Corpus separado: `scripts/forgelex-final-evaluation/corpus-v2.mjs` e teste.
  Inventário exato de arquivos e hashes acompanha o recibo de validação.

## Reconciliação da reserva de D04

O ledger isolado da campanha não é o ledger comercial. Não chamar a operação
de reconciliação comercial para alterar este registro. Preservar os arquivos
v8; registrar eventual reconciliação em artefato adicional versionado.

1. Identificar a chamada `2f498194-2bd6-41d7-9ce4-db6dd8bfe83f`, iniciada em
   `2026-11-03T21:51:17.081Z`, e o hash do ledger de origem.
2. Obter evidência independente do provedor que vincule inequivocamente essa
   chamada ao uso faturável ou à confirmação de não cobrança. Totais agregados
   ou ausência no log local não bastam; o request ID histórico não foi gravado.
3. Registrar fonte/hash, correspondência, tokens/preço aplicável ou evidência
   de não cobrança, cálculo e decisão fundamentada de Boni no artefato adicional.
4. Somente então recalcular a exposição derivada. Sem evidência suficiente,
   manter **83.620 microUSD** reservados; nunca liberar por hipótese ou reenviar
   a chamada para descobrir seu custo.

Esta reconciliação não foi executada: não há evidência independente disponível
nos registros locais examinados. O limite superior da v8 continua US$ 0,273028.

## Próxima campanha proposta — não autorizada

Seis execuções apenas da candidata v9, nesta ordem: **D04-V2**, D01-V2,
D03-V2, V2-FIT, V2-INTEGRITY e V2-MULTI. Os três últimos cobrem documento
insuficiente com ambiguidade de partes, instrução menos explícita e citações
trocadas entre vários recortes. Não é comparação A/B com a v1.

Estimativa de planejamento: **24–32 chamadas**; não é consumo garantido.
Preservados os limites atuais: **24 chamadas por execução, 144 no máximo no
conjunto, 2.048 tokens de saída, cinco minutos por execução, US$ 0,25 por
execução e US$ 1,50 para a campanha**. O orçamento pode interromper antes do
limite de chamadas. `gpt-6.1-sol`, reasoning `low`, tier `default`; sem pesquisa
paga adicional, repetição automática, outros 54 cenários ou publicação.

Pré-condições: reconciliação da reserva anterior, conferência de preços e
congelamento do pacote exato; autorização expressa de Boni para esta nova
versão. Começar por D04-V2 e interromper em custo incerto, recusa de orçamento
ou erro de transporte/contrato. O manifesto é proposta; nenhum runner pago
novo foi ativado por esta alteração.

O corpus v2 acrescenta art. 300, § 1º, e art. 498 do CPC, com recorte, data e
hashes do texto extraído/transcrito da [publicação oficial do Senado](https://legis.senado.gov.br/norma/584917/publicacao/15633703),
consultada em 03/11/2026. Não equivale a auditoria exaustiva de vigência. Arts.
319 e 476 do CC não foram acrescentados. Corpus e critérios da campanha v8
permanecem intactos.

## Pendências materiais

- Causa histórica e custo de D04: informação insuficiente nos registros locais.
- Avaliação jurídica de Boni: continua pendente; parecer técnico não a substitui.
- Qualidade real da v9, cobertura das perguntas e consolidação semântica:
  ainda não medidas; mocks validam controles, não raciocínio jurídico de modelo.
- Integrar o novo pacote ao runner pago somente após preparar e conferir seus
  gates, sem reaproveitar autorização da v8. A proposta não autoriza execução.
- Commit das mudanças locais, push e deploy continuam fora desta execução.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| Testes focados de contratos, orçamento, fluxo e apresentação | 204 aprovados em 17 arquivos |
| Suíte geral (`pnpm test`) | Build aprovado; 1.755 testes aprovados, 17 ignorados, uma falha na regra de estado da entrega v9 |
| Correção da falha de estado | Entrega com lacuna material, aptidão insuficiente/ambígua ou alerta de integridade passa a `LIMITED`; 17/17 testes de consolidação, fluxo e apresentação aprovados após a correção |
| Scripts Node: orçamento, campanha, preparação, corpus e editor local simulado | 24 aprovados |
| Navegador editorial | 11 aprovados na primeira execução; o novo caso falhou por seletor de teste que incluía o marcador de fonte; seletor corrigido e novo caso aprovado (12 casos cobertos) |
| Navegador da mesa | Três aprovados: percurso com editor/fontes, orçamento indisponível e entrega com suporte insuficiente |
| Build final após a correção | Aprovado |
| Tipos da API, lint e formatação dos 27 arquivos de código | Aprovados |
| Preservação | 58 arquivos protegidos da v8 e quatro ledgers anteriores conferidos por SHA-256, sem alterações |

A suíte integral foi iniciada antes da última correção e registrou o estado
anterior. Não foi repetida integralmente: a única falha foi reproduzida,
corrigida e conferida no conjunto afetado de 17 testes. Portanto não se
declara uma execução integral final sem falhas. Contagens dos conjuntos se
sobrepõem e não devem ser somadas. PostgreSQL não foi repetido nesta etapa;
a mudança de classificação foi validada em teste local, sem mudança de schema.

O primeiro build identificou a necessidade de mapear `DOCUMENT_RECORD` para
`EXTRACTED`; o build final passou com esse mapeamento. Uma tentativa de
formatação recebeu a lista de caminhos como argumento único no PowerShell;
a conferência posterior usou a API do Prettier por arquivo e passou em 27/27.
Falhas de desenvolvimento e resultados posteriores estão discriminados no
recibo, sem transformar mock ou teste de UI em prova de qualidade jurídica.

Resultados e hashes de preservação: ver o recibo em
`evidence/2026-11-03-v9-review-remediation/validation.json`.
