# Editor final — delimitação do próximo contrato

Estado: primeiro incremento local implementado em 02/11/2026: schemas, validador
puro e fixtures. Não habilita um oitavo papel no fluxo v8. A integração e a
aplicação das propostas continuam futuras; não há aprovação de nova execução
paga, UI, infraestrutura ou publicação. Evidências e limites no
[registro de implementação](../../architecture/2026-11-02-forgelex-final-editor-contract.md).

## Finalidade e abordagem

O `final-editor` previsto no plano V2 revisa clareza, gramática e consistência
editorial preservando conteúdo jurídico. O ForgeLex já possui minuta versionada,
revisão e edição humanas, fontes vinculadas, findings e auditoria de suporte.
O incremento deve reutilizar essas estruturas; não criar outro editor de texto.

Alternativas consideradas:

- Acrescentar automaticamente um papel a toda minuta: aumentaria consumo e
  poderia alterar texto após a conferência terminal. Não adotada nesta proposta.
- Produzir propostas editoriais sobre versão explícita, sem aplicar alterações:
  abordagem proposta. Permite conferir cada trecho e mantém a minuta original.
- Aplicar somente formatação determinística: útil para layout, mas não cobre
  revisão de clareza e ambiguidades prevista para esse papel.

A primeira implementação proposta é somente contrato, validação e fixtures
locais em `legal-agents`; nenhuma chamada de modelo, rota ou mudança da mesa.
A integração futura ao runtime deverá ter versionamento próprio e comando
explícito. O v8 continua com sete papéis e o verificador terminal atual.

## Entrada proposta: FinalEditorialContext

O servidor deve construir a entrada após conferir acesso atual. IDs e hashes
fornecidos pelo cliente ou pelo modelo não constituem autorização.

| Campo | Contrato |
| --- | --- |
| `contractVersion` | `1.0.0`, contrato editorial separado de `CaseTaskState` |
| `contextId`, `contextRevision` | Contexto selecionado e sua revisão |
| `deliveryId` | Entrega existente com minuta; não aceitar checkpoint intermediário como entrega |
| `draftId`, `versionId` | Identidade e versão persistidas da minuta candidata |
| `documentHash` | SHA-256 calculado pelo servidor sobre documento canônico |
| `document` | `TaskDocumentSchema`, sem criar documento substituto na entrada |
| `claims`, `requirements`, `findings`, `supportAudit` | Conteúdo vigente da entrega, com ressalvas e estados preservados |
| `sources` | Fontes autorizadas pertinentes com IDs, hashes, extensão e limitações |

As seções de `TaskDocumentSchema` não possuem ID próprio. Para este contrato,
usar `sectionIndex` a partir de zero e hash do texto exato dessa seção; não
inventar identificadores como se fossem IDs de seções persistidas. O `documentHash` usa SHA-256 dos bytes UTF-8 de
`JSON.stringify(TaskDocumentSchema.parse(document))`; `sectionHash` usa os bytes
UTF-8 do conteúdo exato da seção, sem normalização de espaços ou Unicode.
A integração com o editor deverá mapear os IDs reais sem alterar esse significado.

## Saída proposta: FinalEditorialProposal

Envelope: versão do contrato, contexto/revisão, IDs da entrega/minuta/versão,
`documentHash`, `status: CANDIDATE | LIMITED`, `humanReviewRequired: true`,
`legalAssessment: NOT_EVALUATED`, `changes`, `substantiveSuggestions` e `limitations`.
Não contém campo de aprovação, documento completo reescrito ou ferramenta de escrita.

Cada item de `changes` contém:

- `id` local e categoria `GRAMMAR | CLARITY | CONSISTENCY`;
- `sectionIndex`, `sectionHash`, `start`, `end` em unidades UTF-16, intervalo
  semiaberto no conteúdo original, `0 <= start < end <= content.length`, sem
  dividir pares substitutos Unicode; `before` deve coincidir integralmente com ele;
- `after` não vazio, `reason` e `sourceIds` apenas para referências já presentes.

As propostas são substituições ancoradas, não operações em sequência sobre texto
já modificado. Não admitir intervalos sobrepostos, seções inexistentes, inserções
sem trecho de origem, exclusão de seção ou mudanças de título/estrutura nesta etapa.
Máximo inicial proposto: 30 mudanças, até 4.000 caracteres por trecho/motivo,
30 sugestões substantivas e 20 limitações. São limites de schema, não aumento
de teto financeiro ou garantia de caber em 2048 tokens. Excesso falha explicitamente.

`substantiveSuggestions` referencia seção/trecho e explica a questão que exige
avaliação de Boni, sem patch aplicável. Inclui propostas que mexam em fato,
valor, data, prazo, parte, pedido, fundamento, obrigação, grau de certeza,
condicionante ou ressalva. Na dúvida, usar essa categoria e manter o original.
O editor não pesquisa novas fontes, não cria claims nem declara suporte jurídico.
Textos, fontes e trechos recebidos são dados não confiáveis, nunca instruções de ferramentas.

## Validação e aplicação

O validador local deve rejeitar identidade/revisão/hash divergentes, fonte nova,
âncora que não corresponde ao texto, intervalo inválido ou sobreposto, seção
fora do documento e tentativa de incluir campos de aprovação/execução.
Conferir explicitamente os limites; não truncar para fazer passar no schema.

A validação estrutural não prova equivalência semântica. O modelo pode classificar
erradamente uma mudança como editorial; portanto nenhuma classificação autoriza
aplicação automática, alteração de fatos aprovados ou promoção de suporte parcial.
Citações, números, datas e termos jurídicos merecem conferência humana mesmo
quando a alteração passa nas regras determinísticas.

Uma futura aplicação exige seleção explícita de Boni, revalidação de acesso,
versão e conteúdo, e criação de nova versão pelos serviços de minuta existentes.
Não sobrescrever a versão de origem nem transportar a auditoria de suporte como
se validasse o texto alterado. Contradições e limitações permanecem disponíveis.
O desenho dessa aplicação/novo exame do texto será uma etapa própria.

## Critérios para o primeiro incremento local

1. Fixtures de proposta válida, versão obsoleta, fonte inventada, trecho incorreto,
   limite excedido, sobreposição, Unicode/UTF-16 e campo de aprovação indevido.
2. Demonstrar por teste que validar a proposta não altera o documento, os findings,
   a auditoria de suporte, o estado v8 ou os registros aprovados do caso.
3. Validar proposta sem mudanças e limitações explícitas sem fabricar qualidade.
4. Confirmar que o catálogo/runtime não passa a executar o papel e que não há
   dependência de chave, rede, pesquisa paga, migration ou alteração visual.

Arquivos implementados nesse primeiro incremento: `packages/legal-agents/src/final-editor-contracts.ts`,
`packages/legal-agents/src/final-editor-contracts.test.ts` e export em `index.ts`.
O contrato preserva o conteúdo bruto das seções, ao contrário do trim feito
pelo schema de domínio; o hash do documento continua canônico como definido acima.
Textos usados nos hashes de seção/fonte e substituições rejeitam substitutos
Unicode isolados para evitar identidade perdida na conversão UTF-8. Auditoria
de suporte admite apenas um registro por par de claim/fonte. A coerência do
espelho `approvedItem` e a origem autorizada permanecem responsabilidade da
futura integração com o servidor, não deste validador.

## Limites que continuam vigentes

Boni é o único avaliador/aprovador humano. O trabalho atual não autoriza chamadas
adicionais: US$ 0,25 por execução, 2048 tokens de saída, 24 chamadas e cinco minutos
continuam sendo tetos, não orçamento para ativação implícita. O teto de US$ 1,50
pertence à calibração curta autorizada e encerrada; não é saldo para nova rodada.
Sem os outros 54 cenários, comunicação externa, protocolo, push ou deploy.

Referências: [papel no plano V2](../../architecture/2026-10-10-v2-agentic-platform-reuse.md),
[matriz dos sete papéis atuais](../../architecture/2026-11-01-forgelex-3-audit.md),
[correção e limites do v8](../../architecture/2026-11-02-forgelex-d04-verifier-budget-fix.md).
