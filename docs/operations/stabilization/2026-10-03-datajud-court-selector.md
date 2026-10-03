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
Build, lint e typecheck aprovados. Publicação será registrada ao concluir.
