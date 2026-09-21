# Plano de conclusão progressiva do ForgeLex

**Objetivo:** estabilizar completamente o ForgeLex como infraestrutura jurídica própria, usando o STJ como única fonte jurisprudencial comercial. A expansão para STF, TST, TJSP, TJRJ e TRF3 é opcional, individual e não integra o critério de completude do produto STJ.

**Arquitetura:** o ForgeLex fornecerá ferramentas jurídicas verificáveis, prompts e workflows versionados, API REST e MCP remoto sobre a mesma infraestrutura jurisprudencial própria. A busca pública não consultará diretamente o SCON a cada operação: o SCON será fonte oficial de ingestão, enquanto o ForgeLex manterá documentos, versões, proveniência, hashes, cobertura e índice próprios. No caso agêntico comercial inicial, ChatGPT, Claude ou outro host externo fornecerá o modelo e o raciocínio; o MCP fornecerá as tools, schemas, autenticação, autorização, proveniência, limites e cobrança das operações próprias. O Agent Core e os adapters OpenAI/Anthropic permanecerão camadas opcionais para integrações próprias, fora do runtime comercial e sem qualquer relação com billing de tokens.

**Critério central:** nenhuma fase posterior começa enquanto a fase anterior não estiver concluída em código, contratos, testes, documentação e validação operacional. Uma pendência descoberta durante uma fase retorna para a fase responsável; não será empurrada para uma etapa posterior.

**Regra de sequência do produto:** a dependência obrigatória é `Legal Data Plane → Legal Tool Gateway → API REST e MCP → prompts e workflows agênticos → Agent Core opcional → adapters opcionais de providers`. API REST e MCP nunca dependerão do Agent Core. As Fases 0 a 8 formam um único ciclo de estabilização completa do ForgeLex usando exclusivamente o STJ. A decisão estratégica `STRATEGIC_FREEZE_2026-09-21` congela as Fases 9 a 13: STF, TST, TJSP, TJRJ e TRF3 não serão implementados, integrados, habilitados nem tratados como pendência ou bloqueio. A Fase 14 passa a suceder a Fase 8 como consolidação operacional do produto STJ; a expansão só poderá ser retomada por decisão estratégica expressa.

## Regras globais

- O ForgeLex nunca fornecerá modelo de IA, receberá chaves OpenAI/Anthropic ou cobrará tokens.
- O preço inicial aprovado será de R$ 0,20 por busca jurisprudencial unitária do STJ, com créditos pré-pagos; esse valor não representa o preço de uma pesquisa agêntica inteira nem de um workflow completo.
- Busca para tribunal não suportado não gera débito, `UsageEvent` ou lançamento no ledger.
- Busca suportada sem resultados continua sendo uma operação executada e permanece faturável.
- REST e MCP devem produzir o mesmo resultado jurídico, proveniência, status de suporte e regra de cobrança.
- Uma pesquisa agêntica é a composição de chamadas às tools jurídicas do ForgeLex. Cada operação própria executada segue sua classificação de billing; eventual tarifa composta de workflow só poderá existir mediante decisão comercial posterior e explícita.
- O ForgeLex não fornece modelo, não recebe chaves OpenAI/Anthropic, não calcula margem sobre modelos de terceiros, não converte custos externos em USD/BRL e não cobra tokens.
- Tokens, modelo, provider de IA e custo externo podem existir como metadados técnicos de uma integração opcional, mas nunca são métrica comercial, unidade de débito, margem, cotação ou evento de billing do ledger ForgeLex.
- O catálogo só exibirá um tribunal como pesquisável depois que sua fase estiver concluída.
- O corpus jurisprudencial será global e não pertencerá a um tenant; o billing, auditoria e autenticação continuarão isolados por tenant.
- Migrations serão incrementais e compatíveis com o histórico já aplicado.
- Migrations remotas, deploy, push e homologação externa dependerão de autorização operacional própria.
- Cada fase terminará com commit(s) Conventional Commits, testes focados, suíte completa e atualização documental correspondente.

## Definição obrigatória de fase concluída

Uma fase só será encerrada quando todos os itens seguintes estiverem atendidos:

1. código implementado e integrado ao fluxo real;
2. testes unitários e de contrato;
3. testes de integração com autenticação, tenant e billing quando aplicável;
4. teste negativo para falhas e estados indisponíveis;
5. documentação técnica e comercial atualizada;
6. OpenAPI, MCP e frontend coerentes com o comportamento real;
7. validação PostgreSQL local quando houver alteração de persistência;
8. `pnpm typecheck`;
9. `pnpm test`;
10. `pnpm --filter @forgelex/web build`;
11. `git diff --check`;
12. registro explícito das evidências e dos limites restantes.

---

## Superfície agêntica comercial do MCP

O MCP é uma superfície comercial de acesso às capacidades jurídicas do ForgeLex, e não um adapter de modelo. ChatGPT, Claude ou outro host externo fornece o modelo, o contexto conversacional e o raciocínio; o ForgeLex recebe somente a chamada autenticada da ferramenta e os argumentos previstos no schema.

O pacote MCP deverá:

- publicar um conjunto controlado de ferramentas jurídicas do `Legal Tool Gateway`;
- expor nome estável, descrição semântica, versão do contrato, schema de entrada e saída, capabilities, pré-condições, limites, erros estruturados e política de aprovação;
- permitir chamadas sucessivas durante uma pesquisa agêntica, inclusive busca, obtenção e verificação de autoridade;
- autenticar o usuário e resolver tenant, identidade, autorização e entitlement no servidor;
- aplicar idempotência, rate limit, quota, auditoria, proveniência e cobrança da operação jurídica executada;
- reutilizar os mesmos application services consumidos pela API REST;
- retornar jurisprudência, ementas, metadados, status de verificação e proveniência, sem sintetizar ou inventar autoridade;
- rejeitar capability ou tribunal não habilitado antes de qualquer débito.

O MCP não acessa conversas completas, arquivos, histórico, prompts privados ou contexto do ChatGPT/Claude. Ele não recebe nem precisa de chave OpenAI/Anthropic e não hospeda modelo. Somente os argumentos enviados à ferramenta e os dados necessários para executar a capability entram no escopo da requisição. O host pode usar prompts e instruções próprias ou prompts/workflows versionados pelo ForgeLex, mas a execução do modelo continua fora do ForgeLex.

API REST e MCP são duas superfícies de distribuição para a mesma infraestrutura jurisprudencial e para os mesmos contratos do gateway. O desenvolvedor usa a API REST diretamente em seu software com API key do ForgeLex e paga pelas operações da API; qualquer OpenAI, Anthropic ou outro modelo usado por esse software pertence à integração do desenvolvedor. O Agent Core não é pré-requisito para nenhuma delas: uma chamada MCP pode executar o primeiro fluxo agêntico comercial mesmo quando nenhum modelo ou runtime de agente existe no ForgeLex.

---

## Fase 0 — Baseline exclusivo do STJ, contratos e bloqueios comerciais

**Objetivo:** preparar a estabilização do ForgeLex exclusivamente com o STJ como única fonte comercial habilitada. Esta fase não implementa, não integra e não inicia STF, TST, TJSP, TJRJ ou TRF3.

**Readequação da fase já concluída:** o baseline comercial, os bloqueios de tribunais e as proteções do ledger já implementados permanecem válidos e não serão refeitos. O complemento desta fase limita-se a registrar e validar o MCP como primeiro caso agêntico comercial, sem transformar o Agent Core ou um provider de IA em dependência.

**Áreas:**

- `packages/source-catalog`;
- `packages/source-providers`;
- `packages/legal-tools`;
- `packages/mcp-server`;
- contratos de prompts e workflows;
- `apps/api/src/app.ts`;
- `apps/api/src/distribution/openapi.ts`;
- `packages/billing-ledger`;
- `apps/web/src/context/AppContext.tsx`;
- documentação de status.

**Implementação:**

- declarar explicitamente o STJ como o único tribunal habilitado nas Fases 0 a 8;
- manter STF, TST, TJSP, TJRJ e TRF3 fora do catálogo comercial e fora da UI durante todo o ciclo de estabilização do STJ;
- substituir o status estático `ONLINE` por capacidades reais:
  - `searchable`;
  - `verifiable`;
  - `ingestionReady`;
  - `status`;
  - `providerId`;
  - `lastCheckedAt`;
- fazer o catálogo derivar disponibilidade do registry real de providers;
- impedir cobrança quando não houver provider elegível;
- retornar `UNSUPPORTED_COURT` com HTTP `422` antes da execução do ledger;
- reservar `SOURCE_PROVIDER_UNAVAILABLE` para provider configurado que falhou;
- remover o valor padrão pago de `q = 'direito fundamental'`; ausência de consulta deverá resultar em `400`;
- exigir `Idempotency-Key` nas operações REST faturáveis;
- eliminar chaves de idempotência determinísticas baseadas apenas no conteúdo da busca;
- manter resultados sem correspondência como operações faturáveis quando o tribunal for suportado;
- remover da UI opções de tribunais não pesquisáveis;
- corrigir `VERIFIED_PROVIDER` para `VERIFIED_OFFICIAL` quando a fonte oficial for comprovada;
- documentar que “Todos” significa todos os tribunais atualmente habilitados, inicialmente apenas STJ;
- registrar que os testes de tribunal não habilitado são apenas guardrails de contrato e não representam implementação ou início da expansão desses tribunais.
- declarar que o primeiro caso agêntico comercial será uma pesquisa conduzida por ChatGPT, Claude ou outro host externo através do MCP, sem Agent Core obrigatório e sem modelo hospedado pelo ForgeLex;
- distinguir no contrato a instrução/prompt do host, a descrição/schema da tool MCP, o `Legal Tool Gateway` e o runtime opcional de agentes;
- fixar que a unidade inicialmente faturável é a busca jurisprudencial unitária do STJ, inicialmente R$ 0,20, e não os tokens, o modelo ou a pesquisa agêntica como um bloco indivisível.
- confirmar, nos contratos e evidências da fase, que o host externo fornece modelo, raciocínio e contexto, enquanto o ForgeLex fornece somente tools, dados, proveniência, autorização e billing da operação própria;
- confirmar que essa readequação não altera o catálogo, a regra de tribunal habilitado, o ledger ou as ferramentas jurídicas já estabilizadas.

**Testes:**

- busca para tribunal ainda não habilitado retorna `422` e não altera saldo;
- busca sem `q` retorna `400` e não altera saldo;
- busca STJ sem resultados debita uma unidade;
- duas chamadas com a mesma chave repetem o resultado sem novo débito;
- duas chamadas sem chave não são tratadas como o mesmo replay;
- `/api/v2/tribunals` não marca tribunais sem provider como pesquisáveis;
- REST e MCP recusam capability não habilitada;
- uma chamada MCP autenticada pode executar a capability STJ sem modelo, chave ou sessão do Agent Core no ForgeLex;
- os contratos MCP não solicitam conversa completa, arquivos ou histórico do host;
- o catálogo e a UI exibem somente STJ como pesquisável.

**Gate de saída:** o contrato comercial do STJ está protegido contra cobrança inválida, o primeiro caso MCP está definido sem dependência de modelo ou Agent Core e nenhuma tarefa de outro tribunal foi iniciada. A fase não será considerada concluída se houver implementação de STF, TST, TJSP, TJRJ ou TRF3 antecipada.

---

## Fase 1 — Fundação persistida e vertical STJ do Legal Data Plane

**Objetivo:** substituir a dependência de consulta live no caminho comercial por uma base própria, versionada, reconciliada e pesquisável, concluindo o corpus inicial do STJ antes de expor novas camadas comerciais.

**Estado concluído localmente:** a fundação persistida, o versionamento, os hashes, a proveniência e a busca própria foram validados para o corpus histórico definido pelo STJ Open Data. A enumeração atual confirmou dez datasets, 530 recursos classificáveis e 12 não classificáveis; os dez snapshots e 519 incrementais foram concluídos. O único incremental remanescente é a lacuna oficial `20240229.json` da Segunda Seção: o arquivo oficial, de mesmo hash confirmado, informa ausência de lançamentos e é JSON malformado, permanecendo documentado sem publicação. A repetição idempotente foi comprovada em fixture local sem novo download desse recurso, e a reconciliação do corpus não encontrou documentos ou versões duplicadas. Esta conclusão não afirma espelho da base interna do STJ, somente cobertura do corpus oficial definido para a fase.

**Áreas:**

- `packages/legal-data`;
- `packages/persistence/src/schema/schema.ts`;
- `packages/persistence/src/migrations/migration-runner.ts`;
- repository de jurisprudência em `packages/persistence/src/repositories`;
- `packages/source-providers/src/contracts`;
- `packages/source-providers/src/providers/stj-open-data-provider.ts` e parser do Open Data;
- `packages/source-providers/src/providers/stj-scon-provider.ts`, restrito a aquisição, health check ou verificação técnica;
- `StjIngestionService` e job/CLI de ingestão;
- `packages/legal-tools/src/research`;
- fixtures oficiais sanitizadas e observabilidade de ingestão.

**Modelo persistido:**

Criar entidades globais, sem `tenant_id`:

- `jurisprudence_documents`;
- `jurisprudence_document_versions`;
- `jurisprudence_ingestion_runs`;
- índice full-text nativo e ponderado: FTS5 no SQLite e `tsvector`/GIN no PostgreSQL, sem tabela relacional de uma linha por termo;
- manifesto de recursos, janelas e reconciliação da fonte oficial, quando necessário para provar cobertura.

O documento deverá preservar:

- tribunal;
- número normalizado;
- classe processual;
- relator;
- órgão julgador;
- data de julgamento;
- data de publicação;
- ementa;
- URL oficial;
- provider e recurso de origem;
- `contentHash`;
- `dedupeKey`;
- versão vigente;
- timestamps de primeira e última captura;
- status de verificação;
- identificador da execução de ingestão.

**Implementação:**

- usar o STJ Open Data como fonte oficial enumerável da ingestão histórica e incremental, mantendo o SCON restrito a aquisição, health check ou verificação técnica, sem consultá-lo diretamente para responder à busca comercial;
- implementar ingestão histórica e incremental, com snapshot histórico, recursos subsequentes, janela, contagem, hash e status de cada execução;
- converter e validar os resultados em documentos do corpus próprio, rejeitando markup ou registros inválidos sem publicar versão parcial;
- deduplicar por identificador oficial, processo, data e conteúdo normalizado, conforme o contrato real da fonte;
- registrar período coberto, lacunas, documentos rejeitados, duplicados, versões e reconciliação de contagens;
- tornar a importação repetível e idempotente, com reprocessamento de execução interrompida;
- buscar no índice ForgeLex com filtros efetivos de tribunal, datas, classe, processo e metadados disponíveis;
- ponderar identidade processual, autoridade e conteúdo no ranking; preservar busca por palavra inteira, frase e normalização de acentos;
- remover staging de cargas concluídas e preservar staging de cargas falhas para diagnóstico;
- manter ementa e metadados como requisito; manter `fullTextUrl` quando existir, sem alegar armazenamento do inteiro teor;
- implementar retry controlado, timeout, backoff e circuit breaker somente na ingestão, além de métricas de capturados, atualizados, rejeitados e duplicados;
- fazer `research.search_case_law` e `research.verify_authority` lerem a base persistida e devolverem proveniência completa.
- manter o data plane neutro quanto ao canal de distribuição: REST e MCP devem consumir o mesmo `JurisprudenceSearchService`, sem consulta live adicional para o host externo;
- manter billing, autenticação e contexto de tenant fora do corpus global, nas camadas de aplicação e distribuição;
- registrar que a readequação não cria novo corpus, novo índice ou nova implementação jurídica paralela.

**Interfaces:**

- `JurisprudenceRepository.upsertDocument()`;
- `JurisprudenceRepository.getByProcessNumber()`;
- `JurisprudenceRepository.search()`;
- `JurisprudenceRepository.listVersions()`;
- `IngestionRunRepository.start()`;
- `IngestionRunRepository.complete()`;
- `IngestionRunRepository.fail()`;
- `JurisprudenceSearchService.search()`;
- serviço/CLI de ingestão do STJ com manifesto de execução e reconciliação.

**Contrato de pesquisa:**

A resposta deverá distinguir:

- `source: forgelex_index`;
- `upstreamSource: STJ Open Data Oficial`;
- `capturedAt`;
- `contentHash`;
- `verified`;
- `coverage`;
- `lastIndexedAt`.

**Cobertura histórica do STJ:**

Antes de concluir esta fase, deverá ser identificada e executada uma fonte oficial enumerável que permita:

- importar o corpus histórico definido;
- reconciliar quantidade total por recurso e por conjunto;
- detectar lacunas e recursos não classificados;
- deduplicar documentos;
- registrar o período coberto;
- repetir a importação de forma idempotente;
- comparar versões e atualizações.

Se a fonte oficial não permitir enumerar o acervo histórico definido, a fase não será declarada concluída por meio de cache de pesquisas. O bloqueio deverá ser registrado explicitamente, sem alegar que a base é completa e sem iniciar a expansão para outros tribunais.

**Testes:**

- migration idempotente em SQLite;
- migration idempotente em PostgreSQL local;
- isolamento entre corpus global e dados de tenant;
- parser com respostas oficiais capturadas e falha fechada para markup inválido;
- ingestão histórica e incremental idempotente;
- upsert do mesmo documento sem duplicação;
- nova versão quando o hash muda;
- manutenção de `firstSeenAt` e `lastSeenAt`;
- deduplicação por identificador oficial/processo/data/hash;
- busca por termos, processo, tribunal e intervalo de datas;
- busca por frase, normalização de acentos, ranking ponderado e uso efetivo do índice GIN/FTS5;
- medição de tamanho e latência em carga persistida representativa antes do corpus integral;
- recuperação da proveniência completa e cobertura declarada;
- documento corrompido não substitui a versão válida;
- falha de ingestão sem publicar versão parcial;
- reprocessamento de execução interrompida;
- indisponibilidade da fonte sem transformar a busca comercial em consulta live.

**Gate de saída:** a base própria do STJ está carregada com cobertura histórica comprovada, ingestão incremental idempotente, ementa/metadados, filtros, versões, proveniência e recuperação diante de falhas; o mesmo data plane atende REST e MCP sem depender de modelo ou Agent Core. A busca comercial não depende de consulta live e nenhuma capacidade de outro tribunal é declarada concluída por atalho.

A Fase 3 — API REST e MCP equivalentes — deixa de estar bloqueada pelo gate da Fase 1. A busca comercial continua operacional somente sobre documentos publicados em manifestos concluídos; a lacuna oficial terminal não produz resultado nem débito adicional por reprocessamento.

---

## Fase 2 — Legal Tool Gateway e contratos agênticos

**Objetivo:** transformar as capacidades jurídicas persistidas do STJ em tools versionadas, verificáveis e compreensíveis por hosts agênticos, sem acoplar o domínio a um modelo, provider ou runtime específico.

**Áreas:**

- `packages/legal-tools`;
- `packages/legal-workflows` para prompts e instruções versionados;
- contratos do `Legal Tool Gateway`;
- `packages/source-catalog` para capabilities e status;
- testes de schema, policy, erros e billing metadata.

**Contrato canônico de tool:**

Cada tool pública ou interna deverá possuir, no mínimo:

- nome estável e versão do contrato;
- capability exigida e escopo de autorização;
- descrição semântica orientada ao host/modelo, sem depender de vocabulário proprietário do provider;
- schema de entrada e saída versionado;
- pré-condições, limites, timeout e suporte a cancelamento;
- classificação de impacto e critérios de aprovação humana;
- envelope de proveniência e auditoria;
- catálogo de erros estruturados;
- classificação da operação faturável, com unidade própria do ForgeLex, nunca tokens.

**Implementação:**

- consolidar `research.search_case_law`, `research.get_authority` e `research.verify_authority` sobre os mesmos application services do índice STJ;
- publicar descrições e schemas adequados a chamadas sucessivas de um host externo;
- versionar prompts, instruções de uso e workflows em arquivos controlados, distinguindo prompt do host, descrição da tool MCP e lógica jurídica do serviço;
- definir capabilities, pré-condições, limites, estados de verificação, `UNSUPPORTED_COURT`, `SOURCE_PROVIDER_UNAVAILABLE` e demais erros semânticos;
- definir quando uma operação é observação, análise, mutação interna ou efeito externo, exigindo aprovação quando aplicável;
- classificar a busca jurisprudencial como operação própria inicialmente faturável, sem criar preço para tokens, modelo, margem, provider de IA ou pesquisa agêntica indivisível;
- manter os contratos aptos a serem consumidos por REST, MCP, Agent Core opcional ou integração própria via API, sem implementações jurídicas paralelas;
- preservar o STJ como única capability comercial de pesquisa habilitada.

**Testes:**

- validação de schemas de entrada e saída;
- descrição semântica e versão da tool;
- capability, pré-condição, limite e erro estruturado;
- prompt/instrução versionado com caso positivo, caso negativo e ausência de autoridade inventada;
- critérios de aprovação humana por impacto;
- classificação correta de busca como operação própria;
- garantia de que metadados de modelo/token não criam `UsageEvent` comercial nem débito;
- registry rejeitando tribunal ou capability não habilitada;
- paridade do contrato para consumidores REST, MCP e integração opcional.

**Gate de saída:** existe um Legal Tool Gateway canônico, com tools jurídicas e contratos agênticos versionados, schemas, descrições, prompts/instruções, capabilities, erros, proveniência, aprovação e classificação de billing prontos para as duas superfícies de distribuição. Nenhum modelo ou Agent Core é requisito desta fase.

---

## Fase 3 — API REST e MCP equivalentes

**Objetivo:** expor o Legal Tool Gateway por dois canais autenticados e equivalentes — API REST para software próprio do desenvolvedor e MCP remoto para ChatGPT, Claude ou outro host externo — sem inserir um runtime de modelo entre a borda e os serviços jurídicos.

**Áreas:**

- `apps/api/src/app.ts`;
- `packages/mcp-server`;
- `apps/api/src/distribution/openapi.ts`;
- `packages/billing-ledger`;
- testes de API e MCP.

**Implementação:**

- conduzir API REST e MCP aos mesmos application services, tool definitions, schemas, políticas e resultados;
- autenticar desenvolvedores por API key na REST e usuários autorizados na superfície MCP, derivando identidade e tenant no servidor;
- deixar explícito que a API REST é consumida diretamente pelo software do desenvolvedor e que o modelo eventualmente usado por ele não pertence ao ForgeLex nem ao seu billing;
- registrar a operação como uso da infraestrutura ForgeLex, preservando a fonte upstream somente na proveniência jurídica;
- exigir idempotência explícita no REST e definir a propagação equivalente no MCP por header/contexto ou campo do contrato;
- eliminar fallback por query/argumentos e impedir que o MCP receba conversas, arquivos ou histórico do host;
- garantir que erro de capability, entitlement ou tribunal aconteça antes do ledger;
- manter débito dentro da operação jurídica própria, inicialmente a busca jurisprudencial unitária do STJ;
- documentar headers:
  - `Idempotency-Key`;
  - `X-Credit-Cost-Per-Unit`;
  - `X-Credits-Charged`;
  - `X-Remaining-Balance`;
  - `X-Idempotent-Replay`;
- documentar respostas `400`, `401`, `402`, `403`, `409`, `422`, `503`;
- substituir schemas genéricos do OpenAPI por schemas reais;
- incluir resposta de tribunais e capacidade;
- corrigir metadados OAuth para configuração por ambiente;
- manter o pacote MCP limitado às três ferramentas jurisprudenciais inicialmente habilitadas e às descrições/schema do gateway;
- documentar que o host externo fornece modelo, raciocínio e contexto conversacional; o ForgeLex fornece tools, dados, proveniência, autorização e billing da operação própria;
- propagar cancelamento da requisição HTTP ao `AbortSignal` da ferramenta.

**Testes:**

- contrato OpenAPI;
- chamada REST com e sem idempotência;
- replay correto;
- saldo insuficiente;
- provider indisponível sem débito;
- tribunal não suportado sem débito;
- MCP com os mesmos resultados do REST;
- MCP não acessa conversas, arquivos ou histórico, recebendo somente os argumentos declarados;
- cancelamento;
- tenant isolation;
- auditoria e webhooks de billing.

**Gate de saída:** API REST e MCP são adapters equivalentes do Legal Tool Gateway, documentados, autenticados, autorizados, idempotentes e incapazes de cobrar operações não suportadas. O gate não exige Agent Core, provider de IA ou chave OpenAI/Anthropic.

---

## Fase 4 — Primeiro fluxo agêntico verificável pelo MCP

**Objetivo:** provar o primeiro caso comercial agêntico com um host externo, usando prompts/instruções e chamadas encadeadas ao MCP, sem executar modelo no ForgeLex e sem exigir o Agent Core.

**Fluxo obrigatório:**

```text
pergunta do usuário
→ seleção de tool pelo host
→ busca jurisprudencial STJ
→ eventual obtenção/verificação de autoridade
→ retorno estruturado com proveniência
→ síntese pelo host
```

**Áreas:**

- `packages/mcp-server`;
- `packages/legal-tools/src/research`;
- prompts e instruções de uso versionados;
- fixtures de chamadas MCP encadeadas;
- ledger, auditoria e métricas da operação.

**Implementação:**

- validar a seleção de tool pelo host a partir de descrição, schema, capability e erro do gateway;
- suportar chamadas sucessivas de `research.search_case_law`, `research.get_authority` e `research.verify_authority` usando os documentos persistidos do STJ;
- retornar somente resultados estruturados, ementas, metadados, status de verificação e proveniência disponíveis no corpus;
- permitir que o host produza a síntese final, sem o MCP prometer resposta textual autônoma ou autoridade ausente;
- cobrar apenas as operações jurídicas próprias efetivamente executadas: inicialmente R$ 0,20 por busca jurisprudencial unitária; obtenção, verificação ou workflow não recebem preço inventado nesta fase;
- assegurar que falha, indisponibilidade, capability não habilitada, replay e cancelamento sigam os contratos do gateway e não gerem débito indevido;
- registrar que o MCP não acessa conversa, arquivo, histórico ou contexto não enviado nos argumentos;
- manter REST como caminho equivalente para o mesmo caso de uso, sem criar uma implementação jurídica exclusiva do MCP.

**Testes:**

- chamada inicial de busca com host externo simulado e sem modelo no ForgeLex;
- encadeamento busca → obtenção → verificação;
- cobrança por operação própria, sem cobrança por token ou pela síntese do host;
- replay idempotente sem novo débito;
- chamadas sem chave de idempotência não confundidas com o mesmo replay;
- ausência de contexto indevido, conversa, arquivo ou histórico;
- tribunal não habilitado sem débito;
- fonte indisponível sem débito de operação não concluída;
- ausência de autoridade inventada quando não há resultado verificável;
- paridade do resultado, proveniência e billing entre REST e MCP;
- aprovação humana quando uma etapa posterior do fluxo tiver impacto que a exija.

**Gate de saída:** um advogado consegue usar ChatGPT, Claude ou outro host compatível para executar uma pesquisa jurisprudencial STJ pelo MCP, com chamadas encadeadas, resultado verificável, privacidade, idempotência, auditoria e cobrança por operação própria. O caso funciona sem Agent Core, sem modelo hospedado pelo ForgeLex e sem billing de tokens.

---

## Fase 5 — Agent Core próprio e adapters opcionais

**Objetivo:** completar o runtime próprio de agentes como camada opcional de integração, usando as mesmas tools e contratos do ForgeLex, sem torná-lo requisito da API REST ou do MCP e sem transferir ao ForgeLex o custo ou o billing dos modelos utilizados pelo integrador.

**Áreas:**

- `packages/agent-core`;
- `packages/agent-provider-openai`;
- `packages/agent-provider-anthropic`;
- testes de paridade;
- documentação de integração.

**Implementação:**

- preservar `AgentRuntime`, `ToolRegistry`, `PolicyEngine`, `SessionStateMachine`, `AgentProvider`, `AgentRunInput` e `AgentEvent` como contratos vendor-neutral;
- preservar `packages/agent-provider-openai` e `packages/agent-provider-anthropic` como adapters opcionais para integradores ou futura experiência interna;
- fazer o runtime consumir as mesmas tool definitions, schemas, policies, provenance e erros do Legal Tool Gateway;
- completar lifecycle de sessões, streams, timeout, cancelamento, aprovação humana, erro de provider e retomada conforme os contratos existentes;
- manter credenciais e billing do modelo sob responsabilidade do integrador, fora da conta comercial do ForgeLex;
- definir claramente que sessões do SDK não equivalem às sessões comerciais persistidas da API ou às conexões de usuário do MCP;
- manter contratos de uso de tokens somente como metadados da integração externa;
- impedir que tokens, modelo, provider ou custo técnico alcancem o ledger comercial como unidade, preço, margem ou conversão;
- separar testes fake/paridade de testes reais condicionais e documentar que credenciais reais não são necessárias para o runtime comercial;
- comprovar que a indisponibilidade ou remoção do Agent Core não interrompe API REST, MCP, ingestão, busca ou billing por operações jurídicas próprias.

**Testes:**

- provider parity com fake streams;
- tool approval;
- timeout;
- cancelamento;
- erro de provider;
- ausência de vazamento de credenciais;
- garantia de que nenhum evento de tokens gera débito ForgeLex;
- execução das mesmas tools e schemas usados por REST/MCP;
- operação comercial intacta quando o Agent Core não é carregado;
- build/typecheck dos adapters.

**Gate de saída:** o Agent Core e os adapters opcionais possuem lifecycle, streams, cancelamento, timeout, aprovação, erros e paridade testados, reutilizam os contratos jurídicos do ForgeLex e não produzem qualquer efeito sobre o ledger comercial. A API REST e o MCP continuam operacionais sem ele.

---

## Fase 6 — Workflows jurídicos e integração com matters

**Objetivo:** compor tools, prompts/instruções, schemas, gates, proveniência e aprovação humana em workflows jurídicos versionados, executáveis pelo MCP, pelo Agent Core opcional ou por uma integração própria via API, sem criar implementações jurídicas paralelas.

**Áreas:**

- `packages/legal-workflows/src/research-memo`;
- `packages/legal-tools`;
- repositories de matters, authorities e research memos;
- rotas de matters em `apps/api/src/app.ts`;
- contratos de workflow, checkpoint e aprovação.

**Implementação:**

- definir `WorkflowDefinition`, `WorkflowStep`, `WorkflowContext`, `WorkflowCheckpoint` e `WorkflowResult` com versão, capabilities, limites, provenance e política de aprovação;
- fazer `ResearchMemo` consumir somente resultados do índice ForgeLex;
- preservar query, court, coverage, provenance e versão dos documentos;
- impedir que memo seja criado com resultado de provider não concluído;
- registrar o identificador da versão jurisprudencial usada;
- manter revisão humana explícita para estados que a política exigir;
- alinhar `get_authority` e `verify_authority`, permitindo revalidação sem substituir silenciosamente a versão histórica;
- completar o workflow `legal-research-memo` como composição de intake → issues → search → verify → synthesize → adversarial check → memo → human review;
- permitir que o fluxo seja dirigido por chamadas MCP encadeadas, pelo Agent Core opcional ou por aplicação própria via REST, sempre sobre os mesmos serviços;
- não fazer o prompt substituir autorização, cálculo determinístico, proveniência ou validação de autoridade;
- cobrar somente operações próprias declaradas pelas tools; não criar tarifa de token, modelo ou workflow completo sem decisão comercial posterior.

**Testes:**

- matter com query STJ;
- memo persistido com authorities e proveniência;
- workflow versionado com input/output schema e checkpoint;
- execução do mesmo workflow por REST, MCP e runtime opcional, quando disponível;
- replay sem novo débito nem novo memo;
- alteração posterior da fonte sem alterar memo histórico;
- verificação conflitante;
- falha do índice;
- revisão humana do memo;
- ausência de autoridade inventada;
- isolamento entre tenants.

**Gate de saída:** o primeiro workflow jurídico está versionado, auditável e executável pelas três superfícies previstas — REST, MCP e Agent Core opcional — sem depender de modelo fornecido pelo ForgeLex, sem billing de tokens e sem provider live como resposta direta.

---

## Fase 7 — Frontend, persistência PostgreSQL e operação comercial

**Estado em 2026-09-20:** concluída localmente no checkout `main` sobre
`a9e3b24`. O gate foi validado em PostgreSQL 16 local, Chromium e fixtures
controladas; migration remota, deploy e credenciais live permanecem gates
separados e não executados.

**Objetivo:** fazer a interface e a operação persistida refletirem exclusivamente capabilities concluídas, estados reais do MCP/API e o comportamento comercial do STJ em PostgreSQL local.

**Áreas:**

- `apps/web/src/context/AppContext.tsx`;
- `ResearchDeskScreen.tsx`;
- `LandingScreen.tsx`;
- `DashboardScreen.tsx`;
- `MatterWorkspaceScreen.tsx`;
- `ApiDocsScreen.tsx`;
- `ConnectionsScreen.tsx`;
- `scripts/migrate-postgres.mjs`;
- `scripts/smoke-postgres.mjs`;
- migrations de persistence e ledger;
- `apps/api/src/billing`;
- `apps/api/src/distribution/webhook-service.ts`;
- autenticação, OAuth e configuração operacional.

**Implementação:**

- carregar tribunais da API, não de lista estática, e mostrar somente tribunais `searchable: true`;
- exibir estado de fonte indisponível sem sugerir cobrança;
- usar a rota canônica de pesquisa e enviar `Idempotency-Key` por operação;
- distinguir verificação oficial, verificação pelo índice ForgeLex, conflito, não encontrado e fonte indisponível;
- carregar e resolver a fila de aprovações no backend;
- persistir e recarregar pesquisas recentes quando isso fizer parte do contrato;
- exibir cobertura e data de atualização da base e informar quando o inteiro teor é acessado pela URL oficial;
- alinhar a comunicação visual de API, MCP, prompts/workflows e billing, deixando explícito que o host fornece o modelo;
- executar migrations incrementais em PostgreSQL local;
- validar corpus global, ledger, auditoria, matters, workflows e outbox no mesmo banco;
- garantir locks corretos em múltiplas instâncias e retirar chamada externa longa da transação de débito;
- limitar snapshot de operação e definir retenção para resultados/logs;
- corrigir concorrência de reembolso, validar webhook Mercado Pago com assinatura/replay/retry e validar worker de outbox;
- corrigir OAuth protected resource por ambiente, validar Supabase com conta confirmada e impedir fallback silencioso para SQLite em produção;
- documentar variáveis obrigatórias sem reintroduzir credenciais ou pricing de modelos externos.

**Testes:**

- testes unitários de mapeamento;
- tribunal indisponível e sem resultados;
- cobrança e replay;
- aprovação persistida;
- saldo após compra pendente;
- `pnpm db:migrate` em PostgreSQL local;
- `pnpm test:postgres`;
- concorrência de dois débitos e de duas solicitações de reembolso;
- replay de webhook, falha de entrega, retry e reinício do worker;
- autenticação Supabase, readiness e métricas;
- teste de carga básico do endpoint de pesquisa;
- E2E de navegador para login, busca STJ, verificação, compra e aprovação;
- frontend build.

**Gate de saída:** a UI não anuncia tribunal sem provider, não apresenta aprovação fictícia, reproduz fielmente os estados REST/MCP e o produto STJ funciona em PostgreSQL com ledger concorrente, outbox, auth, billing, ingestão e operação sem banco efêmero. Nenhum modelo externo é vendido ou cobrado pelo ForgeLex.

**Evidência do gate:** `pnpm db:migrate`, `pnpm test:postgres`,
`pnpm test:e2e:phase7`, `pnpm test:load:search`, `pnpm typecheck`,
`pnpm test`, `pnpm --filter @forgelex/web build` e `git diff --check`
passaram. O smoke cobriu os 12 checks operacionais previstos; o E2E cobriu
login real da UI contra Supabase simulado, catálogo exclusivo STJ, busca com e
sem resultado, verificação gratuita, compra pendente/confirmada e decisão da
fila. A carga executou 25 intenções e 3 retries, sem erros ou 5xx, com débito
único de 500 centavos; p50 de 333,34 ms e p95 de 567,24 ms são apenas a
medição local desta execução, não um SLA.

---

## Fase 8 — Gate de estabilidade integral do ForgeLex com STJ

**Objetivo:** declarar o projeto comercialmente estável antes de iniciar qualquer novo tribunal.

**Checklist obrigatório:**

- base histórica STJ comprovada;
- ingestão incremental funcionando;
- busca própria com ementa e metadados;
- verificação e proveniência;
- Legal Tool Gateway com schemas, descrições semânticas, capabilities, erros, prompts/instruções e contratos versionados;
- REST;
- MCP;
- primeiro fluxo agêntico MCP validado com chamadas encadeadas e host externo;
- Agent Core e adapters opcionais isolados, se implementados, sem bloquear REST/MCP;
- API key;
- Supabase;
- créditos;
- débito idempotente;
- compras;
- Mercado Pago;
- reembolso;
- webhook;
- PostgreSQL;
- matters;
- research memos;
- authorities;
- frontend;
- fila persistida;
- OpenAPI;
- documentação;
- observabilidade;
- ausência de billing de modelos/tokens;
- ausência de margem, cotação USD/BRL ou credenciais de providers externos no billing ForgeLex;
- confirmação de que MCP não acessa conversas, arquivos ou histórico do host;
- ausência de tribunais falsamente anunciados.

**Validação final:**

```text
pnpm typecheck
pnpm test
pnpm --filter @forgelex/web build
pnpm test:postgres
git diff --check
```

Também deverá ser produzido um relatório com:

- cobertura STJ;
- quantidade de documentos;
- período coberto;
- contagem de versões;
- contagem de documentos rejeitados;
- tempo de ingestão;
- taxa de erro;
- latência da busca;
- comportamento de cobrança;
- resultados REST/MCP;
- evidências PostgreSQL;
- evidências do frontend.

Nenhuma fase de outro tribunal começa antes deste gate. Até aqui, o projeto inteiro é estabilizado exclusivamente sobre o STJ.

> **Decisão estratégica — 2026-09-21:** as Fases 9 a 13 estão `FROZEN_STRATEGICALLY`. Elas não foram iniciadas, não representam incompletude do ForgeLex/STJ e não bloqueiam a Fase 14. O catálogo comercial continua a expor exclusivamente capabilities STJ; tribunais sem provider permanecem indisponíveis e sem cobrança. O registro detalhado desta decisão está em `docs/operations/phase14/strategic-freeze.md`.

---

## Fase 9 — STF (`FROZEN_STRATEGICALLY`)

Esta fase permanece preservada como backlog de expansão futura. Não deve começar enquanto vigorar `STRATEGIC_FREEZE_2026-09-21`; STF não é dependência do produto STJ, da Fase 14 ou de qualquer gate de estabilidade.

Repetir a mesma definição de completude:

- identificar fonte oficial enumerável;
- implementar provider de aquisição;
- implementar parser;
- criar fixtures;
- importar corpus;
- validar cobertura;
- criar versões e hashes;
- habilitar busca própria;
- habilitar verificação;
- adicionar testes REST/MCP;
- atualizar catálogo e UI;
- validar cobrança sem duplicação;
- documentar cobertura;
- executar gates completos.

O STF só será marcado como `searchable: true` após todos os itens passarem.

## Fase 10 — TST (`FROZEN_STRATEGICALLY`)

Aplicar o mesmo ciclo integral, sem reutilizar parser ou pressupor que o contrato do STJ seja equivalente:

- fonte oficial;
- enumerabilidade;
- ingestão;
- parser;
- metadados;
- versionamento;
- busca;
- verificação;
- testes;
- operação;
- documentação;
- habilitação progressiva.

## Fase 11 — TJSP (`FROZEN_STRATEGICALLY`)

Aplicar o mesmo ciclo, incluindo validação específica de volume, paginação, identificação processual e estabilidade da fonte estadual.

## Fase 12 — TJRJ (`FROZEN_STRATEGICALLY`)

Aplicar o mesmo ciclo, com contrato, cobertura e parser independentes.

## Fase 13 — TRF3 (`FROZEN_STRATEGICALLY`)

Aplicar o mesmo ciclo, com validação específica de classes processuais, identificação dos julgados e cobertura regional.

Cada uma das fases 9 a 13 permanece um incremento isolado, se e quando a decisão estratégica for revogada. Um tribunal com provider apenas parcialmente funcional permanecerá fora do catálogo comercial e não será cobrado.

---

## Fase 14 — Consolidação operacional e estabilização do produto STJ

**Objetivo:** consolidar a operação do produto comercial limitado ao STJ antes de qualquer expansão de tribunal, sem pressupor corpus, provider ou capability de STF, TST, TJSP, TJRJ ou TRF3.

**Implementação:**

- manter o catálogo limitado às capabilities STJ efetivamente homologadas;
- consolidar monitoramento, custos, logs e runbooks da operação pública;
- exercitar recuperação operacional, indisponibilidade controlada, autenticação, billing e webhook sem criar cobrança real desnecessária;
- validar integridade de deploy, banco, segredos, domínio, TLS e rotas públicas;
- preservar provider, tribunal, versão e proveniência do corpus STJ;
- documentar critérios objetivos para eventual retomada de um novo tribunal, sem iniciar provider, coleta, parser ou importação;
- atualizar OpenAPI e MCP;
- atualizar documentação comercial;
- remover todos os claims aspiracionais;
- revisar `.env.example`;
- revisar migrations, scripts e runbooks;
- atualizar `STATUS_VALIDACAO.md`.

**Gate final:**

- somente STJ permanece habilitado; nenhum outro tribunal é requisito deste gate;
- nenhum endpoint cobra capacidade inexistente;
- REST e MCP retornam a mesma infraestrutura;
- documentação não menciona modelo fornecido pelo ForgeLex;
- nenhum billing por token, margem, cotação ou provider de IA;
- todos os gates automatizados passam;
- evidências operacionais externas estão disponíveis para os serviços públicos STJ;
- as Fases 9 a 13 constam expressamente como `FROZEN_STRATEGICALLY`, sem claim de cobertura nacional.

## Sequência de commits planejada

Cada fase deverá usar commits atômicos, por exemplo:

```text
fix(research): bloquear cobrança de tribunais sem provider
feat(persistence): adicionar corpus jurisprudencial versionado
feat(research): persistir e pesquisar acervo oficial do STJ
feat(tools): versionar Legal Tool Gateway, prompts e contratos agênticos
fix(api): alinhar API REST e MCP sobre os mesmos application services
test(mcp): validar primeiro fluxo agêntico externo do STJ
refactor(agent-core): delimitar runtime e adapters como camada opcional
feat(workflows): versionar authorities e research memos
feat(web): conectar pesquisa, MCP e aprovações ao estado persistido
test(ops): validar ForgeLex em PostgreSQL, outbox e billing operacional
feat(research): habilitar provider oficial do STF
```

Push, deploy, migration remota e homologação pública continuam sendo gates separados e não serão inferidos pela conclusão dos testes locais.

---

## Governança contra desvirtuamento

Antes de incluir qualquer nova etapa, capability, tool, provider, workflow ou item comercial, responder obrigatoriamente:

1. A mudança melhora a capacidade do ForgeLex de fornecer ferramentas jurídicas verificáveis?
2. A mesma capability funciona por API REST e MCP?
3. O host externo pode usar a capability sem o ForgeLex fornecer modelo?
4. Se houver modelo, o custo e as credenciais permanecem fora do billing ForgeLex?
5. A mudança preserva a separação entre dados globais do corpus, contexto do tenant e billing?

Se qualquer resposta for negativa, a etapa deverá ser marcada como fora de escopo, dependência futura ou decisão que exige nova aprovação. Nenhuma conveniência de integração poderá transformar tokens, modelos externos, margem, cotação USD/BRL ou custo de provider em receita, unidade de débito ou dependência da API/MCP do ForgeLex.
