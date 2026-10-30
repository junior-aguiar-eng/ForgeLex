# Proposta comercial da execução nativa

Estado: base comercial aprovada por Boni em 30/10/2026; implementação, publicação e ativação posteriormente autorizadas, condicionadas à validação e checks.
Data: 30/10/2026. A aprovação inicial foi sem ativação. O pedido posterior de Boni autorizou concluir o fluxo, integrar, publicar e ativar após validação. O piloto histórico permanece encerrado e separado. O estado efetivo e os gates estão no [manual comercial](commercial-execution.md).

## Oferta inicial

Cobrar por trabalho, usando o saldo pré-pago BRL já existente, sem assinatura
nova ou renovação automática. Manter os pacotes atuais de R$ 25, R$ 50 e R$ 80.
O custo da pesquisa existente permanece separado: esta oferta inicial não inclui
pesquisa paga nem a aciona implicitamente.

Na interface, mostrar apenas o resultado solicitado e o limite em reais antes
de iniciar: **“Este trabalho custa até R$ 5,00. O saldo não utilizado será
liberado.”** Um botão **Iniciar trabalho**, progresso claro e opção **Cancelar**.
Bibliotecas, modelos, tokens, câmbio e etapas internas ficam fora do fluxo normal.
O comprovante do trabalho mostra valor reservado, cobrado e liberado. O editor
mantém revisão humana antes de qualquer uso profissional.

## Preço e margem proposta

Premissas de planejamento, ainda não custos efetivos do negócio:

- Câmbio de referência interno: R$ 6,00/US$; é uma hipótese, não cotação atual.
- Reserva de 20% sobre inferência para variações; R$ 0,10 por trabalho para
  operação. Esses valores precisam ser confrontados com despesas reais.
- Deduções simuladas de 10% da receita para tributos e pagamento; não constituem
  determinação fiscal. Margem de contribuição desejada: 50% da receita, após
  essas deduções e o custo ajustado, antes das despesas fixas.

Custo ajustado = custo de inferência USD × 6 × 1,20 + R$ 0,10.
Preço = maior entre R$ 0,50 e o custo ajustado ÷ 0,40, arredondado para cima
no centavo. A taxa de 0,40 corresponde a 1 − 0,10 − 0,50.

| Inferência medida | Custo ajustado | Preço calculado | Contribuição simulada |
| ----------------- | -------------- | --------------- | --------------------- |
| US$ 0,01          | R$ 0,172       | R$ 0,50         | R$ 0,278 (55,6%)      |
| US$ 0,10          | R$ 0,82        | R$ 2,05         | R$ 1,025 (50%)        |
| US$ 0,25          | R$ 1,90        | R$ 4,75         | R$ 2,375 (50%)        |

A simulação usa tarifa Standard do gpt-6.1-sol conferida em 30/10: US$ 2 por
milhão de tokens de entrada e US$ 10 de saída; cache de entrada US$ 0,10 por
milhão. Não assume desconto, crédito promocional nem custo zero. Contexto longo,
cache escrito e serviços adicionais exigem política explícita; ficam fora da
oferta inicial. [Tabela oficial da OpenAI](https://developers.openai.com/api/docs/pricing).

Amostras sintéticas do piloto não demonstram custo médio de trabalhos reais.
O relatório oficial de custo zero não valida esta margem. Câmbio, taxas e
infraestrutura precisam ser medidos antes de assumir rentabilidade. Se as
premissas mudarem, suspender novas autorizações até revalidar a política; não
reprecificar retroativamente um trabalho autorizado.

## Limites iniciais propostos

Teto de inferência de US$ 0,25 e teto de cobrança de R$ 5,00 por trabalho.
Até 24 chamadas internas, 2.048 tokens de saída por chamada, 64.000 bytes por
requisição, 30 segundos por chamada e cinco minutos por trabalho. Aplicar
sempre o limite que ocorrer primeiro. Uma execução ativa por conta, limite de
R$ 20 por dia e R$ 100 por mês, incluindo reservas em andamento. Atingir limite
interrompe novas chamadas; não autoriza recarga ou continuação automática.

Reservar o teto em BRL antes de começar e conferir o limite USD antes de cada
envio. Cobrar somente o valor calculado do consumo válido, sem superar o teto
aceito; liberar o restante ao término. O piso não autoriza cobrança acima do
teto nem débito por execução que não chegou a enviar chamada.

## Cancelamentos e falhas

Antes do envio: liberar toda a reserva, sem cobrança. Após envio: parar novas
chamadas imediatamente; nenhuma repetição automática para descobrir o custo.
Se houver entrega parcial utilizável, oferecer conservá-la; eventual cobrança
segue o consumo comprovado, o teto aceito e a regra previamente exibida. Se não
houver entrega utilizável, proposta de cobrança ao cliente: zero; ForgeLex
absorve o custo externo comprovado dentro do orçamento autorizado.

Custo sem uso mensurável não vira débito estimado do cliente. Liberar a reserva
BRL do cliente no encerramento e registrar a incerteza na conta operacional
própria do ForgeLex, sem apagar a obrigação externa. Bloquear novos envios da
execução afetada até conciliação. Não usar provisão do piloto como fatura, não
liquidar novamente uma chamada PROVISIONED e não criar estorno sem débito.

## Requisitos de implementação registrados na aprovação inicial

O sistema atual tem saldo comercial BRL e orçamento sintético USD separados.
Não existe ainda política comercial ativa que conecte essa nova cobrança ao
executor nativo de clientes. Implementar reserva/débito/liberação BRL por
trabalho, política versionada de câmbio e tarifa, conta operacional USD,
limites cumulativos, conciliação, cancelamento com incerteza e comprovante.
Validar persistência, concorrência, idempotência, isolamento e recuperação.

A composição real existente é restrita ao piloto de Boni e à fixture sintética;
ela não pode ser convertida em produção por simples alteração de flags.
O frontend publicado também continua com entrada agêntica desligada.
Aprovação desta proposta é decisão de produto e preço, não prova de que essas
capacidades comerciais já foram entregues ou autorização para abrir clientes.

Boni é o único avaliador e aprovador. Decisão expressa em 30/10/2026: **“Aprovar como base, sem ativar”**. As premissas e limites deste documento foram apresentados antes da decisão; a implementação comercial e a abertura a clientes permanecem fora desta aprovação.
