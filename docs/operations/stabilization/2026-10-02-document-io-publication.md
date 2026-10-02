# Publicação de PDF textual e DOCX — 02/10/2026

Deploy autorizado por Boni após integração da [PR #30](https://github.com/junior-aguiar-eng/ForgeLex/pull/30).
Origem: `fbe32b2ed41488c56509f8cb35dbb36609f6f582`, main limpo; clone separado para o build.
O checkout P2 original foi preservado e não participou da imagem.
CI de main [37059120155](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37059120155)
aprovado nos seis checks existentes.

Cloud Build `ef753b00-eeea-4505-8884-3cacd718465b`: SUCCESS, concluído em `2026-10-02T20:43:47.547205Z`.
Imagem: `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:9a9a1a935ccc9f5d84ca5f7ac1d277b316748b873b5b615919131f7fd52996f8`.
Revisão `forgelex-api-prod-documents-fbe32b2` a **100%** no domínio https://nexojuris.ia.br.
Conclusão da promoção final: `2026-10-02T21:06:11.7675209Z`.
Rollback disponível: `forgelex-api-prod-a11y-b6c893c4`.

## Verificação

- Auditoria de upload: 416 arquivos do clone limpo, sem envs privados, dumps,
  chaves ou artefatos locais; somente o template versionado `.env.example`.
  Configuração pública Supabase e bundle aprovados pelo validador do Dockerfile.
- Candidata criada sem tráfego. Ingresso `internal-and-cloud-load-balancing`
  preservado. Acesso direto à tag/proxy retornou 404 por esse ingresso;
  ensaio realizado por rota temporária do balanceador, restrita a cabeçalho
  de teste. Logs confirmaram requisição na revisão candidata.
- Quatro testes Chromium aprovados na imagem candidata (33,0 s), com Auth,
  API compilada e SQLite descartáveis locais. Cobertos PDF textual e edição,
  persistência textual, limites, inválidos/sem texto e DOCX da versão salva.
  Nenhum dado de conta produtiva foi gravado por esses testes.
- Promoção inicial 5/25/100, cada etapa com pelo menos 120 s e identidade
  confirmada nos logs. A sonda final de navegação omitiu `Accept: text/html`
  e acionou rollback. Mesmo 404 reproduzido na revisão anterior, que responde
  200 como navegação HTML; contrato confirmado em `static-web.ts`.
  Corrigida a sonda, a mesma imagem foi promovida novamente a 100%, com nova
  observação de pelo menos 120 s. 645 sondas readyz 200 no total.
- Doze rotas finais HTTP 200, com cabeçalho de navegação apropriado;
  dois fluxos PDF/DOCX repetidos no domínio normal após a promoção final
  (19,9 s), com os mesmos dados locais descartáveis. Worker PDF HTTP 200,
  MIME JavaScript, 1.265.413 bytes. Capturas desktop/390 px inspecionadas;
  testes de teclado, overflow e Axe das superfícies passaram.
- Env/secrets, banco, service account, concorrência, timeout, recursos e ingresso
  preservados; somente imagem e `FORGELEX_SOURCE_SHA` alterados.
  Nenhuma migration, compra ou encerramento remoto nesta publicação.
  Sem entradas ERROR observadas nos logs da revisão durante a verificação.
- Rota, backend, NEG, tag candidata e proxy local temporários removidos.
  URL map final conferido com o inventário anterior.

## Limites

Os testes de navegador validam o frontend efetivamente servido pela imagem,
com serviços e dados locais; não comprovam escrita E2E em tenant produtivo.
Não se afirma OCR, retenção do PDF, âncora PDF nativa, fidelidade em todos os
leitores DOCX nem conformidade integral de acessibilidade. A frente P2 de
busca/recuperação de chunks continua separada. Esta observação curta não
substitui o acompanhamento operacional contínuo.

Recibo saneado: [2026-10-02-document-io-publication-proof.json](2026-10-02-document-io-publication-proof.json).
