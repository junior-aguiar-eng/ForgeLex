# Verificação de identidade no suporte

Versão candidata 2026-09-30.v1. Responsável pela execução e escalonamento: José Bonifácio de Aguiar Santos Júnior (Boni). Canal: junior-aguiar@hotmail.com.br. Liberação vinculada ao registro da Fase 4C; este documento não prova implantação do atendimento.

## Recepção e classificação

1. Registrar ticket, data, canal, categoria e pedido mínimo. Confirmar recebimento. Demandas de contratação: resposta em até cinco dias; confirmação/acesso LGPD: resposta simplificada imediata ou declaração completa até quinze dias. Registrar os prazos concretos das demais demandas.
2. Informações gerais e explicação de etapas não exigem documentos pessoais. Um `closureId` localiza um caso, mas não autentica o titular. Não confirmar existência, e-mail, saldo ou conteúdo de conta a um remetente não verificado.
3. Nunca solicitar `statusToken`, senha, JWT, API key, código de segundo fator ou número completo do cartão. Se o usuário enviar um segredo espontaneamente, restringir acesso, registrar somente o tipo e tratar sua exposição pelo procedimento de segurança; não copiar o valor no ticket, no Git ou em logs.

## Evidência proporcional

Para conta ativa, preferir pedido feito em sessão autenticada com reautenticação recente, verificado pelo operador no sistema. Alternativa: desafio de posse enviado ao canal já cadastrado, sem revelar esse canal ao solicitante. Não pedir que a pessoa encaminhe senha ou código de login ao atendente. Um remetente com endereço semelhante, um print ou um `closureId` isolado não basta.

Para conta encerrada, não recriar identidade ou desbloquear acesso. Comparar somente evidências ainda legitimamente conservadas. Uma referência de transação, confirmada no provedor e vinculada ao pedido, pode corroborar uma demanda financeira, sem provar por si a titularidade de todos os dados jurídicos. Descrever o nível de confiança e limitar a resposta ao escopo comprovado. Não reconstruir dados eliminados para identificar o solicitante.

Documento oficial é medida excepcional, justificada por risco e ausência de alternativa. Receber apenas por canal seguro com acesso restrito, permitir ocultação de campos dispensáveis e eliminar a cópia após a verificação, salvo fundamento específico. Enquanto esse canal não estiver implantado e validado, **é bloqueada a coleta de documentos de identidade**, inclusive por e-mail. Oferecer alternativa ou recusar fundamentadamente a divulgação.

## Segregação e execução

Boni pode atender dúvidas gerais e registrar pedidos. Divulgação de dados pessoais, alteração de canal de acesso, estorno manual excepcional ou criação de retenção extraordinária exige executor e revisor humano distintos, autorizados e identificados no ticket. Enquanto não houver segundo revisor independente formalmente habilitado, **essas ações ficam bloqueadas**, preservadas respostas gerais, o fluxo autenticado já existente e o cumprimento de determinações por procedimento formal próprio. Não substituir a segunda revisão por agente automático.

Registrar ticket, categoria, finalidade, evidência aceita em descrição sem cópia de segredo, escopo autorizado, executor, revisor, data, decisão, fundamento de eventual negativa e resultado. Restringir a consulta aos responsáveis. Eliminar evidência auxiliar após a verificação; conservar o registro mínimo por até 180 dias após o encerramento do ticket, salvo necessidade específica de defesa ou obrigação registrada com revisão em até 90 dias. A rotina de suporte é manual; não há expurgo automático comprovado desse canal.

## Recusa e escalonamento

Se a evidência não bastar, explicar a insuficiência sem divulgar dados da conta e indicar o meio proporcional disponível. Suspeita de fraude: pausar divulgação e escalar a Boni; incidente: preservar somente a evidência necessária, avaliar impacto e comunicação legal. Ordem judicial, representação por procurador e disputa de titularidade exigem exame da autenticidade, dos poderes e do alcance antes de acesso. Nunca prometer reversão de encerramento.

## Ensaio de mesa obrigatório antes da liberação

Registrar executor, data e resultado para quatro casos sintéticos: dúvida com closureId sem identidade (resposta geral); solicitação de dados com closureId isolado (recusa sem confirmação); pedido financeiro corroborado (aguarda segunda revisão); envio espontâneo de statusToken (tratamento restrito sem reproduzir segredo). Usar apenas identificadores fictícios. A aprovação deste roteiro não prova sua execução humana.
