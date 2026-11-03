# ForgeLex — contexto aprovado na elaboração e revisão

Implementação local de 02/11/2026, na branch `codex/forgelex-3-quality`.
Boni autorizou continuar este incremento, preservando a mesa ajustada pelo
Claude Code: opções objetivas para o cliente, engenharia nos bastidores.

## Comportamento

Novos pedidos de um caso recuperam automaticamente os fatos e provas que foram
incorporados pela revisão probatória nativa. O texto revisado por Boni substitui
a proposta original como contexto de elaboração e revisão. Propostas pendentes,
descartes e registros manuais sem esse recibo não entram nessa recuperação.

A mesa conserva as opções e o compositor existentes. Não há catálogo, seletor
de fatos por pedido ou configuração de agentes. As fontes consultáveis mostram
texto aprovado e trechos, com abertura do documento, sem identificadores ou hashes.
O aviso comercial inclui o envio dos fatos e provas já aprovados do caso.

A elaboração vincula os fatos e as provas citados às seções da minuta. A revisão
recebe o mesmo contexto e a minuta escolhida, produzindo observações sem aprovar
ou sobrescrever a peça. Alegação e controvérsia continuam assim classificadas;
aprovação de incorporação não confirma verdade ou força probante.

## Controles internos

- Referências congeladas no contexto, capturadas pelo servidor. O corpo público
  rejeita esse campo. Novos pedidos podem atualizar a captura; respostas e
  retomadas conservam as referências. O contexto público omite esses metadados.
- Isolamento de tenant, usuário e caso, recibo da aprovação, integridade da entrega,
  registros atuais, relações e âncoras, versão ativa, hash e trechos são conferidos
  antes do uso e da gravação. Fontes recuperadas levam somente trechos aprovados;
  documentos inteiros continuam dependendo da seleção já existente.
- Na consulta histórica, são conferidos o recibo, a captura original e o acesso
  à versão documental original. Edições posteriores do fato não reescrevem nem
  impedem a leitura de uma entrega antiga; revogação de acesso continua bloqueando.
- Os vínculos de seção derivam das fontes confiáveis do servidor. Reclassificar
  uma fonte aprovada como autoridade ou relato, omitindo sua proveniência, é
  rejeitado. A nova versão de minuta continua `WORKFLOW`/`DRAFT`.
- Se o contexto aprovado mudar entre admissão e processamento, o pedido termina
  com `CONTEXT_CHANGED`, segue para fechamento financeiro e não bloqueia a fila.
- Estado v4/perfil 1.5 apenas para pedidos com fontes aprovadas. v1/v2/v3 e seus
  contratos de retomada permanecem. Sem nova migration: usa contexto JSON e a
  migration 0037 da incorporação já implementada. Tetos, cobrança STJ incluída,
  consentimento, limites de ferramentas e OAuth não foram substituídos.

## Limites

Até 50 itens aprovados, 128 KB de fontes e consulta a no máximo 1.000 recibos
revisados do caso. Excesso bloqueia sem omitir silenciosamente parte do material.
Itens alterados fora da aprovação deixam de ser utilizáveis automaticamente;
a entrega histórica permanece disponível enquanto houver acesso às suas fontes.
Não há reaprovação automática dessas alterações.

Os testes usam dados e transporte sintéticos. Demonstram integração e controles,
não qualidade jurídica de inferência real nem aprovação de peças reais.

## Validação

Resultados consolidados no recibo
[evidence/2026-11-02-approved-case-context-validation.json](evidence/2026-11-02-approved-case-context-validation.json).
O percurso E2E cobre análise, edição/aprovação, elaboração e revisão, sem nova
seleção de fatos; inclui recuperação de resposta perdida e cobrança sintética.
PostgreSQL local cobre recuperação por outro processo, vínculos de minuta,
concorrência com arquivamento e expurgo. Build, tipos e lint passaram. Suíte geral: 1.569 aprovados, 17 pulados.
PostgreSQL: 41 testes aprovados, cobrindo os 16 cenários condicionais da suíte
padrão, e 11 verificações de persistência/concorrência. O teste com provedor
real pago permaneceu pulado. Navegador: 3 cenários aprovados.

Sem commit, push, integração, publicação, migração remota ou inferência paga.
