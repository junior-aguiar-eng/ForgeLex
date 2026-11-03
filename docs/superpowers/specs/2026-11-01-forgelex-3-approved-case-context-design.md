# Fatos e provas aprovados na elaboração e revisão

## Correção de direção expressa por Boni — 01/11/2026

A experiência aprovada é a mesa ajustada pelo Claude Code: mesa e pedidos,
com opções objetivas sobre o resultado que o cliente precisa. A arquitetura,
os agentes, o planejamento, a pesquisa e os controles ficam nos bastidores.
Não expor catálogo técnico, seleção de capacidades, grafo, etapas, revisões,
hashes ou matriz de cobertura como configuração do trabalho.

A proposta anterior deste documento exigia selecionar novamente cada fato e
prova em cada pedido. Essa exigência foi uma decisão de implementação, não
um requisito de Boni, e foi retirada após sua correção. Não adicionar esse
seletor à mesa. Os contratos e o teste incompleto dessa proposta foram retirados
antes de integrar comportamento de produção.

## Comportamento pretendido

Ao elaborar ou revisar uma peça de um caso, o servidor deve recuperar os fatos
e provas já aprovados para esse caso, mantendo os textos revisados e sua origem.
O cliente escolhe o resultado jurídico desejado. Não precisa configurar o uso
dos itens já aprovados. Aprovar itens novos continua sendo uma decisão concreta
de Boni; o agente não pode realizá-la em seu nome.

A reutilização automática deve manter o isolamento de usuário e caso, congelar
o contexto de cada pedido e revalidar fontes, vínculos e acesso antes do uso e
da gravação. Aprovação para incorporar não transforma alegação em verdade.
Preservar relações contrárias, controvérsias e lacunas. Usar os trechos aprovados
não autoriza enviar documentos inteiros que não façam parte do pedido.

Retomadas conservam o contexto congelado; novos pedidos recuperam o estado
aprovado atual. Históricos existentes não devem ser reescritos. Vínculos entre
seções de minutas e fatos/provas devem vir de dados validados pelo servidor.
Cobrança, teto com pesquisa STJ incluída e consentimento comercial permanecem.

## Estado — 02/11/2026

A captura automática e o uso pelos agentes foram implementados localmente.
Não foi adicionado seletor por pedido. Referências internas opcionais no contexto,
fontes CASE_FACT/CASE_EVIDENCE, estado v4/perfil 1.5 e vínculos de minuta preservam
os registros históricos. Consulta histórica usa a versão original e acesso
vigente; execução exige correspondência com o estado atual.

Limites: 50 itens, 128 KB e 1.000 recibos por caso, sem truncamento silencioso.
Registros alterados fora da aprovação exigem conferência antes de novo uso; não
são revalidados semanticamente pelo agente. A leitura histórica não reescreve
conteúdo. Validação e limites no relatório de arquitetura de 02/11/2026.

Sem commit, push, publicação, migração remota ou inferência paga.
