# Fase 8 — preflight da homologação Google Cloud

Data: 2026-09-20  
Status: `passed-local`; provisionamento remoto ainda não iniciado

## Identidade candidata

- checkout: `C:\Users\Boni Jr\.antigravity-ide\SDK`
- branch: `main`
- HEAD-base: `95032e2d8968c20d7306622c0c9ce74eb71a30ab`
- alterações da Fase 8: locais e ainda não commitadas
- imagem local: `forgelex-api:95032e2`
- image ID local: `sha256:9354f8a662827588b2cec79610f5936b57455d3797d1ded46a912bbb96aa6508`
- tamanho da imagem: 413.005.974 bytes

A imagem passou em smoke local contra PostgreSQL 16: `/healthz`, `/readyz`,
OpenAPI, métricas autenticadas, MCP com método inválido e frontend estático na
mesma origem responderam conforme o contrato.

## Origem e capacidade

A medição foi executada sobre o banco `forgelex_phase1`, sem registrar a URL ou
credenciais. O arquivo canônico é `phase8-measurement.json` neste diretório.

- banco: 7.285.799.959 bytes
- tabelas do corpus: 7.226.515.456 bytes
- índices do corpus: 749.461.504 bytes
- documentos: 874.450
- versões: 874.516
- manifestos: 544
- execuções de ingestão: 3
- storage alvo: 10 GiB
- margem livre projetada: 32,15%
- retenção de logs: 7 dias
- carga estimada: 1.000 requisições/mês, 10 MiB de entrada e 100 MiB de saída

O volume medido cabe no limite de 10 GiB com margem superior aos 25% exigidos.
O tamanho do dump permanece `0` porque ainda não foi produzido; ele não será
persistido no volume do Cloud SQL e deverá ser medido antes da promoção do
corpus completo.

## Estimativa oficial

Na calculadora oficial do Google Cloud, em `southamerica-east1`, a configuração
mínima registrou:

- Cloud SQL PostgreSQL, `db-f1-micro`, zonal, SSD de 10 GiB: R$ 82,68/mês;
- Cloud Run, 1.000 requisições/mês e tráfego periódico com escala a zero:
  R$ 0,08/mês;
- total do gate A: R$ 82,76/mês.

O valor está abaixo do orçamento mensal de R$ 100,00. Balanceador HTTPS, IP
global e certificado do gate B não integram esta estimativa do gate A e só
podem ser promovidos após sua aprovação.

## Confirmações externas no Edge

- projeto: `project-bbbe1209-c295-4720-867` (`My First Project`);
- região planejada: `southamerica-east1`;
- billing trial ativo: crédito disponível de R$ 1.761,10, término em
  20/12/2026;
- orçamento: R$ 100,00/mês, alertas em 50%, 90%, 100% e 150%;
- APIs confirmadas: Artifact Registry, Cloud Run Admin, Secret Manager, Cloud
  Build, Cloud Logging e Cloud SQL Admin;
- Compute Engine API não apareceu na lista de APIs ativadas e será habilitada
  de forma explícita pelo runbook antes da criação do gate A;
- inventário anterior à mutação: nenhum serviço Cloud Run, instância Cloud SQL,
  repositório Artifact Registry ou secret da Fase 8;
- domínio: `nexojuris.ia.br`, publicado e delegado a `a.auto.dns.br` e
  `b.auto.dns.br`;
- `hml.nexojuris.ia.br`: sem registro A público conflitante na consulta feita
  antes do provisionamento.

O `01-preflight.sh` permanece somente leitura e agora informa APIs ausentes sem
tentar ativá-las. A execução literal no Cloud Shell não foi automatizada porque
o controle de computador não opera terminais; as mesmas verificações de projeto,
billing, orçamento, APIs e inventário foram confirmadas nas telas do console.
Nenhum recurso, credencial, segredo ou registro DNS foi criado ou alterado.

## Gates locais

- `pnpm typecheck`: PASS, 15 projetos;
- `pnpm test`: PASS, 71 arquivos aprovados, 1 ignorado, 326 testes aprovados e
  4 ignorados;
- `pnpm --filter @forgelex/web build`: PASS, 1.652 módulos;
- `pnpm test:postgres`: PASS, 12 checks;
- `git diff --check`: PASS, apenas avisos de normalização LF/CRLF;
- `pnpm exec vitest run scripts/phase8/validate-runbook.test.ts`: PASS, 3 testes;
- sintaxe dos scripts: PASS com Git Bash.

## Gate operacional seguinte

O gate A exige um commit imutável. O digest OCI definitivo será registrado
depois do build e da publicação no Artifact Registry e deverá ser exatamente o
implantado na revisão Cloud Run. O plano separa commit,
push e provisionamento remoto; não há autorização registrada para commit e
push desta Fase 8. O provisionamento não deve começar sobre um diff não
publicado, pois isso impediria reconstrução e auditoria do candidato.
