# DataJud: lentidão e incompatibilidade de metadados

Incidente relatado pelo usuário após a primeira publicação. O aviso da tela
é o cancelamento do navegador após 20 s, sem atribuição comprovada a horário.
Logs da revisão `forgelex-api-prod-datajud-bd5d224`: 502 em 9,427 s e
504 em 15,005/20,665 s. A primeira validação produtiva por `match_none`
verificou conexão/envelope vazio, não as variações de um processo preenchido.

Diagnóstico direto da fonte, restrito ao processo informado pelo usuário,
sem persistir número, corpo, nomes ou movimentações: HTTP 200 em 16,817 s
e 21,960 s, mas rejeição local por formato. Foram registrados somente tipos,
nomes dos campos incompatíveis e contagens. O diagnóstico não acessou
ledger, histórico ou operações remuneradas. Não há evidência neste
incidente de interrupção diária programada por horário.

## Correção

O código IBGE do município pode ser nulo e é omitido quando ausente.
Código numérico textual validado é convertido em inteiro seguro; strings
vazias ou malformadas não se tornam zero. O órgão da movimentação usa
`codigo/nome` na fonte, convertido para o contrato `codigoOrgao/nomeOrgao`;
o formato anterior continua aceito. Órgão incompleto/nulo permanece ausente.

Movimentação pode não conter código ou descrição. Mantém o instante válido
e informa `Descrição não informada`, sem inventar código TPU. `code` torna-se
opcional na resposta OpenAPI e no cliente; tela não exibe código ausente.
Não relaxa número CNJ, identidade do processo, tribunal, sigilo, validação
das datas ou rejeição de resposta parcial/excessiva.

Prazo da fonte: 60 s; navegador: 75 s, incluindo margem de transporte/início
da instância. Não executa retry automático, chamadas extras, caching de
resultados, armazenamento permanente ou cobrança. Quotas/concorrência
permanecem. Indisponibilidade real do CNJ continua possível e distinguida
de resultado vazio.

## Validação

Fixtures independentes dos dados reais. Red/green: resposta válida com
nulos/códigos textuais/campos ausentes, rejeição de código vazio, limite
da fonte e contrato do cliente. 46 testes específicos aprovados. Teste
de navegador reproduz espera de 61 s com relógio simulado e confirma
uma chamada, botão desabilitado e movimento sem código. 14 E2E públicos
aprovados em 61,5 s após o ajuste de prazo, incluindo acessibilidade/layout existentes.

Build, lint e typecheck aprovados. Suíte integral serial na revisão
`43ea6e6` anterior ao último ajuste de prazo: 114 arquivos
aprovados/dois ignorados; 631 testes aprovados/cinco ignorados, exit 0,
em 198,38 s. Uma tentativa após correção recebeu timeout da fonte aos
30,012 s; não é prova de sucesso. A candidata com 30 s também retornou
504 em 30,608 s. Diagnóstico com prazo de 60 s recebeu e normalizou
três registros em 31,832 s, comprovando que 30 s ainda era prematuro.
O ajuste de 60/75 s mantém prazo finito e uma única chamada.
CI, versão e implantação confirmados abaixo. Não foi necessário alterar banco ou aplicar migration.

## Publicação confirmada

PRs #38 e #39 integradas; fonte final de código `8f19255ae16b84f5fa2d256d717b07ad9d6bfc55`.
Seis checks aprovados na PR #39 e em main, incluindo PostgreSQL e E2E.
Cloud Build `489bdc49-6df4-461f-a7f2-8f36d9d4ee27`: SUCCESS.
Imagem: `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:9db89ed4a2f27b316e22f16cf78b5e363068e74a0f71aa28748f77bf27e47530`.
Revisão `forgelex-api-prod-datajud-8f19255` a 100% em https://nexojuris.ia.br.
Rollback preservado: `forgelex-api-prod-datajud-bd5d224`. Sem migration.

14 E2E no frontend remoto da candidata e 14 no domínio normal aprovados,
com resposta fictícia no teste de processo. Teste separado do processo
informado pelo usuário no endpoint produtivo: HTTP 200 em
7.681 s, 3 registros, cobrança FREE/zero créditos,
no-store. O recibo guarda somente contagens, status e duração, sem número,
nomes ou conteúdo processual. O teste preenchido comprova normalização
real e conectividade Cloud Run → CNJ. Uma tentativa separada com
`match_none` em job recebeu 429 do provedor e não conta como sucesso.

Observação após promoção: 58 readyz 200 em
121.881 s, logs confirmando somente a nova revisão.
Configuração anterior preservada. API gratuita mantém 400 para entrada
inválida; histórico, conta financeira e status MCP sem credencial mantêm
401. Helpers de candidata removidos; 0 logs ERROR na conferência
final desta revisão. Checkout P2 original preservado.

Evidência sanitizada: [recibo](./2026-10-03-datajud-response-compatibility-proof.json).
Disponibilidade contínua da fonte externa não é garantida por estes testes.
