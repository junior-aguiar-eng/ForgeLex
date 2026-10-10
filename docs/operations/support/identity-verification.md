# Verificação de identidade no suporte

Versão documental 2026-10-10.v2, com governança aprovada expressamente por Boni em 10/10. Responsável pela execução, avaliação e aprovação: José Bonifácio de Aguiar Santos Júnior (Boni). Canal: junior-aguiar@hotmail.com.br. Este documento não prova implantação do atendimento. Aplica-se a [autoridade exclusiva do projeto](../../../AGENTS.md).

## Recepção e classificação

1. Registrar ticket, data, canal, categoria e pedido mínimo. Confirmar recebimento. Demandas de contratação: resposta em até cinco dias; confirmação/acesso LGPD: resposta simplificada imediata ou declaração completa até quinze dias. Registrar os prazos concretos das demais demandas.
2. Informações gerais e explicação de etapas não exigem documentos pessoais. Um `closureId` localiza um caso, mas não autentica o titular. Não confirmar existência, e-mail, saldo ou conteúdo de conta a um remetente não verificado.
3. Nunca solicitar `statusToken`, senha, JWT, API key, código de segundo fator ou número completo do cartão. Se o usuário enviar um segredo espontaneamente, restringir acesso, registrar somente o tipo e tratar sua exposição pelo procedimento de segurança; não copiar o valor no ticket, no Git ou em logs.

## Evidência proporcional

Para conta ativa, preferir pedido feito em sessão autenticada com reautenticação recente, verificado pelo operador no sistema. Alternativa: desafio de posse enviado ao canal já cadastrado, sem revelar esse canal ao solicitante. Não pedir que a pessoa encaminhe senha ou código de login ao atendente. Um remetente com endereço semelhante, um print ou um `closureId` isolado não basta.

Para conta encerrada, não recriar identidade ou desbloquear acesso. Comparar somente evidências ainda legitimamente conservadas. Uma referência de transação, confirmada no provedor e vinculada ao pedido, pode corroborar uma demanda financeira, sem provar por si a titularidade de todos os dados jurídicos. Descrever o nível de confiança e limitar a resposta ao escopo comprovado. Não reconstruir dados eliminados para identificar o solicitante.

Documento oficial é medida excepcional, justificada por risco e ausência de alternativa. Receber apenas por canal seguro com acesso restrito, permitir ocultação de campos dispensáveis e eliminar a cópia após a verificação, salvo fundamento específico. Enquanto esse canal não estiver implantado e validado, **é bloqueada a coleta de documentos de identidade**, inclusive por e-mail. Oferecer alternativa ou recusar fundamentadamente a divulgação.

## Avaliação e execução por Boni

Boni é o único responsável por avaliar, executar e aprovar dúvidas gerais, divulgação de dados pessoais, alteração de canal de acesso, estorno manual excepcional e criação de retenção extraordinária. Não se exige segundo revisor, pessoa distinta ou parecer externo. Antes da ação, Boni confere identidade, autorização, fundamento e alcance; registra a decisão e depois o resultado. Insuficiência dessas evidências continua motivo para recusa ou suspensão, sem depender de outra pessoa.

Registrar ticket, categoria, finalidade, evidência aceita em descrição sem cópia de segredo, escopo autorizado, responsável Boni, data, decisão, fundamento de eventual negativa e resultado. Restringir a consulta ao responsável autorizado. Eliminar evidência auxiliar após a verificação; conservar o registro mínimo por até 180 dias após o encerramento do ticket, salvo necessidade específica de defesa ou obrigação registrada com revisão por Boni em até 90 dias. A rotina de suporte é manual; não há expurgo automático comprovado desse canal.

## Recusa e escalonamento

Se a evidência não bastar, explicar a insuficiência sem divulgar dados da conta e indicar o meio proporcional disponível. Suspeita de fraude: pausar divulgação e escalar a Boni; incidente: preservar somente a evidência necessária, avaliar impacto e comunicação legal. Ordem judicial, representação por procurador e disputa de titularidade exigem exame da autenticidade, dos poderes e do alcance antes de acesso. Nunca prometer reversão de encerramento.

## Ensaio de mesa obrigatório antes da liberação

Registrar Boni como executor e avaliador, data e resultado para quatro casos sintéticos: dúvida com closureId sem identidade (resposta geral); solicitação de dados com closureId isolado (recusa sem confirmação); pedido financeiro corroborado (decisão fundamentada por Boni, sem movimentação real no ensaio); envio espontâneo de statusToken (tratamento restrito sem reproduzir segredo). Usar apenas identificadores fictícios. A aprovação deste roteiro não prova sua execução humana.
