# Publicação do `025f6dd` — 01 e 02/11/2026

Registro preparado em 03/11/2026 a partir da sessão que executou a publicação.
Boni é o único aprovador humano e autorizou, para esta publicação apenas, o
build, as candidatas sem tráfego, a rota temporária de verificação e a promoção.
Os horários estão em UTC; Brasília é UTC−3. Publicar o código não equivale a
ativar uma funcionalidade nem a aprovar resultados jurídicos.

## Fonte e build

| Item           | Valor                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonte          | `025f6dd438ecfd78079b4688fd076e476da74ce9` (merge da PR #101, cancelamento cooperativo)                                                                               |
| CI do commit   | seis checks `success`: validate, security, postgres, e2e-public, e2e-product, e2e-account-closure                                                                     |
| Código enviado | `git archive` do SHA em diretório limpo, sem arquivos locais; o checkout ficou destacado, sem tocar na branch `codex/case-flow-simplification`                        |
| Cloud Build    | `8bac55c3-c246-4bff-9e31-9174836cd9a9`, `SUCCESS`, 01/11 17:37:58Z a 17:42:28Z, com `ops/gcp/production/cloudbuild.yaml`                                              |
| Imagem         | `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:4a5cec7d55e248e01ccca52f6da64ae0f895c068c9a93b3464c1cb0393fdf3c9` |

O script `build-from-main.ps1` não foi usado porque exige a branch `main`. As
substituições do build reproduzem as do build `4dda49b5-a366-461d-90a5-82d7d535ad2a`
(fonte `7abf606`): `VITE_FORGELEX_SAVED_RESEARCH_ENABLED`,
`VITE_FORGELEX_CASE_WORKSPACE_ENABLED` e `VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED`
em `true`. O bundle, portanto, é compilado com a interface agêntica habilitada.

## Revisões

| Serviço                        | Antes (100%)                                      | Depois (100%)                             |
| ------------------------------ | ------------------------------------------------- | ----------------------------------------- |
| `forgelex-api-prod`            | `forgelex-api-prod-commercial-7abf606`            | `forgelex-api-prod-025f6dd-r2`            |
| `forgelex-closure-hml-private` | `forgelex-closure-hml-private-commercial-7abf606` | `forgelex-closure-hml-private-025f6dd-r2` |

As primeiras candidatas (`-025f6dd`, só com a imagem nova) foram criadas logo
após o build. Em seguida foram recriadas como `-r2` (01/11 às 17:56Z) com
**apenas** `FORGELEX_SOURCE_SHA` atualizado para o SHA publicado. Comparação
campo a campo com o estado anterior:
variáveis de ambiente (exceto essa), referências a segredos, conta de execução,
ingresso, vínculo Cloud SQL, recursos, anotações de escala e política IAM
idênticos. Nenhuma flag foi alterada; `FORGELEX_AUTO_MIGRATE=false` nos dois
serviços. Nenhuma migration foi aplicada nesta publicação.

### Configuração herdada, observada em 01/11

Estes valores já estavam na revisão anterior e foram preservados; não são uma
decisão desta publicação.

| Serviço | Flags                                                                                                                                                                                             | Instância                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| API     | `AGENTIC_WORKSPACE_ENABLED=true`, `COMMERCIAL_EXECUTION_ENABLED=true`, `CLOSED_PILOT_ENABLED=false`, `ANALISE_ENABLED=true`, `BILLING_ENABLED=true`, `SAVED_RESEARCH_ENABLED=true`                | 1 vCPU, 512 MiB, mínimo 1 instância, máximo 2, CPU sempre alocada, timeout 360 s |
| Privado | `AGENTIC_WORKSPACE_ENABLED=false`, `COMMERCIAL_EXECUTION_ENABLED=false`, `CLOSED_PILOT_ENABLED=false`, `BILLING_ENABLED=false`, `ANALISE_ENABLED=false`, `ACCOUNT_CLOSURE_SCHEDULER_ENABLED=true` | 1 vCPU, 512 MiB, máximo 1, timeout 60 s                                          |

`OPENAI_API_KEY` vem do Secret Manager na API e não existe no serviço privado.
Essa configuração corresponde à revisão `commercial-7abf606` (30/10), que não
tem recibo próprio no repositório: o [registro de 30/10](2026-10-30-publication.md)
descreve a publicação `dc68fcb` com as flags agêntica e comercial desligadas.
A diferença está registrada em [PENDENCIAS.md](../../../PENDENCIAS.md).

## Verificações antes de promover

**Serviço privado** (ingresso `all`):

- Na primeira candidata (`-025f6dd`, mesma imagem): `/readyz` 403 sem autenticação
  e 200 com a identidade invocadora `forgelex-hml-closure-invoker`
  (`status=ready`, `migrations:true`, todos os checks verdadeiros). Essa chamada
  usou impersonação da conta de serviço, antes de Boni exigir autorização nova
  para isso.
- Na `-r2` (a promovida): 403 sem autenticação. **O 200 autenticado não foi
  repetido.** O token de usuário recebe 401 e a impersonação posterior foi
  bloqueada. Boni aceitou expressamente a evidência da revisão anterior; a
  rotina de encerramento registrou HTTP 200 na revisão nova após a promoção.

**API** (ingresso `internal-and-cloud-load-balancing`): a URL da tag não é
acessível de fora (404 do Google). Com autorização de Boni, usou-se uma rota
temporária **somente aditiva** no URL map `forgelex-api-hml-map`: NEG serverless
da tag `cand-025f6dd`, backend, host-rule e path-matcher com host aleatório. A
cópia de restauração do URL map foi exportada antes, fora do repositório.

- As duas primeiras rodadas **não valem**: as requisições caíram no serviço
  padrão `forgelex-api-hml`, porque a regra ainda não tinha propagado. A prova
  só foi aceita quando os logs da própria revisão candidata mostraram as
  requisições (propagação de cerca de três minutos).
- Na candidata, confirmado por log da revisão: `/readyz` 200 com `status=ready` e
  `persistence`, `migrations`, `billing`, `source`, `auth`, `outbox`,
  `accountClosureRestore` e `matterPurgeRestore` verdadeiros; `GET /mcp` 405;
  `POST /mcp` (`initialize`) sem credencial 401.
- `/hub`, `/hub/`, `/ratione`, `/` e `/readyz` do domínio público responderam
  igual antes, durante e depois da rota (código, redirecionamento e hash do corpo).
- NEG, backend, host-rule e path-matcher foram removidos. A exportação final do
  URL map é textualmente idêntica à cópia de restauração.
- Consulta de logs delimitada (60 min, limite 30) sem eventos `ERROR` ou superiores
  nas duas revisões. Nenhuma chamada paga de IA, pesquisa faturável ou
  execução agêntica foi feita.

## Promoção, rollback e repromoção

| Momento (UTC)           | Evento                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 02/11 01:21:17–01:22:33 | Primeira promoção a 100%: privado às 01:21:51, API às 01:22:33. Nos minutos seguintes: domínio, `/mcp` 405/401 e quatro requisições da rotina de encerramento (HTTP 200) na revisão nova, sem `ERROR`.                                   |
| até 02/11 01:52         | Boni devolveu o tráfego às revisões anteriores, por interpretação equivocada das instruções, sem problema técnico. API observada na revisão anterior às 01:38; a rotina de encerramento passou a ser atendida pela anterior às 01:52:02. |
| 02/11 16:34:43–16:35:16 | **Repromoção** a pedido de Boni, após conferir que as `-r2` estavam prontas, com a imagem e o `FORGELEX_SOURCE_SHA` esperados e o URL map ainda idêntico à cópia. Privado a 100% às 16:34:51; API às 16:35:16.                           |

Conferência às 16:38Z: `/readyz` público `status=ready`; `GET /mcp` 405; `POST`
sem credencial 401; `/hub` e `/ratione` iguais à linha de base (o HTML de `/`
mudou, como esperado, pelo frontend novo); a última requisição da rotina na
revisão anterior foi às 16:34:03 e as quatro seguintes, a partir das 16:35:03,
na nova, todas HTTP 200; nenhum `ERROR` desde a promoção.

**Limpeza (02/11, após a repromoção):** removida a tag `cand-025f6dd` das duas
revisões `-r2` e apagadas as revisões intermediárias `forgelex-api-prod-025f6dd`
e `forgelex-closure-hml-private-025f6dd`. As revisões `commercial-7abf606`
permanecem para retorno de tráfego; tags antigas de outras revisões não foram
tocadas.

## Rollback

Devolver o tráfego, sem reverter schema nem apagar journals ou tabelas:

```bash
gcloud run services update-traffic forgelex-closure-hml-private --project project-bbbe1209-c295-4720-867 --region southamerica-east1 --to-revisions forgelex-closure-hml-private-commercial-7abf606=100
gcloud run services update-traffic forgelex-api-prod --project project-bbbe1209-c295-4720-867 --region southamerica-east1 --to-revisions forgelex-api-prod-commercial-7abf606=100
```

A imagem anterior continua compatível com o schema atual (a coluna da
migration 0036 é aditiva). Manter o serviço privado de encerramento e a API em
versões compatíveis com a retenção vigente.

## Limites

- O 200 autenticado do serviço privado na revisão promovida não foi repetido
  (ver acima).
- A consulta de logs é delimitada; não prova ausência universal de falhas.
- Esta publicação não exercitou a execução agêntica ou comercial de ponta a
  ponta, não fez chamada paga e não avalia qualidade jurídica. Não é recibo de
  ativação comercial.
- Leitura de readiness e MCP não substitui homologação nos hosts reais.
- `FORGELEX_DATAJUD_API_KEY` está como variável simples no serviço da API (não
  como segredo). Boni decidiu em 02/11 não alterar essa chave; o valor não é
  registrado aqui.
