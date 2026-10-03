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
CI, versão e implantação serão registrados
após conclusão. Não foi necessário alterar banco ou aplicar migration.
