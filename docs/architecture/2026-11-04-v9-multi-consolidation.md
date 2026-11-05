# V2-MULTI — consolidação local rastreável

A campanha original permanece intacta. Esta é uma apresentação derivada, sem chamadas pagas, sem nova execução do modelo e sem aprovação jurídica. Estado LIMITED; avaliação de Boni pendente.

## Diagnóstico

Nenhuma das quatro etapas preencheu review.equivalences. A consolidação existente aceita equivalências explícitas e duplicatas literais; por isso, paráfrases válidas permaneceram. Além disso, a geração de alertas de suporte repetia integralmente cada proposição para cada fonte insuficiente.

A correção geral agrupa esses alertas por proposição, mantendo todas as fontes afetadas e cada avaliação individual no supportAudit. Para as paráfrases desta execução, cinco declarações textuais explícitas e vinculadas por hashes geram uma cópia derivada com o consolidador existente. Não foi acrescentada eliminação automática por similaridade lexical nem presumida equivalência de sobreposições parciais. O comportamento futuro do modelo quanto a declarar equivalências não foi reavaliado.

| Tipo | Original | Derivada |
| --- | ---: | ---: |
| Proposições | 9 | 8 |
| Requisitos | 10 | 7 |
| Ressalvas | 20 | 16 |

## Grupos consolidados

- Mesma faculdade de caução e dispensa condicionada à impossibilidade de oferecê-la; mesma fonte e classificação.
- Mesma substituição editorial: não automatismo, requisitos, lacunas, reversibilidade, caução condicional e ausência de presunção. Retida redação com revisão humana explícita.
- Mesmas duas alternativas condicionais, momento de individualização e ausência de atribuição da escolha; mesmas fontes.
- Mesma objeção à caução absoluta, dispensa condicional e ausência de dados de hipossuficiência ou decisão; mesmas fontes e gravidade.
- Mesma ausência de titularidade da escolha e proibição de presumir regra supletiva; mesmas fontes e gravidade.

## Diferenças preservadas

- Composta c3 versus p1/p2: escopo e fontes distintos; não tratar cobertura parcial como equivalência.
- c5 versus p4: aplicação ao contrato e titularidade não resolvida só em c5.
- Requisitos PROCEDURAL separados das propostas EDITORIAL.
- r3, r4 e ressalvas do revisor: autenticação, vigência, extensão da revisão e lacunas não coincidem integralmente.
- Alertas de suporte individuais por fonte preservados no supportAudit.
- Ressalvas de urgência/probabilidade e de incapacidade de prestar caução mantidas quando acrescentam conteúdo ou usam fontes diferentes.

## Evidências e reprodução

[Decisões por grupo](evidence/2026-11-04-v9-multi-consolidation/decisions.json) · [Entrega derivada](evidence/2026-11-04-v9-multi-consolidation/V2-MULTI.derived.json) · [Validação](evidence/2026-11-04-v9-multi-consolidation/validation.json)

O executor exige saída nova, verifica os hashes do resultado/checkpoint/pacote e os textos das fontes. Cada grupo exige justificativa e compatibilidade de tipo, classificação, fontes e estado de verificação. Isso não automatiza julgamento semântico: as declarações registram a revisão textual local; Boni permanece o único aprovador jurídico.

Após pnpm build, reproduzir com:

```powershell
node scripts/forgelex-final-evaluation/consolidate-recorded-v9.mjs docs/architecture/evidence/2026-11-04-v9-multi-consolidation/decisions.json CAMINHO-NOVO.json
```

Os custos permanecem US$ 0,572246 de v9 e US$ 0,083620 reservados, total US$ 0,655866. Não houve commit, push, publicação ou aplicação em minuta.

## Validação

16 testes focados e a reexecução local do resultado real aprovados; build, lint focado e formatação aprovados. Foram conferidos 453 arquivos de evidência anteriores e 815 arquivos do snapshot da campanha, sem alteração de hashes.

A suíte completa terminou com 1.770 aprovados, 17 ignorados e dois timeouts de 5.000 ms:

- commercial-runtime.test.ts — charges only concrete persisted review_text results (document=false, claims=refusal).
- final-editor-routes.test.ts — aplicação humana exige seleção única, confirmação, revisão e proposta persistida.

Ambos passaram na execução isolada, sem aumento de timeout ou alteração dos testes. A suíte completa não foi repetida nem declarada inteiramente aprovada; a causa dos timeouts sob execução conjunta não foi determinada.

## Apresentação derivada

### Proposições

- Fornecimento de dois equipamentos por gênero e quantidade; não consta cláusula de escolha.
- O equipamento ainda não foi disponibilizado; não há descrição de consequência concreta da demora.
- O art. 498 disciplina a tutela específica de entrega, o prazo judicial de cumprimento e a individualização; não estabelece concessão automática de urgência por atraso. O art. 300 exige probabilidade do direito e perigo de dano ou risco ao resultado útil, e seu § 3º impede tutela antecipada quando houver perigo de irreversibilidade dos efeitos.
- O art. 300, § 1º, prevê faculdade judicial de exigir caução e possibilidade de dispensa quando a parte economicamente hipossuficiente não puder oferecê-la, não uma obrigação invariável.
- Pelo art. 498, parágrafo único, o autor individualiza a coisa na inicial se lhe couber a escolha; se a escolha couber ao réu, este a entrega individualizada no prazo judicial. O excerto contratual não permite definir a titularidade da escolha dos dois equipamentos.
- No excerto, o art. 498 disciplina tutela específica de entrega e prazo judicial de cumprimento, sem prever concessão automática de urgência pelo atraso.
- O art. 300 fornecido exige elementos de probabilidade do direito e perigo de dano ou risco ao resultado útil; seu § 3º veda tutela antecipada quando houver perigo de irreversibilidade dos efeitos.
- Pelo parágrafo único do art. 498 fornecido, se a escolha couber ao autor, ele individualizará a coisa na inicial; se couber ao réu, este a entregará individualizada no prazo judicial.

### Requisitos propostos

- Propor substituir as duas frases por: “O art. 498 disciplina a tutela específica de entrega de coisa, não tornando automática a tutela de urgência pelo atraso. Esta depende dos requisitos do art. 300, observada a vedação do § 3º quanto ao perigo de irreversibilidade da tutela antecipada. O relato de indisponibilidade não demonstra, por si, perigo concreto; o material não esclarece a reversibilidade nem permite concluir pelo preenchimento dos requisitos ou pela concessão. A caução pode ser exigida pelo juiz, conforme o caso, e pode ser dispensada nas condições do art. 300, § 1º, sem que o corpus permita presumir hipossuficiência ou decisão judicial a respeito.” Submeter a redação à revisão humana.
- Acrescentar: “Quanto aos dois equipamentos descritos por gênero e quantidade, se a escolha couber ao autor, caberá a ele individualizá-los na inicial; se couber ao réu, este os entregará individualizados no prazo judicial. O recorte contratual não contém cláusula de escolha e as fontes selecionadas não resolvem sua titularidade; nenhuma das alternativas pode ser adotada como fato do caso.”
- Registrar que a revisão utiliza exclusivamente o corpus fechado de excertos e relatos fictícios, sem exame integral do contrato, autenticação documental, comprovação dos fatos ou pesquisa de jurisprudência. Permanecem sem solução a titularidade da escolha, as consequências concretas da demora e a reversibilidade.
- Para eventual pedido de urgência, avaliar separadamente probabilidade do direito, perigo de dano ou risco ao resultado útil e, para tutela antecipada, perigo de irreversibilidade, conforme o art. 300 e § 3º, versão identificada como 2026-11-02. O corpus não permite verificar seu atendimento no caso.
- Na individualização dos dois equipamentos, manter condicionadas as alternativas do art. 498, parágrafo único, versão identificada como 2026-11-03: autor na inicial se a escolha lhe couber; réu na entrega, no prazo judicial, se lhe couber. Não definir o responsável sem esclarecimento da titularidade da escolha.
- Acrescentar à revisão: “O recorte contratual descreve dois equipamentos por gênero e quantidade, mas não atribui a escolha. As alternativas de individualização permanecem condicionais. A análise utiliza apenas excertos e relatos fictícios selecionados, sem exame integral do contrato, comprovação dos fatos ou pesquisa jurisprudencial.”
- Incluir ressalva de que a revisão do rascunho v1 abrange exclusivamente os excertos selecionados e relatos fictícios, sem exame integral do contrato, comprovação dos fatos, pesquisa jurisprudencial ou verificação independente de vigência. Não apresentar estas observações como aprovação jurídica da minuta.

### Ressalvas

- A primeira frase do rascunho atribui ao art. 498 concessão automática de urgência por atraso, confundindo a disciplina da entrega com os requisitos do art. 300. O relato de indisponibilidade não supre a lacuna sobre perigo concreto e reversibilidade.
- A segunda frase do rascunho transforma a faculdade de exigir caução em obrigação absoluta e omite a possibilidade de dispensa prevista no excerto. Não há dados sobre hipossuficiência ou decisão judicial no caso.
- A ausência de cláusula no recorte contratual limita a indicação de quem individualizará os equipamentos. A aplicação concreta das alternativas do art. 498 permanece em aberto; não se presume regra supletiva ausente do corpus.
- A afirmação de urgência automática no rascunho não encontra respaldo nos excertos. Faltam consequências concretas da demora e elementos sobre reversibilidade; a indisponibilidade relatada não resolve essas lacunas.
- A análise confronta apenas os excertos normativos fornecidos, cujas versões estão identificadas como 2026-11-02 e 2026-11-03; não houve verificação independente de vigência nem avaliação completa da aplicabilidade. O art. 498 remete a prazo fixado pelo juiz: não há decisão, marco inicial ou calendário verificados para calcular termo final.
- Na primeira frase do rascunho v1, a disciplina da entrega do art. 498 é tomada como fundamento suficiente para urgência automática. A objeção é que o art. 300 exige requisitos próprios: a indisponibilidade relatada não demonstra, por si, perigo concreto. Faltam consequências concretas da demora e elementos sobre reversibilidade; tampouco se confirma a probabilidade do direito apenas com esta revisão.
- A segunda frase, “A caução é sempre obrigatória”, conflita com a faculdade judicial e a possibilidade de dispensa do § 1º selecionado. A correção não autoriza afirmar que haverá dispensa: o corpus não informa incapacidade de oferecê-la nem decisão judicial.
- O rascunho não enfrenta a individualização dos dois equipamentos por gênero e quantidade. O art. 498 oferece alternativas dependentes da titularidade da escolha, mas o recorte contratual não a atribui. Essa lacuna impede indicar quem deve individualizar, não impede corrigir as duas afirmações existentes.
- A revisão é limitada ao rascunho identificado como v1 e às fontes selecionadas. Não há base para afirmar exame integral do contrato ou verdade dos relatos. Os excertos normativos permitem o confronto textual indicado, não uma conclusão completa sobre a concessão da medida no caso; não foi realizada pesquisa jurisprudencial nem verificação independente de vigência.
- Conferência limitada aos excertos identificados como OFFICIAL_EXCERPT, com URL do Senado: CPC-300 versão 2026-11-02; CPC-300-P1 e CPC-498 versões 2026-11-03. Esses metadados não demonstram vigência online, integralidade, aplicabilidade ao caso ou força vinculante. Não houve pesquisa jurisprudencial nem investigação de tratamento posterior.
- As proposições c3 e c5 têm suporte dividido entre fontes: nenhum dos respectivos pares isolados sustenta a proposição inteira. A leitura conjunta não supre fatos ausentes nem determina a titularidade da escolha.
- O relato de indisponibilidade não demonstra perigo concreto; faltam elementos sobre consequências da demora e reversibilidade. O excerto contratual não resolve quem escolhe os equipamentos. Preservam-se essas limitações, sem concluir pela urgência, atribuir a escolha ou presumir hipossuficiência e decisão sobre caução. Os registros literais não comprovam autenticidade ou verdade dos fatos fictícios.
- O corpus relata indisponibilidade, mas não demonstra perigo concreto nem esclarece a reversibilidade; isso limita a avaliação da urgência, sem impedir a correção do rascunho.
- O contrato selecionado não atribui a escolha e o corpus normativo não resolve sua titularidade na ausência de cláusula; fica limitada a indicação de quem deve individualizar, não a revisão das afirmações existentes.
- Suporte a conferir para “O art. 498 disciplina a tutela específica de entrega, o prazo judicial de cumprimento e a individualização; não estabelece concessão automática de urgência por atraso. O art. 300 exige probabilidade do direito e perigo de dano ou risco ao resultado útil, e seu § 3º impede tutela antecipada quando houver perigo de irreversibilidade dos efeitos.”: há fontes citadas cujo trecho, individualmente, não demonstra integralmente essa proposição. Conferir as avaliações por fonte.
- Suporte a conferir para “Pelo art. 498, parágrafo único, o autor individualiza a coisa na inicial se lhe couber a escolha; se a escolha couber ao réu, este a entrega individualizada no prazo judicial. O excerto contratual não permite definir a titularidade da escolha dos dois equipamentos.”: há fontes citadas cujo trecho, individualmente, não demonstra integralmente essa proposição. Conferir as avaliações por fonte.
