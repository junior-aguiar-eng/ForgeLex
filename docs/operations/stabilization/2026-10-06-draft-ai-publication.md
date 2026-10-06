# Publicação e homologação do recebimento da IA — 06/10/2026

## Integração e CI

A terceira frente foi integrada pela [PR #49](https://github.com/junior-aguiar-eng/ForgeLex/pull/49), no SHA `ebad9b22af2c852cfbfb497f17390a3bb4dd02b0`. Os seis jobs passaram no head `73a3d14` ([CI 37511883476](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37511883476)) e no SHA integrado ([CI 37512609603](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37512609603)). O job PostgreSQL 16 executou as 13 verificações do recebimento, além dos smokes existentes. Build, lint, typecheck e a regressão local repetida após a correção das dependências passaram: 711 testes aprovados e 17 ignorados.

A primeira CI reprovou somente `security`, devido ao aviso [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h), publicado nesta data. O commit `73a3d14` atualizou SDK MCP 1.30.0→1.31.0 e client/core 2.0.0→2.2.0. `pnpm audit --prod --audit-level moderate` passou após a atualização. Essa prova se refere às dependências de produção; não afirma ausência de alertas nas dependências de desenvolvimento.

## Produção

Cloud Build `a31ac9ff-e26f-4726-8709-2df214ec8ede` concluído. Imagem publicada por digest `sha256:a10d70613c26f1b16e4d21b7b63f3534b8ea7eb285543513ace50c38c59691cf`. Backup Cloud SQL `1791312170522` concluído às 18:44:52.191Z, antes da migration. A execução `forgelex-draft-ai-migrate-5p7l2` confirmou somente `persistence-0027-draft-ai-receipts` pendente e a aplicou explicitamente. `FORGELEX_AUTO_MIGRATE=false` permanece preservado.

Runtime: `forgelex-api-prod-draft-ai-ebad9b2`, SHA `ebad9b2`, domínio `https://nexojuris.ia.br`, com 100% do tráfego. Rollback de tráfego: `forgelex-api-prod-case-ai-def36af`; não desfaz a migration aditiva. Identidade, ingresso, conta de serviço, recursos e limites do serviço foram preservados.

As duas primeiras sondagens da candidata retornaram HTTP 200 da revisão anterior e foram recusadas pelo controle de identidade. Não houve promoção com base nesses resultados. Às 18:54:33.768Z, as dez rotas da candidata passaram e os logs mostraram exclusivamente a nova revisão. A causa da observação inicial da revisão anterior não foi comprovada.

Promoção em 5%, 25% e 100%, respectivamente com 141, 146 e 142 sondas e janelas de 132, 133 e 133 segundos. Todos os estágios passaram; em 100%, somente a nova revisão foi observada. Conclusão às 19:03:25.182Z. As rotas públicas e de descoberta também passaram. Regra de roteamento, backend, NEG, tag da candidata e jobs temporários de migration/inspeção foram removidos; tags históricas sem relação com esta frente foram preservadas. A consulta final aos logs não encontrou erro de servidor desde 18:40Z até a verificação, após a homologação.

## ChatGPT, Claude e editor reais

Conexões OAuth existentes reutilizadas, com catálogo de ferramentas atualizado nos dois aplicativos. Somente o caso sintético de homologação foi autorizado, com um documento selecionado na versão 1. Documento excluído, fato e outros casos não entraram na seleção desta rodada. O destino foi o rascunho sintético `Homologação retorno IA 06-10-2026`, criado com uma versão humana inicial.

| Host | Recibo | Versão | Resultado da repetição |
|---|---|---|---|
| ChatGPT | `8cfdfcde-1d4e-49b3-bfe5-684745860c5f` | 2 | Mesmo recibo/versão/data; `isReplay:true` |
| Claude | `97b20838-f73c-4cff-aadb-8d076ac56110` | 3 | Mesmo recibo/versão/data; `isReplay:true` |

Os dois hosts consultaram o contexto, leram a primeira página do documento e executaram `draft.save_from_ai` duas vezes com argumentos idênticos. As aprovações de ferramenta foram pontuais, com **Permitir uma vez**. Antes da adoção, o editor manteve a versão humana 1 e mostrou ambos os recebimentos separados. Cada versão foi adotada conscientemente com **Usar esta versão**; o título original foi conservado. Ambas foram conferidas, localizaram a versão documental 1 e abriram sua fonte no painel. Não houve aprovação jurídica; os textos permanecem `DRAFT`, com aviso de revisão humana. O histórico conservou as versões 1, 2 e 3.

Depois da revogação pelo site, cada host executou uma nova chamada real com a chave e os argumentos originais. Ambos receberam `CASE_CONTEXT_NOT_AUTHORIZED`, com orientação para conferir as permissões. O cartão de ferramenta do Claude mostrou o request e o corpo da recusa; o ChatGPT apresentou o mesmo corpo no erro do host. Trata-se da recusa esperada, não de falha de publicação.

A auditoria PostgreSQL em transação `READ ONLY`, concluída às 19:14:34.825Z, corroborou exatamente dois recibos, quatro envios bem-sucedidos (incluindo dois replays), duas adoções e duas tentativas recusadas. As duas permissões terminaram `REVOKED`, revisão 4; a versão atual é a 3. Ambas as referências fixam a mesma versão documental selecionada. Houve **zero operações financeiras** no tenant desde o início do ensaio, às 18:20Z. Nenhuma pesquisa faturável ou documento real foi usado.

## Limites preservados

- Não houve reinstalação nem nova concessão OAuth nativa. Proteção contra reaproveitamento de concessão antiga permanece coberta pelos testes automatizados; esta rodada homologou escrita com as conexões existentes.
- A referência real foi documental, com `documentVersionId`, sem `anchorId`: a leitura da primeira página não retornou esse identificador opcional. Não se afirma homologação de âncora de trecho nesta rodada.
- Os hosts não exibiram o campo de cobrança no recibo. Cobrança zero foi corroborada pela auditoria PostgreSQL e pelo contrato/envelope automatizado, sem atribuir aos hosts uma confirmação que não mostraram.
- DOCX com fontes e pendências passou na regressão automatizada local/CI. O botão de exportação também foi acionado no navegador real, mas não se obteve prova do arquivo baixado nessa sessão; não se declara inspeção desse arquivo nativo.
- O rótulo específico do aplicativo remetente no editor continua como ponto menor adiado. A identidade do cliente está registrada no recibo; a interface mostra origem genérica IA.

Os gates de implementação, CI PostgreSQL, integração, migration, publicação e homologação real previstos para esta frente foram concluídos. O caso/rascunho sintético permanece como evidência, com acessos revogados. [Recibo operacional sem segredos](2026-10-06-draft-ai-publication.json). A publicação documental posterior não altera a imagem de runtime identificada acima.
