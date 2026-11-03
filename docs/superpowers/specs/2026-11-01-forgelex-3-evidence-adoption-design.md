# Incremento 4 — incorporação probatória mediante decisão humana

Boni solicitou implementação e validação locais. Não autoriza publicação,
commit/push, migration remota ou inferência paga. Boni é o único aprovador humano.

## Escolha técnica

Reutilizar os repositórios de fatos/provas/cronologia/questões e a lógica de
incorporação já usada pelas análises recebidas. A entrada nativa terá sua própria
fronteira de sessão; não fabricará grant ou identidade OAuth. O fluxo OAuth
existente permanece com seus contratos e permissões.

Adicionar coluna nullable `evidence_review_json` à entrega nativa (migration
0037), separada do payload original e de seu hash. Guarda versão/revisão,
decisões, ator/data, IDs criados e chaves idempotentes. Essa escolha reutiliza
o escopo, propriedade e expurgo da entrega, evitando tabela paralela de dados
do caso e alteração das colunas OAuth existentes. A entrega original nunca
será reescrita pela revisão. GET de conferência não incorpora nem aprova nada.

## Itens e proveniência

Servidor deriva itens determinísticos da matriz persistida: fatos por linha,
provas por referência DOCUMENT, eventos da cronologia, questões, lacunas e
contradições (estas como questões controvertidas). IDs são gerados pelo servidor
e vinculados à entrega, não aceitos como alvos arbitrários do cliente.

Relatos USER_TEXT/ANSWER podem gerar fatos ASSERTED mediante aprovação expressa,
sem prova documental fictícia. Conflitos geram DISPUTED. Nenhum item vira fato
CONFIRMED. Origem, referência e texto proposto ficam disponíveis à conferência;
a decisão conserva o texto aprovado e os IDs criados.

Referência documental exige mesmo documento/caso/versão/hash, conteúdo literal
no offset informado e documento ativo. Resolver âncora existente pelo intervalo;
se o trecho cruzar parágrafos, usar interseções literais com âncoras existentes,
sem inventar âncora ou descartar parte documental silenciosamente. Referências
inválidas/alteradas bloqueiam o item. Uma prova vinculada exige adoção do fato
correspondente antes ou no mesmo lote. Datas incertas não viram eventos por
inferência: a pessoa pode informar uma data ISO válida na revisão, registrada
como decisão humana. Não editar fontes, relações ou IDs pelo comando de aprovação.

Somente o caso já vinculado à execução pode receber itens. Entregas sem caso,
execuções não concluídas, contexto alterado, caso inativo ou acesso revogado não
podem ser incorporados. Não se amplia a seleção para outros documentos/casos.

## Transação e autorização

Rotas nativas de preview e decisão junto à entrega. Exigir sessão, research:read
e matter:read; decisão também exige matter:write e `approved: true`. Não expor
essa escrita como ferramenta de agente/MCP. Revalidar autorização dentro da
transação. Ordem: tenant → conversa → caso → entrega/documentos; reutilizar
MatterWriteGuard. Decisões e criações devem confirmar ou reverter juntas.
Manter `canManageExecution` do runtime piloto/comercial, sem reutilizar o bloqueio
genérico de comandos POST do piloto. Na resolução entre âncoras, tolerar somente
whitespace descoberto. Datas humanas devem validar calendário, não só formato.

Token da conferência vincula conteúdo original, revisão das decisões,
disponibilidade/versionamento das fontes e ciclo de vida do caso. Mudança após
preview exige nova conferência. Comando idempotente com mesmo conteúdo não cria
duplicatas; chave reutilizada com conteúdo diferente é conflito. Uma aprovação
concorrente não pode decidir o mesmo item duas vezes.

Limites locais: até 1.000 itens derivados e 1.000.000 bytes de revisão; até 50
decisões por comando. Exceder limite falha explicitamente, sem truncamento.
Não altera limites do agente, reserva, preço, cobrança ou checkpoints v1/v2/v3.

## Interface e validação

Na entrega, abrir conferência com propostas, trechos/fontes, seleção inicialmente
vazia, edição do texto e data quando pertinente. Ações explícitas Incorporar
selecionados e Descartar selecionados; resultado registra cada decisão. Mostrar
pendências impeditivas, preservar edição em falha e atualizar caso após sucesso.
Nenhuma confirmação de terceiro e nenhuma seleção automática de fatos dependentes.

Testes: migração idempotente SQLite/PostgreSQL, preview sem efeitos, subconjunto
aprovado/editado/descartado, texto sem documento, datas incertas, âncoras e offsets,
versão/arquivo/acesso alterados, caso cruzado, sessão/scopes, atomicidade,
concorrência e repetição, entrega/hash e finanças intactos, expurgo herdado.
E2E local com sessão e dados sintéticos. Revisão técnica independente antes da
suíte final. Build/tipos/lint antes de Vitest integral com um worker, evitando
contenção e sem aumentar timeouts.
