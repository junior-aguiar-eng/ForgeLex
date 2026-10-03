# Consulta processual: seletor de tribunais

A página `/consulta-processual`, os menus e os metadados passam a usar
uma identificação geral, sem uma aba exclusiva de TJAL. Formulário com
seletor de tribunal, inicialmente `TJAL — Alagoas`. A seleção apenas
altera o formulário; a consulta continua iniciada por Consultar/Enter.

`apps/web/src/datajud-courts.ts` centraliza tribunais integrados, rótulos,
segmentos CNJ e endpoints. O cliente usa a configuração selecionada e
confere que a resposta e seus registros pertencem a esse tribunal.
Tribunal não integrado é rejeitado antes de qualquer chamada; não se
apresentam outros tribunais como disponíveis. O resultado identifica seu
tribunal independentemente dos filtros atuais. Seletor desabilitado
somente enquanto a consulta estiver em andamento.

Para incluir outro tribunal, é necessário integrar e validar seu endpoint
no backend e depois acrescentar sua configuração nesta lista. A tela e
o cliente não precisam de uma cópia específica para cada tribunal.
O endpoint TJAL e o contrato público atual são preservados, incluindo
`lookupTjalProcess` como delegação compatível. Sem mudança de backend,
banco, cobrança, autenticação, quotas ou prazos de 60/75 s.

## Validação

Red/green do seletor e do despacho pelo tribunal configurado. 12 testes
unitários aprovados; 14 E2E públicos aprovados em 60,0 s, com fixtures,
teclado, zero consultas na seleção, bloqueio durante espera, ausência de
autenticação/débito e acessibilidade/layout em 375/768/1024/1280/1440 px.
Build, lint e typecheck aprovados. Publicação confirmada abaixo.

## Publicação

PR #41 integrada em `b639b5755292841a708cb2549eabb979411ee359`, com seis checks aprovados
na PR e em main. Cloud Build `ea830490-b7cc-48c5-aec0-743bc3045547`: SUCCESS.
Imagem `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:3cfb253cf9706e69cbc6040adf33d48812af12084366837dae30d147ed730448`.
Revisão `forgelex-api-prod-datajud-b639b57` a 100% em https://nexojuris.ia.br/consulta-processual.
Rollback preservado: `forgelex-api-prod-datajud-8f19255`.

14 E2E na candidata e 14 no domínio normal aprovados, com consultas de
processo interceptadas por fixtures. Inspeção visual remota em 375/1440 px,
sem consultar a fonte. API pública mantém 400/FREE/zero créditos para
entrada inválida; histórico, conta financeira e status MCP sem credencial
mantêm 401. 57 readyz 200 em 120.075 s, confirmados nos logs da nova
revisão. Configuração anterior preservada, helpers removidos e
0 logs ERROR na conferência final da revisão. P2 original preservado.

Esta alteração não modifica a API DataJud nem a conexão ao provedor.
Não foram repetidas consultas reais de processos no CNJ. A validação
preenchida da API foi registrada na publicação anterior; os testes desta
frente demonstram seleção, encaminhamento e exibição na nova interface.

Evidência: [recibo sanitizado](./2026-10-03-datajud-court-selector-proof.json).
