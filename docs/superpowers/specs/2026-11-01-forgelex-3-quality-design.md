# ForgeLex 3 — primeiro incremento: integridade da verificação

Base: `025f6dd438ecfd78079b4688fd076e476da74ce9`, conferida com `git ls-remote`
em 01/11/2026. Desenvolvimento local autorizado pelo prompt mestre; sem commit,
push, merge, deploy, migração remota ou inferência paga. Boni é o único aprovador.

## Alternativas e decisão técnica

1. Reforçar o fluxo sequencial: menor risco, reutiliza runtime e persistência;
   suficiente para corrigir a posição do verificador e a validação dos handoffs.
2. Grafo nativo por capacidades e dependências: evolução-alvo recomendada,
   reutilizando o journal financeiro, checkpoints e autorização atuais. Exige
   nós versionados, reconciliação, orçamento por tarefa e avaliação comparativa
   antes de paralelismo/replanejamento. Não está integralmente implementado aqui.
3. LangGraph: oferece checkpoints e interrupções, mas não substitui o isolamento,
   ledger e contratos jurídicos do ForgeLex. Uma migração agora duplicaria
   responsabilidades sem ganho medido. Nenhuma dependência adicionada.
   Referência oficial consultada: https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph

Escolha do executor, conforme delegação expressa no pedido: implementar (1)
como primeiro passo de (2). Não criar agentes adicionais neste incremento.

## Defeitos e comportamento pretendido

- O verificador precede assessor, redator e revisor: não recebe suas afirmações.
  Executá-lo uma vez após todos os produtores, se há fontes jurídicas.
- A entrega usa `find` sobre avaliações: avaliações duplicadas/divergentes podem
  ser aceitas pela primeira ocorrência. Exigir avaliação única por par.
- `supportChecks` não valida referências singulares nem ligação à afirmação.
  Conferir claim existente, fonte citada e fonte disponível; evidenciar inválidos.
- A avaliação de suporte desaparece da entrega. Persistir auditoria aditiva por
  afirmação/fonte com hash, trecho, correspondência literal e avaliação do modelo.
  Não confundir trecho encontrado com suporte semântico, aplicabilidade, vigência
  ou força vinculante. `legalAssessment` permanece `NOT_EVALUATED`.

## Contratos, limites e compatibilidade

Sem novas ferramentas, permissões, tribunais, fontes ou chamadas obrigatórias.
Os sete perfis recebem instruções internas específicas e versionadas.
Entregas antigas continuam legíveis por campo opcional. Checkpoints conservam
o bloqueio `TASK_CONTRACT_CONFLICT` quando política/contrato mudam: não reutilizar
avaliação velha silenciosamente. Publicação futura exige drenar execuções antigas
ou usar a imagem anterior para concluí-las; nenhum deploy é feito nesta tarefa.

O registro de suporte é produzido pelo servidor, não pelo redator. Dados do
documento continuam não confiáveis. O verificador não certifica o mérito.
Limitações novas entram na lista canônica consumida pela cobrança.
Revisão de implementação: o verificador terminal não pode produzir claims ou
requisitos novos; a entrega serializada também respeita o teto de 192.000 bytes.

## Validação

Baseline dos testes existentes; regressões que falhem no código original;
60 cenários determinísticos de handoff (12 falhas/controles × 5 contextos de
fonte), executados antes/depois com mesmo provider falso e mesmas entradas.
Separar métricas de integridade de qualidade jurídica semântica. Cobrir
ordem, retomada, cancelamento e isolamento com regressões adicionais/existentes.
Build, tipos, lint e suíte pertinente; integração API/persistência e apresentação.
Não tratar simulações como avaliação de modelo ou excelência em casos reais.

## Próximos incrementos

Grafo adaptativo, matriz probatória completa da solicitação à entrega e avaliação
semântica controlada permanecem incrementos posteriores. O relatório deste
incremento deve explicitar o que foi medido e o que continua sem evidência.
