# Decisão fiscal proposta para o ForgeLex

Identificador: `FISCAL-2026-10-10.v1`. Estado: **APROVADA por Boni no escopo descrito**.
Base: main `8c1820af9ad598f6fae197699b0068e28d01e3c5`. Fontes consultadas em 10/10/2026.
Boni é o único avaliador e aprovador, conforme [AGENTS.md](../../../AGENTS.md).
Este documento não altera cadastro, cobrança, declaração, retenção ou publicação.

## Conclusão e decisão submetida à aprovação

Proponho aprovar a preparação fiscal da fase atual com as seguintes decisões:

1. Registrar Boni como pessoa física, autor e proprietário que explora diretamente
   o ForgeLex, sem empregados e sem registro empresarial/MEI declarado. Não
   inventar pessoa jurídica nem tornar abertura de empresa um requisito interno
   do software. A hipótese de tributação na PF tem fundamento a examinar na
   exploração autoral direta; não será apresentada como isenção ou enquadramento
   definitivo de qualquer modelo comercial futuro.
2. Separar receitas de clientes, movimentações próprias de homologação, taxas do
   intermediador, créditos de uso e estornos. Não calcular tributo sobre receita
   de clientes inexistente, nem concluir que a movimentação financeira total foi
   zero: há uma cobrança real controlada de R$ 25 registrada no projeto.
3. Adotar o registro financeiro mínimo e a conciliação descritos abaixo. A recarga
   e o consumo do mesmo crédito não serão contabilizados como dois recebimentos.
   O regime tributário define o momento fiscal; o ledger técnico não o decide.
4. Manter registros financeiros necessários separados do conteúdo jurídico.
   Não aprovar, nesta decisão, expurgo automático universal aos cinco anos.
   Guardar comprovantes fiscais pelo prazo aplicável à operação, com avaliação
   anual por Boni e extensão fundamentada quando houver crédito/disputa pendente.
5. Preparar a primeira venda com enquadramento municipal e emissão de documento
   definidos para o serviço efetivo. Não presumir que inexistência de CNPJ dispensa
   ISS/cadastro, nem que uma dispensa de IBS/CBS afaste IRPF ou ISS. As condições
   de operação comercial dependem desses fatos e normas, não de outro aprovador.

Aprovar esta versão encerra a **decisão de preparação fiscal** aqui delimitada.
Não comprova inscrição municipal, apuração paga, natureza fiscal definitiva dos
R$ 25 ou regularidade de vendas futuras. Essas verificações permanecem tarefas
objetivas de Boni, sem parecer externo obrigatório.

## Fatos, evidências e informações ainda ausentes

| Elemento | Situação e origem |
| --- | --- |
| Responsável PF, sem pagamentos de clientes | Declarações de Boni nesta conversa em 10/10 |
| Autoria, propriedade, exploração direta e ausência de empregados | Confirmadas por Boni em 10/10; não houve auditoria de titularidade ou folha |
| Registro empresarial/MEI | Boni declarou não possuir; isso não responde sobre inscrição municipal de autônomo |
| Município de referência | Maceió/AL, conforme os termos aprovados; estabelecimento fiscal não foi inspecionado |
| Objeto vendido | Pesquisa jurisprudencial por ferramenta própria, com créditos pré-pagos e R$ 0,20 por pesquisa válida, inclusive sem resultados; [termos](../../legal/terms-of-use.md) |
| Movimentação real controlada | Uma compra de R$ 25, processada pelo Mercado Pago, compra PAID e saldo técnico 2500 centavos; [recibo de homologação](../phase14/controlled-charge-evidence.md) |
| Informações não demonstradas | Inscrição municipal, classificação/alíquota local vigente, extrato de liquidação/taxas dos R$ 25, identificação fiscal do pagador desse teste e eventual estorno, demais atividades econômicas relevantes para IBS/CBS |

Não se solicita CPF, extrato ou documento privado no chat/Git. Basta registrar
a conclusão de Boni e uma referência restrita à evidência quando ele a conferir.

## Fundamentação do enquadramento

O [RIR/2018, art. 162, § 1º, II](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/decreto/d9580.htm)
prevê equiparação na exploração habitual e profissional lucrativa de bens/serviços.
O § 2º contém exceções, inclusive atividades autorais exploradas diretamente
pelo criador. Assim, ausência de empresa formal não afasta a regra, mas vender
algo também não permite ignorar suas exceções. Autoria e exploração direta
favorecem investigar a exceção; ausência de empregados não decide o enquadramento.

A [Lei nº 9.609/1998, art. 2º](https://www.planalto.gov.br/ccivil_03/leis/l9609.htm)
protege software pelo regime autoral e não condiciona a proteção ao registro.
Isso sustenta examinar a natureza autoral do programa; não converte automaticamente
toda prestação via software em exploração autoral excluída da equiparação.

**Interpretação para este caso:** o modelo descrito remunera execução de pesquisas
automatizadas, não vende tokens de IA nem um parecer jurídico profissional. A
autoria do instrumento e a natureza da remuneração precisam ser distinguidas.
Não foi localizada nesta análise uma solução oficial específica que enquadre
este serviço exato de Boni. Proponho manter PF como identificação factual atual,
sem concluir que toda cobrança de pesquisa é royalty ou que toda plataforma
exige constituição de PJ. A organização e o contrato efetivos de vendas futuras
podem exigir revisão desse entendimento pelo próprio Boni.

## IR, ISS e transição IBS/CBS

Se o rendimento da operação for legitimamente tributável na PF, os recebimentos
tributáveis de PF/exterior seguem a análise de Carnê-Leão; pagamentos de PJ
brasileira exigem exame das regras de fonte/declaração pertinentes. O intermediador
não deve ser presumido cliente/fonte pagadora só por transferir o dinheiro.
Não há cálculo de IRPF neste documento, pois não foram demonstrados rendimentos
tributáveis do ForgeLex nem os demais elementos da apuração mensal/pessoal.
Referência: [orientação da Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/carne-leao/rendimentos).

Para ISS, a [LC nº 116/2003](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm)
tem hipóteses distintas: processamento de informações (1.03), licenciamento de
software (1.05) e pesquisa/fornecimento de dados (17.01). O contrato atual aponta
principalmente para pesquisa e processamento de informações. **Não foi fixado
um código ou alíquota municipal**, nem caracterizado o serviço como advocacia.
Não há base aqui para calcular automaticamente ISS de 3% ou 5% sobre cada recarga.

Maceió disponibiliza [cadastro mercantil de autônomo](https://www.online.maceio.al.gov.br/9/ver_servico/24/tipo-2/cadastro%2Bmercantil%2Bde%2Bautonomo/)
e [emissão de nota fiscal no GISS](https://www.online.maceio.al.gov.br/0/ver_servico/65/perfil-1/emissao%2Bde%2Bnota%2Bfiscal%2Bde%2Bservi%C3%A7o/),
incluindo acesso para prestadores eventuais. Isso comprova a existência de vias
administrativas para PF, não sua habilitação nem aplicação automática ao ForgeLex.
Inscrição autônoma e registro empresarial são diferentes. A situação cadastral
e o regime de ISS precisam ser definidos a partir da atividade efetiva. A nota
avulsa não será presumida solução permanente para uma atividade habitual.

A reforma tributária precisa ser acompanhada separadamente: o regulamento da
CBS tem regras para PF e o nanoempreendedor possui tratamento específico.
O [CGIBS informou em 28/08/2026](https://www.cgibs.gov.br/receita-federal-do-brasil-e-o-comite-gestor-do-ibs-publicam-norma-que-estabe)
a dispensa de CNPJ e documentos eletrônicos de IBS/CBS para nanoempreendedores,
até 31/12/2028, ressalvada opção pelo regime regular. A dispensa não foi atribuída
a Boni: faltam os fatos completos do enquadramento. Não é MEI, nem dispensa
geral de IRPF, ISS ou documentos exigidos por outro regime. Referência normativa
complementar: [Decreto nº 12.955/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12955.htm).

## Registros financeiros e destinação

| Evento | Registro proposto |
| --- | --- |
| Recarga de cliente | Referência da compra, origem efetiva, natureza, datas de pagamento/disponibilidade, valor bruto, taxa e líquido; documento fiscal/referência quando aplicável |
| Consumo de crédito | Vincular à recarga/UsageEvent; não registrar novo recebimento só pelo débito de saldo |
| Reembolso ou chargeback | Vincular à operação original, valor e data; preservar trilha, sem apagar o evento original ou presumir dedução fiscal automática |
| Movimentação própria de teste | Marcar HOMOLOGAÇÃO PRÓPRIA, separada de vendas; conciliar origem/destino/taxas antes de definir o tratamento fiscal |
| Despesa de fornecedor | Identificar serviço, período e comprovante; não tratar toda despesa do projeto como dedutível automaticamente |

Os R$ 25 só poderão ser classificados como recursos próprios sem nova receita
se Boni confirmar a origem própria e a vinculação patrimonial efetivas. A
finalidade de testar o checkout, sozinha, não torna o pagamento fictício.
Não foi executado estorno, ajuste de saldo, acesso financeiro ou declaração.

O [CTN, art. 195, parágrafo único](https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm)
vincula conservação dos livros/comprovantes abrangidos à prescrição dos créditos
das operações. Decadência, constituição e prescrição têm termos distintos;
interrupções/suspensões podem afastar um descarte contado simplesmente da compra.
Logo, o candidato interno de cinco anos não é um prazo legal universal.

Proposta: conferir anualmente cada categoria fiscal e seu marco, manter somente
identificadores/valores/documentos necessários em acesso restrito e registrar
data de próxima avaliação. Ao extinguir a necessidade, Boni determina destinação
documentada. A avaliação anual não autoriza retenção indefinida sem fundamento.
Corpos de webhook dispensáveis, dados jurídicos e comprovantes fiscais não são
a mesma categoria; a política técnica publicada permanece inalterada até decisão
e implementação específicas. Os arquivos mínimos da homologação são a primeira
categoria a conciliar; documentos privados não entram no repositório.

## Registro da aprovação e tarefas resultantes

Decisão de Boni: **APROVADA no escopo descrito**. Data de aprovação: **10/10/2026**.
Manifestação expressa nesta conversa: **“Aprovo FISCAL-2026-10-10.v1 no escopo descrito. Registre a aprovação e vamos tratar braces e STJ.”**

A decisão de preparação fiscal está encerrada. A aprovação não declara
concluídos cadastros, apuração, conciliação dos R$ 25 ou comprovações comerciais.

Com a preparação aprovada, acompanhar separadamente:
confirmação da inscrição municipal; definição local de classificação/emissão;
conciliação e tratamento dos R$ 25; primeira apuração quando houver evento
tributável; reavaliação se mudar autoria, organização, contrato ou regime.
Nenhuma dessas tarefas depende de avaliação de outra pessoa. Não existe aqui
autorização para cadastro, pagamento, declaração, alteração automática de retenção
ou nova cobrança. Braces e STJ ficaram fora desta análise, conforme solicitação.
