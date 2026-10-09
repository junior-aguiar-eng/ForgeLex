# Dependências de build — 07/10/2026

Atualizados por overrides específicos: `source-map-js` 1.2.1 → 1.2.2 e
`postcss-selector-parser` 6.1.4 → 7.1.6. Ambos chegam pelo build Tailwind/PostCSS;
o segundo muda de major. Build web aprovado e CSS emitido idêntico byte a byte
ao baseline desta branch (SHA-256
`ab1e0070089afde94fc6f296fbb3bc145119d5d94ace12146452e6396128e4a0`).

`pnpm audit --prod --audit-level moderate`: nenhum alerta em 07/10.
O audit completo mantém um alerta alto em `braces` 3.0.3:
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
O audit pnpm indica correção em >=3.0.4, mas o registry consultado nesta data
ainda publica 3.0.3 como latest. Portanto o alerta não está corrigido upstream.

A cadeia observada é Tailwind → fast-glob/micromatch/chokidar → braces.
O Docker instala as dependências no estágio de build e entrega apenas as
dependências de produção da API e o frontend compilado. Não foi demonstrado
uso de padrões de usuários nessa cadeia no runtime. Isso limita a exposição
observada; não elimina a vulnerabilidade da ferramenta de build.

Até haver versão corrigida, manter o build em runner isolado, com arquivos e
globs revisados do repositório; não executar esse build sobre conteúdo enviado
por usuários. Reavaliar o alerta no acompanhamento operacional e atualizar a
versão corrigida quando disponível, repetindo o build e a conferência de CSS.
Nenhum alerta foi descartado ou marcado como resolvido por esta avaliação.

Referências: [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q),
[selector-parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).

## Aditivo de 09/10/2026

GitHub mantém o advisory sem patched version e npm latest 3.0.3. Implementado
patch local de limite de profundidade nos walkers, com regressão da dependência
real e auditoria completa na CI; o alerta continua visível, sem descarte.
Conferência, testes, revisão temporária e limites no
[registro residual](2026-10-09-audit-residual-closure.md).
