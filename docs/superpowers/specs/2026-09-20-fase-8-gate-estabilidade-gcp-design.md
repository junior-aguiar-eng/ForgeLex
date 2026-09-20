# Fase 8 — gate de estabilidade integral em homologação Google Cloud

## Objetivo e critério de conclusão

A Fase 8 encerra o ciclo de estabilização do ForgeLex exclusivamente sobre o
STJ. O gate só será aprovado quando o estado já construído nas Fases 0 a 7 for
revalidado, uma homologação pública e isolada estiver operando no Google Cloud
e um host agêntico externo real executar chamadas MCP encadeadas contra ela.
Nenhum tribunal adicional pode ser anunciado ou iniciado antes desse gate.

O resultado não será declarado produção. A homologação comprova integração,
contratos, persistência, operação e interoperabilidade em ambiente remoto,
preservando os limites do teste gratuito e o orçamento configurado.

A implantação será deliberadamente dividida em dois gates. O primeiro valida a
camada básica pela URL nativa do Cloud Run, antes de criar infraestrutura de
domínio. O segundo publica a mesma revisão aprovada em
`hml.nexojuris.ia.br`. Essa divisão não reduz o escopo: a Fase 8 somente termina
depois do domínio, do corpus STJ completo e do host MCP externo estarem
validados.

## Estado externo confirmado

O projeto foi confirmado visualmente no Google Cloud Console antes de qualquer
mutação:

- projeto: `project-bbbe1209-c295-4720-867`;
- nome exibido: `My First Project`;
- região escolhida: `southamerica-east1` (São Paulo);
- APIs de Cloud Run, Cloud SQL, Artifact Registry, Cloud Build, Secret Manager,
  Logging e Monitoring já habilitadas;
- orçamento existente de R$ 100/mês, com alertas em 50%, 90%, 100% e 150%, e
  gasto exibido de R$ 0,00 na leitura de 20/09/2026;
- nenhum serviço Cloud Run, instância Cloud SQL, repositório Artifact Registry
  ou secret existente no inventário inicial.

O domínio correto foi confirmado visualmente no Registro.br:

- domínio: `nexojuris.ia.br`;
- status: publicado;
- DNS: servidores do Registro.br;
- expiração exibida: 16/09/2027.

`nerdolajuridico.com.br` não pertence a esta homologação e não pode receber
configuração, registro DNS ou referência do ForgeLex.

## Origem pública e topologia

A origem canônica da homologação será `https://hml.nexojuris.ia.br`:

- API REST: `https://hml.nexojuris.ia.br/api/v2`;
- MCP remoto: `https://hml.nexojuris.ia.br/mcp`;
- metadados do recurso protegido:
  `https://hml.nexojuris.ia.br/.well-known/oauth-protected-resource`;
- saúde e prontidão: `/healthz` e `/readyz`;
- métricas operacionais autenticadas ou restritas ao ambiente, sem exposição de
  segredos, payloads jurídicos ou dados pessoais.

O primeiro gate remoto usará exclusivamente a URL HTTPS nativa `run.app`, sem
balanceador, IP estático, NAT ou CDN. Nessa etapa serão medidos funcionamento,
latência, tráfego, logs e custo da aplicação e do banco.

Como o mapeamento nativo de domínio do Cloud Run não está disponível em
`southamerica-east1`, a aprovação do primeiro gate demonstrará a necessidade da
infraestrutura adicional para conciliar os dois requisitos já definidos:
permanência dos dados e do runtime em São Paulo e uso de
`hml.nexojuris.ia.br`. Somente então será criado um Application Load Balancer
HTTPS global com IP estático, certificado gerenciado pelo Google e serverless
NEG apontando para a revisão validada do Cloud Run. No estado final, o Cloud
Run aceitará entrada externa somente por Cloud Load Balancing. O DNS do
Registro.br receberá exclusivamente os registros exigidos pelo balanceador e
pelo certificado.

A URL `run.app` é superfície transitória de validação, não substituto da origem
canônica e não satisfaz o gate final da Fase 8.

## Estimativa obrigatória antes do provisionamento

Antes de criar qualquer recurso faturável, será produzido um registro de
dimensionamento contendo:

- tamanho lógico do PostgreSQL de origem, tabelas, índices e dump de promoção;
- margem necessária para migrations, índices temporários, staging, WAL e
  crescimento durante o ensaio;
- tamanho estimado da imagem e do Artifact Registry;
- volume máximo planejado de requisições, entrada e saída do ensaio remoto;
- retenção e volume estimados de logs e backups;
- custo estimado por recurso e custo acumulado máximo do ensaio, confrontados
  com o crédito e o orçamento confirmados.

O dimensionamento deve usar medições reproduzíveis da origem. Os 25 GiB e a
classe de banco descritos abaixo são tetos iniciais, não autorização para
provisionar sem demonstrar que comportam o corpus completo. Se a estimativa
exceder esses limites, o desenho volta para decisão antes de criar recursos.

## Recursos Google Cloud

Os recursos terão nomes explícitos de homologação e permanecerão no projeto
confirmado:

- Artifact Registry Docker `forgelex-hml` em `southamerica-east1`;
- imagem imutável identificada pelo SHA do commit e nunca apenas por `latest`;
- Cloud Run `forgelex-api-hml`, segunda geração, 1 vCPU, 1 GiB, concorrência 20,
  mínimo zero, máximo duas instâncias e timeout de requisição de 60 segundos;
- service account de runtime `forgelex-hml-runtime`, sem papel Editor e apenas
  com acesso ao Cloud SQL, leitura dos secrets necessários e escrita de logs;
- service account de deploy `forgelex-hml-deploy`, separada da conta de runtime
  e limitada a build, publicação da imagem e implantação dos recursos previstos;
- Cloud SQL PostgreSQL 16 `forgelex-hml-pg`, instância zonal sem alta
  disponibilidade, na menor classe compatível demonstrada pelo ensaio e nunca
  superior inicialmente a 1 vCPU e 3,75 GiB, com armazenamento SSD conservador
  de até 25 GiB, sem aumento automático, backups habilitados e sem dados de
  produção;
- conexão Cloud Run–Cloud SQL pelo Cloud SQL Auth Proxy/Unix socket, sem rede
  autorizada por IP para a aplicação;
- Secret Manager para credenciais do banco, chave mestra de webhook e quaisquer
  tokens temporários de homologação;
- Cloud Logging e Monitoring para erros, prontidão, latência e volume, sem logar
  tokens, chaves, conversas, arquivos ou histórico do host.

O orçamento existente é alerta, não limite técnico. O ambiente deverá usar
escala mínima zero, máximo explícito e recursos zonais. Qualquer aumento de
máquina, armazenamento, instâncias ou retenção será tratado como decisão
separada se os ensaios demonstrarem necessidade.

Não serão criados HA, réplica, NAT ou CDN na Fase 8. O balanceador e o IP
estático ficam proibidos no primeiro gate e só podem ser criados depois que a
URL nativa comprovar a camada básica e registrar a necessidade do domínio na
região escolhida. Todos os recursos permanecerão em uma única região sempre que
o produto Google Cloud permitir; o balanceador global será a única exceção e
não autoriza backend, banco ou repositório em outra região.

## Build, implantação e reversão

O monorepo receberá um Dockerfile multi-stage reproduzível e configuração de
build adequada ao `pnpm-lock.yaml`. A imagem de runtime conterá somente os
artefatos necessários à API e aos pacotes de workspace usados em produção. O
processo não copiará `.env`, bancos locais, dumps, caches, credenciais ou
artefatos de teste.

A implantação seguirá esta ordem, com interrupção automática diante de falha:

1. build e testes locais;
2. medição do banco, imagem, tráfego e logs, seguida da estimativa de custo;
3. criação do Artifact Registry e das service accounts mínimas;
4. criação do Cloud SQL zonal dimensionado e execução das migrations
   versionadas;
5. carga de um recorte sintético ou representativo sem dados privados, apenas
   para validar migrations, persistência e contratos;
6. publicação da imagem por digest e implantação Cloud Run com URL nativa,
   mínimo zero e máximo duas instâncias;
7. smoke tests REST, MCP, Agent Core, billing e prontidão pela URL `run.app`;
8. medição do primeiro gate e confirmação de que aplicação, banco e custo estão
   dentro dos limites;
9. promoção controlada do corpus global completo do STJ e validação de sua
   integridade;
10. criação do balanceador, IP estático e certificado, seguida exclusivamente
    dos registros DNS necessários;
11. smoke tests pela origem `hml.nexojuris.ia.br`;
12. fluxo MCP por cliente independente e por host externo real;
13. ensaio remoto limitado, consolidação de custo e relatório final.

Uma revisão anterior da imagem permanecerá disponível durante a homologação.
Falha de prontidão, migration, integridade do corpus, contrato MCP ou limite de
custo impede a promoção ao gate seguinte. Reversão de aplicação significa
direcionar tráfego à revisão anterior; reversão de dados não apaga tabelas nem
usa migration destrutiva, e depende de backup/restauração controlada.

## Dados e promoção do corpus STJ

O Cloud SQL receberá as migrations canônicas e o corpus global do STJ. A
promoção transportará apenas tabelas globais de jurisprudência, versões,
manifestos e execuções de ingestão necessárias à proveniência. Tabelas de
tenant, usuários, matters, billing, compras, documentos privados e sessões do
banco local não serão copiadas.

O recorte usado no primeiro gate serve apenas para provar a infraestrutura e
os contratos. Ele não satisfaz o gate de dados. Antes do teste final pelo
domínio, o Cloud SQL deverá conter e validar o corpus global completo do STJ
previsto nesta fase.

A homologação criará um tenant sintético exclusivo, uma identidade de teste,
uma API key revogável e créditos promocionais limitados. Nenhum cliente real,
documento privado, conversa ou arquivo será usado.

Após a carga, serão comparados com a origem local:

- contagem de documentos e versões;
- cobertura temporal mínima e máxima;
- documentos rejeitados e lacunas oficiais;
- ausência de `dedupe_key` duplicada;
- ausência de versões repetidas por hash;
- ponteiros de versão atual íntegros;
- vínculo e estado de publicação dos manifestos;
- staging vazio após cargas concluídas.

A ingestão incremental será repetida em homologação. Recurso já concluído deve
ser ignorado idempotentemente; a lacuna oficial terminal deve permanecer
registrada sem nova publicação; recurso novo válido deve criar somente as
versões correspondentes.

## Autenticação, autorização e billing

No gate A, o Cloud Run será alcançável pela URL nativa exclusivamente para os
testes autenticados. No gate B, a entrada externa ficará restrita ao
balanceador. Em ambos, a aplicação continuará exigindo autenticação e
autorização próprias. REST usará API key ou token Supabase conforme o contrato
existente. MCP não receberá contexto privado do host e executará sob principal
autenticado, scopes e tenant resolvidos pelo mesmo `AuthAdapter`.

O OAuth Google já aberto não será configurado antecipadamente. Um cliente Google
OAuth isolado não substitui o servidor de autorização OAuth 2.1 exigido por um
plugin MCP autenticado. Se o teste final usar ChatGPT como plugin, a integração
deverá publicar metadados, suportar authorization code com PKCE S256, emitir
token para o recurso correto e validar assinatura, issuer, audience, expiração e
scopes. A autenticação Google poderá ser apenas o mecanismo de login do usuário
por trás desse servidor.

O host externo primário será o Codex configurado como cliente MCP HTTP remoto,
com a API key revogável recebida por variável de ambiente e nunca escrita no
arquivo de configuração. Se essa superfície não conseguir executar o fluxo
encadeado real, o fallback será ChatGPT em modo de desenvolvedor, caso em que o
OAuth 2.1 completo se torna parte obrigatória desta fase. O relatório
identificará exatamente o host, o modo de autenticação e a diferença entre
teste técnico e plugin ChatGPT publicado.

Somente `research.search_case_law` é faturável a R$ 0,20. Obtenção,
verificação e workflows permanecem gratuitos. Replay idempotente não duplica
débito. Tokens, modelos, providers externos, margem e conversão USD/BRL não
entram no billing do ForgeLex.

## Fluxo MCP remoto de fogo

O teste final exige duas camadas:

1. cliente MCP independente e reproduzível contra a origem pública, validando
   inicialização, catálogo de tools, schemas, erros, autenticação e chamadas;
2. host agêntico externo real, fora do runtime ForgeLex, escolhendo e encadeando
   `research.search_case_law`, `research.get_authority` e
   `research.verify_authority`.

O host deve produzir uma resposta baseada somente nos resultados estruturados.
As evidências devem demonstrar que:

- o modelo e o raciocínio pertencem ao host externo;
- o ForgeLex não recebe conversa, arquivos ou histórico;
- a busca consulta o índice próprio persistido, não o SCON ao vivo;
- a autoridade obtida é a mesma encontrada e sua proveniência é verificável;
- somente a busca gera um débito de R$ 0,20;
- repetição com a mesma idempotency key não gera novo débito;
- erro, cancelamento e tribunal não habilitado não geram cobrança indevida;
- REST e MCP devolvem resultado jurídico equivalente para a mesma operação.

O host, prompt, timestamps, IDs de operação, estados de billing e payloads
jurídicos saneados serão registrados no relatório. Tokens e credenciais não
serão registrados.

## Observabilidade, falhas e segurança

`/readyz` só retorna sucesso quando persistência e billing necessários estão
operacionais. A homologação deve observar pelo menos solicitações, erros 4xx e
5xx, latência, falhas de webhook, ingestão e conexões com o banco. Logs devem
usar IDs de correlação e redigir `Authorization`, cookies, API keys, secrets e
conteúdo privado.

Falhas são tratadas de forma fechada:

- banco indisponível: prontidão falha e operação jurídica não usa fallback;
- índice indisponível: erro estruturado e nenhum débito concluído;
- saldo insuficiente: operação não executada;
- timeout/cancelamento: estado explícito e reserva financeira liberada;
- schema MCP inválido: rejeição antes da execução e da auditoria jurídica;
- webhook inválido: assinatura rejeitada e nenhum crédito aplicado;
- certificado ou DNS pendente: URL nativa pode ser testada, mas o gate remoto
  pelo domínio não é aprovado.

Nenhum segredo será criado no repositório, no Dockerfile, em argumento de build
ou em variável não protegida no console. A service account de deploy e a de
runtime terão responsabilidades separadas sempre que o console permitir sem
introduzir credenciais persistentes locais.

## Validação e relatório do gate

Os gates locais obrigatórios permanecem:

```text
pnpm typecheck
pnpm test
pnpm --filter @forgelex/web build
pnpm test:postgres
git diff --check
```

Além deles, a homologação executará migrations idempotentes, integridade do
corpus, busca real no PostgreSQL remoto, REST, MCP independente, host externo,
billing/replay, saúde, prontidão, frontend e um ensaio de carga remoto limitado.
O teste de carga terá teto explícito e não poderá ampliar automaticamente
instâncias ou volume de requisições.

Os resultados serão separados em dois gates remotos:

- gate A, URL nativa: aplicação, banco, migrations, REST, MCP, Agent Core,
  autenticação, billing, custo, logs e prontidão;
- gate B, domínio canônico: corpus STJ completo, DNS, TLS, roteamento, paridade
  funcional, cliente MCP independente, host agêntico externo e ensaio limitado.

Êxito no gate A não conclui a fase. Falha no gate A impede a criação do
balanceador e dos registros DNS.

O relatório final registrará data, branch, commit, digest da imagem, projeto,
região, recursos, origem, cobertura STJ, documentos, período, versões,
rejeitados, tempo de ingestão, taxa de erro, latências p50/p95, billing,
REST/MCP, PostgreSQL, frontend, observabilidade, host externo, autenticação e
limitações. Também registrará a estimativa anterior, o custo observado por gate,
o custo acumulado, a retenção configurada, os recursos efetivamente criados e a
data prevista de encerramento. Evidência local, simulada e externa será rotulada
separadamente.

A Fase 8 só será marcada como concluída quando todos os itens obrigatórios
estiverem demonstrados. Configuração remota existente que não for exercitada
não conta como validação; teste estrutural não substitui execução remota; e o
relatório não converterá limitações em aprovação implícita.

## Retenção e encerramento da homologação

A conclusão técnica não autoriza converter a conta em paga nem manter recursos
indefinidamente. Após o aceite do relatório da Fase 8, serão exportados os
artefatos de evidência e os dados necessários à reprodução. Salvo autorização
separada para um período adicional de homologação, o ambiente será desmontado
de forma controlada: remover DNS criado para a homologação, balanceador, IP,
Cloud Run, Cloud SQL, imagens, secrets e service accounts exclusivas, preservando
fora da nuvem somente exports saneados, hashes, configurações reproduzíveis e o
relatório. A exclusão e o custo final serão registrados.

O procedimento de encerramento deve respeitar dependências e confirmar que não
restaram armazenamento, backups, IP reservado ou outros componentes faturáveis.
Nenhuma exclusão ocorrerá antes da captura das evidências e do aceite do gate.

## Fora do escopo

- produção, SLA ou alta disponibilidade;
- novos tribunais;
- billing de modelo ou token;
- execução de OpenAI/Anthropic dentro do runtime comercial ForgeLex;
- dados pessoais ou documentos reais de clientes;
- publicação pública do plugin em catálogo;
- upgrade da conta Google Cloud para cobrança paga;
- migração remota fora do projeto de homologação confirmado.
