# Incremento 3 — análise probatória

Implementação local solicitada por Boni. Reutilizar o grafo e os controles dos
incrementos anteriores, sem publicação, inferência paga ou migração remota.

## Direção e limites

Adicionar a ação nativa `analyze_evidence` (Analisar fatos e provas). Reutilizar
matter-analyst para matriz e adversarial-reviewer para exame crítico, ambos no
grafo existente. Não criar framework ou especialista adicional. Alternativas:
gerar somente prosa não conserva os vínculos; criar infraestrutura probatória
paralela duplica documentos/fatos existentes. A escolha técnica é um contrato
estruturado sobre o contexto nativo, com conferência determinística de origem.

Os quatro tipos de tarefa existentes mantêm estado v2 e perfis 1.3.0. A nova
ação usa estado v3, perfis 1.4.0 e contrato de saída 6. Checkpoints v1/v2 devem
retomar sem novo planejamento nem mudança de contrato. Capturar fixture v2
antes das alterações. Limites: 10 papéis, um refinamento, 48 tools/12 por etapa,
192.000 bytes, teto comercial e autorizações atuais. Nenhuma ferramenta de
escrita será disponibilizada aos agentes.

## Contrato e percurso

Entrada: objetivo, texto e documentos versionados já selecionados. Não ampliar
silenciosamente a seleção para todo o acervo ou cadastro de fatos. Plano mantém
questões e lacunas. Analista produz alegações/inferências/conflitos e uma matriz
com linhas ligadas a claimId e issueIds, trechos literais com sourceId, offset
inicial e relação SUPPORTS/CONTRADICTS/CONTEXT, lacunas expressas; cronologia com
data textual, referência e vínculos a afirmações; contradições entre afirmações.

Servidor confere IDs únicos, referências, limites, hash de fonte e trecho no
offset declarado. Fonte jurídica, minuta ou trabalho anterior não substitui
documento probatório: referências diretas só DOCUMENT, USER_TEXT e ANSWER.
Retém separadas a ocorrência literal e a relação proposta pelo modelo. Trecho
incompatível, matriz ausente/incompleta e conflito produzem entrega limitada.
Cronologia ordena apenas datas ISO válidas literalmente presentes no trecho;
demais datas ficam como texto, sem inferir ano, prazo ou ordem certa.

Revisor recebe a matriz ativa e aponta achados/contradições. Não a substitui
silenciosamente. Refinamento pode solicitar análise jurídica pelos mecanismos
existentes; saídas arquivadas nunca compõem entrega ativa. Verificador jurídico
continua terminal quando houver AUTHORITY/NORM. Não há regra probatória jurídica
codificada, avaliação de admissibilidade, distribuição de ônus ou confirmação
automática da veracidade. legalAssessment continua NOT_EVALUATED.

Entrega persistida inclui matriz auditada e cronologia. A completude abrange
todas as afirmações da entrega ativa, inclusive as acrescentadas depois pelo
revisor ou pesquisador; as que não possuem linha geram limitação explícita.
Interface mostra
questão, alegação, trecho, relação proposta, contradições e lacunas com fontes,
sem metadados operacionais. Cobrança útil exige resultado probatório efetivo,
não apenas limitações: exigir pelo menos uma afirmação vinculada a trecho de
DOCUMENT conferido, com hash correspondente. Relatos USER_TEXT/ANSWER podem
compor a matriz limitada, mas não tornam a nova ação cobrável isoladamente.
Mesma reserva/teto, sem cobrança separada.

## Incorporação humana

A análise é candidata. O agente não escreve fatos/provas/cronologia no caso.
O incremento deve oferecer conferência humana da entrega e acesso ao caso para
incorporação pelos controles existentes. O recebimento OAuth de análises exige
grant e âncoras próprios; não simular credencial/grant para reutilizá-lo.
Uma ponte automática para esse recebimento seria mudança de autorização e fica
fora deste incremento. Deixar essa separação explícita na entrega/documentação.

## Validação

Testes antes do código: fluxo novo e revisão, origem/offset/duplicação/IDs,
documento versus relato, lacuna/contradição, cronologia incerta, retomada v2/v3,
cancelamento/revogação, limites, persistência, apresentação e cobrança. Rodar
suíte completa, tipos, build, lint, smoke PostgreSQL e E2E local pertinente.
Comparação sintética avalia estrutura e rastreabilidade, não qualidade jurídica.
