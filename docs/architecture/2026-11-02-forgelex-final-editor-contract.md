# Contrato local do editor final

Primeiro incremento executado no checkout `forgelex-3-audit/SDK`, branch
`codex/forgelex-3-quality`, sobre `5ba4ca87f3d4602db878ce8935552354c2743ee2`.
O pedido de continuação abrangeu o contrato delimitado na
[spec](../superpowers/specs/2026-11-02-forgelex-final-editor-contract.md) e no
[plano](../historico/planos/2026-11-02-forgelex-final-editor-contract.md).

## Implementação

`legal-agents` exporta `FinalEditorialContextSchema`,
`FinalEditorialProposalSchema`, os tipos inferidos e
`validateFinalEditorialProposal(context, proposal)`. O validador é puro:
não aplica alterações, acessa persistência, chama modelos ou ativa papéis.

- Identidade/revisão/versão e hash canônico do documento devem corresponder.
  Âncoras usam índice da seção, hash do conteúdo bruto, offsets UTF-16 e trecho
  exato; espaços e Unicode não são normalizados. Não há cortes de pares
  substitutos, sobreposições ou reordenação da entrada.
- Fontes precisam existir e ter hashes coerentes. IDs ambíguos e auditorias
  duplicadas por par claim/fonte são rejeitados. Substitutos Unicode isolados
  são rejeitados nos textos hasheados e de substituição, pois a conversão
  UTF-8 poderia transformá-los no mesmo caractere de reposição.
- Propostas substantivas permanecem separadas e sem patch aplicável. Máximos:
  30 mudanças, 30 sugestões, 20 limitações e 4.000 caracteres por trecho/motivo.
  `humanReviewRequired: true` e `legalAssessment: NOT_EVALUATED` são obrigatórios;
  `LIMITED` exige ressalva. Campos de execução/aprovação são rejeitados.

O conteúdo bruto das seções é preservado mesmo que o schema geral do domínio
faça trim. O hash do documento continua usando a canonicalização da spec.
Nenhum requisito não verificado ou suporte parcial é convertido em aprovação.

## Validação local

Os 31 testes próprios passaram. A ausência inicial do módulo foi observada em
RED; casos adicionais reproduziram exceção indevida em `safeParse`, Unicode
malformado e duplicação de auditoria antes das respectivas correções.
Lint e formatação dos três arquivos e tipos de `legal-agents` e API passaram.
A suíte focada em agentes, tarefas v8 e orçamento do verificador passou com
228 testes. `pnpm test` concluiu o build completo e a suíte geral final:
**1.652 aprovados, zero falhas e 17 ignorados**, em 232 arquivos aprovados e
três condicionais ignorados.

[Recibo com hashes](evidence/2026-11-02-final-editor-contract/validation.json),
[suíte final](evidence/2026-11-02-final-editor-contract/full-suite.txt),
[testes focados](evidence/2026-11-02-final-editor-contract/focused-tests.txt) e
[regressões da revisão antes da correção](evidence/2026-11-02-final-editor-contract/red-review-findings.txt).
Os arquivos de evidência preservam os bytes dos logs locais.

Testes condicionais de PostgreSQL e integração paga ficaram desabilitados.
Chaves e aprovações reais foram esvaziadas apenas no processo dos testes;
variáveis de bancos opcionais foram removidas desse processo. Nenhum arquivo
de ambiente foi alterado. E2E e smokes PostgreSQL não foram executados.

A execução ampla preliminar começou antes das três regressões adicionais e
registrou essas três falhas. Uma execução nova foi iniciada com código e testes
estáveis após as correções; somente esse resultado final valida o incremento.

A comparação Git com o HEAD inicial confirmou ausência de mudanças nos
aplicativos, domínio, workflow, núcleo de agentes, carteira, catálogo, política
do verificador, scripts e evidências históricas. Somente os três arquivos de
código previstos e a documentação deste incremento mudaram.

## Revisão e decisões

Uma revisão IA independente examinou os arquivos novos e o diff local. As duas
tentativas com `gpt-6-astra` falharam por capacidade antes da revisão; a revisão
efetiva foi executada por `gpt-6.1-sol`. Boni continua o único aprovador humano.
Unicode malformado e auditoria duplicada foram corrigidos em uma passagem,
com regressões RED→GREEN. A duplicação foi elevada de menor para importante:
o mesmo par com `PARTIAL` e `SUPPORTED` não pode definir um contexto inequívoco.
Contextos com duplicações passam a exigir correção pelo futuro chamador;
o produtor e o runtime existentes não foram alterados.

Decisões de escopo tomadas nesta execução:

- Revisar arquivos locais contra o HEAD inicial, incluindo os não rastreados,
  e conservar evidências. Sem novo commit, comparar apenas `base...HEAD`
  omitiria toda a implementação. O checkout e a branch são preservados.
- A verificação da origem persistida, acesso e coerência do espelho
  `approvedItem` com o texto pertence ao futuro chamador servidor. Aceitar
  JSON do cliente como origem confiável seria uma integração incorreta.
- Validação estrutural não prova equivalência jurídica e não autoriza aplicar
  patches. Transportar suporte antigo para texto alterado exigiria novo exame.
- Ativação do editor final e integração ao runtime ficam fora deste incremento;
  portanto o usuário ainda não pode executar esse papel no produto.

## Limites preservados e próxima etapa

V8, os sete papéis atuais, a mesa e os limites financeiros permanecem vigentes.
Nenhuma chamada paga, alteração de ambiente, migration, commit novo, push ou
deploy. Não foram executados os outros 54 cenários.

O próximo incremento deve delimitar a obtenção autorizada da minuta entregue,
o comando explícito e o versionamento da integração com o runtime. Modelo,
custos, aplicação de patches e interface continuam decisões próprias.
D04 v8 segue sem medição real; D01/D03 da rodada paga aguardam avaliação de Boni.
