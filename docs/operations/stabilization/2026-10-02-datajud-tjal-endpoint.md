# Consulta gratuita TJAL pelo DataJud — primeira etapa

Branch `codex/datajud-tjal`, baseada em `origin/main`
`a1e717a554f3d03be9c3cffcc711b43902ce0536`. Implementação isolada no
worktree `C:\Users\Boni Jr\.codex\worktrees\document-io\SDK`;
checkout P2 original preservado.

## Contrato e integração

`POST /api/v2/datajud/tjal/process`, com corpo:

```json
{ "processNumber": "0000001-77.2025.8.02.0001" }
```

O número acima é uma fixture, utilizada somente nos testes locais.
Aceita a numeração CNJ com ou sem máscara, valida os dígitos verificadores
e o segmento `8.02`. Não aceita outros filtros, consulta em lote ou
Elasticsearch DSL fornecido pelo cliente.

Consulta exclusivamente
`https://api-publica.datajud.cnj.jus.br/api_publica_tjal/_search`, usando
`Authorization: APIKey ...` no backend. Configure
`FORGELEX_DATAJUD_API_KEY` com a chave pública vigente na
[wiki de acesso do CNJ](https://datajud-wiki.cnj.jus.br/api-publica/acesso/).
Não há chave no frontend ou valor real versionado. Sem configuração,
somente esta consulta retorna 503; o restante da aplicação continua disponível.

Acesso público sem conta, assinatura, saldo ou Idempotency-Key. Não usa
`LedgerService`, `SourceRouter`, MCP, catálogo comercial ou histórico de
pesquisa jurisprudencial. Sucesso retorna `billable: false`,
`X-ForgeLex-Billing-Mode: FREE`, `X-Credits-Charged: 0` e
`Cache-Control: no-store`. Não cria tabelas, migrations, débitos ou
armazenamento permanente de processos/resultados.

Retorna até 20 registros distintos do processo, mantendo o identificador,
grau, classe, assuntos, órgão julgador, ajuizamento, movimentações,
atualização da fonte e do índice quando presentes. Movimentações são
ordenadas por instante, considerando fuso. `truncated` sinaliza registros
adicionais na fonte; esta etapa não oferece paginação.

Seleciona explicitamente os campos enviados pelo CNJ e valida a resposta
antes de devolvê-la. Consulta e resposta exigem `nivelSigilo: 0`;
campos desconhecidos, inclusive partes, não são repassados. Dados de
outro tribunal/número, timeout interno do índice, falhas de shards,
corpo inválido ou maior que 2 MiB são rejeitados. Não há ementas,
inteiro teor, PDFs, cálculo de prazos ou inferência sobre situação processual.

O retorno identifica CNJ / DataJud como fonte e alerta sobre possível
incompletude/desatualização. Ausência na fonte não comprova inexistência
do processo ou de movimentações. Contrato documentado no OpenAPI.
Referências oficiais: [endpoint TJAL](https://datajud-wiki.cnj.jus.br/api-publica/endpoints/)
e [glossário](https://datajud-wiki.cnj.jus.br/api-publica/glossario/).

## Limites operacionais

Prazo de 15 segundos incluindo leitura da resposta; cancelamento da
requisição propagado ao fetch. Requisição limitada a 1 KiB. Por instância:
10 consultas por minuto por IP observado, 60 no total e quatro simultâneas.
Estado do limitador fica em memória com expiração, sem identificador de
conta ou número de processo. Não confia em `X-Forwarded-For` arbitrário.
Atrás de proxy, clientes podem compartilhar o IP observado e o limite;
esta etapa não modifica a política de confiança do proxy ou a infraestrutura.
Limites não são uma quota distribuída entre instâncias.

Erros de número inválido: 400; limite local/externo: 429 com Retry-After;
resposta inválida: 502; fonte/configuração indisponível: 503; timeout: 504.
Falhas não revelam credencial ou corpo bruto do provedor e não indicam
necessidade de comprar créditos.

## Evidências

35 testes específicos aprovados, usando número e metadados processuais
fictícios e transporte externo substituído por fixtures. Integração de
rota usa SQLite real e verifica zero linhas em operações financeiras,
lançamentos, uso e histórico. Testa ausência de autenticação, normalização,
dígito verificador, tribunal, sigilo, isolamento de campos, entradas
distintas, vazio, limite de exibição, falhas HTTP/rede, timeout,
cancelamento, excesso de corpo, ordenação com fusos, limites por IP,
global e concorrência, recuperação após expiração e OpenAPI.

Em `2026-10-03T02:48Z` (02/10 no fuso local), uma requisição gratuita
`size: 0`, `query: { match_none: {} }` ao endpoint oficial respondeu HTTP 200,
`timed_out: false`, zero shards falhos e zero registros. Nenhum processo
real foi consultado/coletado. Esse teste comprova endpoint/autenticação e
envelope, não completude/atualização dos dados ou E2E com processo real.

Primeira execução geral com verificações concorrentes: 615 testes aprovados,
cinco ignorados, mas erro de worker do Vitest (`Worker exited unexpectedly`),
exit 1. A execução foi rejeitada como evidência de aprovação da suíte.

Repetição integral `pnpm test --maxWorkers=1`: build aprovado; 113 arquivos
aprovados/dois ignorados, 618 testes aprovados/cinco ignorados, exit 0
(218,24 s de Vitest). `pnpm -r run typecheck`, `pnpm lint` e
`git diff --check` aprovados. Os testes PostgreSQL condicionados a ambiente
permaneceram ignorados; não há mudança de persistência nesta etapa.
Logs completos ficam fora do versionamento em `temp/datajud-*.log`.
O encerramento de worker da primeira execução não se repetiu na execução
serial; sua causa exata não foi demonstrada e não foi alterada a
configuração global do Vitest para ocultar o erro.

## Estado de entrega

Primeira etapa de backend. A interface de consulta gratuita, configuração
do runtime remoto e publicação ainda não integram esta entrega. Produção
permanece na revisão previamente publicada. A separação técnica gratuita
não representa declaração de autorização jurídica emitida pelo CNJ.
