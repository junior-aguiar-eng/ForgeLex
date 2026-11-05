# Correções locais após avaliação técnica da v8

A avaliação enviada por Boni é apoio técnico de Claude, não aprovação jurídica.
Confrontar todos os itens com código e artefatos. Não modificar a campanha v8,
seus insumos, recibos nem a ficha humana. Sem inferência real, commit, push ou
publicação. Preservar alterações preexistentes e os limites financeiros.

## Sequência

1. Congelar hashes dos registros existentes. Documentar divergências:
   questões existem no JSON/mesa; prefixo é hash do nó do papel; checkpoints
   entre etapas já existem; D04 falhou antes de concluir o primeiro papel.
2. Diagnóstico permitido por categorias, sem mensagens arbitrárias; preservar
   estado anterior à chamada em caso de falha. Testar falhas simuladas e reserva
   incerta, sem presumir custo zero ou reconstruir a causa histórica.
3. Contrato opt-in v9, sem mudar perfis/contratos de checkpoints v1-v8:
   registro documental, proposições atômicas, aptidão documental, integridade,
   perguntas materiais e equivalências explícitas para consolidação rastreável.
   Reusar papéis existentes e seus tetos; nenhuma chamada extra automática.
4. Consolidação conservadora: duplicatas literais e equivalências declaradas
   pelo modelo, com validação de referências/tipos/fontes e trilha integral.
   Não usar similaridade textual para apagar ressalvas ou divergências.
   Conferir suporte documental, mantendo literalidade separada de semântica.
5. Apresentação com questões, registros/alegações/inferências, correções,
   perguntas/lacunas e limites de fonte. Alertas devem identificar seu objeto;
   estado técnico separado, sem IDs internos no texto/copiar.
6. Corpus v2 separado, casos menos óbvios e fontes oficiais selecionadas.
   Propor campanha e teto para decisão futura, sem executá-la.
7. Testes focados, compatibilidade histórica, mesa, tipos/build e regressões;
   relatório por achado com limites e hashes finais.

## Limites de comprovação

Os registros de D04 não contêm causa suficiente para atribuição retrospectiva
a rede/API/schema. Classificar falhas futuras não descobre a causa passada.
Mocks comprovam contratos e controles, não qualidade semântica do modelo real.
Consolidação semântica declarada continua proposta sujeita a revisão humana;
não converter agrupamento em confirmação factual ou jurídica.

## Resultado

Etapas 1–6 implementadas localmente; verificações da etapa 7 registradas no
[relatório](../../architecture/2026-11-03-forgelex-v9-review-remediation.md) e
seu recibo de evidência. A causa histórica e a reconciliação de D04 não foram
resolvidas por falta de dados do provedor. A qualidade semântica real e a
avaliação jurídica permanecem pendentes; a proposta de campanha não autoriza
novas chamadas. Nenhum arquivo protegido da v8 deve ser alterado na conclusão.
