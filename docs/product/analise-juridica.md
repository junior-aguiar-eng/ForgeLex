# Módulo de agentes jurídicos analíticos (`@forgelex/analise-juridica`)

Produto pago separado, independente do produto atual de pesquisa/gestão de caso.
Compartilha só infraestrutura: hospedagem, identidade do usuário (tenant + usuário do
MCP), saldo/débito (`LedgerService`) e o transporte MCP.

## Ativação

| Variável                          | Efeito                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FORGELEX_ANALISE_ENABLED=true`   | Registra e expõe as tools `analise.*` (desligado por padrão).                                                                                                   |
| `FORGELEX_ANALISE_BUSCA_ENDPOINT` | **Opcional.** Serviço de busca web do servidor (`GET ?q=` → `{ "results": [{ "url", "titulo", "trecho" }] }`), usado só quando o cliente não envia `url_fonte`. |
| `FORGELEX_ANALISE_BUSCA_TOKEN`    | Bearer opcional do endpoint acima.                                                                                                                              |

### Preparação do schema

O módulo segue o mesmo controle de migrations da API: em produção, com
`FORGELEX_AUTO_MIGRATE=false` (ou ausente), apenas verifica as duas migrations
analíticas e recusa a inicialização com `MIGRATIONS_PENDING` se faltar alguma.
Desenvolvimento/teste e `FORGELEX_AUTO_MIGRATE=true` permitem aplicação; não
habilitar essa exceção no runtime produtivo para contornar o gate.

O comando explícito `pnpm db:migrate` inclui `analise-0001-initial` e
`analise-0002-operation-idempotency` somente quando o processo de migration
recebe `FORGELEX_ANALISE_ENABLED=true`. Sem essa opção, o produto atual não
passa a exigir nem instalar o módulo. Repetir o comando conserva o journal.

Para uma publicação futura: aprovar e conferir backup, executar a migration
separadamente com a opção acima e conferir seu journal; só depois publicar uma
candidata com análise habilitada e `FORGELEX_AUTO_MIGRATE=false`. Validar na
candidata o catálogo, isolamento, idempotência, cobrança e encerramento de conta
antes de promover tráfego. Instalação do schema não autoriza deploy, ativação,
cobrança ou concessão de acesso. Esta preparação não executa essas ações remotas.

## Jurisprudência: descoberta no cliente, confirmação no servidor

A busca por tema (ex.: "cobrança indevida" na área já triada) é feita pelo LLM do cliente, com
a busca web dele, em sites oficiais. Cada candidato vai ao servidor com `url_fonte`. O servidor
abre a página (só domínios oficiais do tribunal, redirecionamentos revalidados) e confirma
apenas se o identificador completo constar nela, com a classe informada quando
existente. Não concatena dígitos dispersos nem confirma por semelhança de palavras.
Descrição de tese sem identificador permanece não verificada. Localizar o número
não demonstra que o precedente sustenta a tese. Sem `url_fonte` válida: `nao_verificado`.

Muitos portais (STJ/STF/TST) bloqueiam ou renderizam por JavaScript e o servidor não consegue ler a
página. Nesse caso, o cliente envia também `trecho_fonte` (cópia literal da página oficial) e, se a
URL for oficial e o trecho trouxer o identificador, o status é `confirmado_pelo_cliente`
(trecho informado pelo cliente, a conferir na fonte). `confirmado_busca_externa`
fica reservado ao que o servidor leu. Se o servidor leu
a página e o precedente não consta, o trecho do cliente não prevalece.

A checagem normativa enviada pelo cliente não constitui auditoria de vigência pelo
servidor. Booleano positivo acompanhado de URL HTTPS oficial válida produz
`declarado_pelo_cliente`, sempre com ressalva. Sem essa fonte, permanece
`nao_verificado`; o módulo não certifica o teor ou a vigência por receber uma URL.
O resumo público conserva trechos ausentes, lacunas, riscos de preclusão,
divergências de triagem e ressalvas das fontes, sem declarar fundamentação a priori.

## Tools

`analise.peca_analisar`, `analise.mapear_teses`, `analise.avaliar_prova`,
`analise.estrategia_definir`, `analise.peca_redigir`, `analise.combo_ativar`.
`analise.jurisprudencia_verificar` é interna (registrada, nunca exposta nem cobrada à parte).

O servidor não tem LLM no caminho MCP: a análise jurídica vem do LLM do cliente, guiado
pela `description` de cada tool. O servidor valida a estrutura, confere trechos
literais, aplica correções dirigidas, verifica precedentes em fonte oficial, impõe o
aviso obrigatório, mantém o estado da sessão e cobra.

## Dados

Tabelas isoladas `analise_sessoes`, `analise_achados`, `analise_combos`, `analise_consumos`
(migration `analise-0001-initial`) e `analise_operacoes`
(`analise-0002-operation-idempotency`), sem referência às tabelas do produto atual.
`sessao_analitica_id` pertence ao par (tenant, usuário); outro usuário recebe o mesmo
erro de sessão inexistente.

O encerramento de conta inclui essas tabelas no expurgo e na verificação de
resíduos. Aplica a categoria existente `SESSIONS`, respeitando exceções vigentes;
dados de outro tenant permanecem preservados. A descoberta por catálogo também
funciona com a flag desligada e com as tabelas opcionais ausentes.

## Repetição e concorrência

O registro persistente de operação vincula a chave ao usuário, à sessão, à ferramenta
e ao conteúdo, antes de escolher combo ou cobrança avulsa. Repetição concluída
recupera o resultado sem novo débito, inclusive na ativação do combo. Pedido com
conteúdo ou usuário diferente não recebe o snapshot. Direitos de ferramentas
distintas do combo continuam cobertos quando disputam uma atualização da lista;
falha devolve somente o direito daquela ferramenta.

Operação `RUNNING` devolve orientação para consultar a mesma solicitação, sem
executar nem cobrar novamente. Estado `FAILED` ou execução interrompida sem
resultado confirmado exige reconciliação; esta mudança não implementa retomada
automática após reinício. Não mudar a chave automaticamente para contornar esse
estado. Snapshots legados de combo sem fingerprint não são devolvidos, e as
operações antigas do ledger conservam suas cobranças sem replay não verificável.

O [roteiro de reconciliação](../operations/analise-reconciliation.md) define
contenção, consultas somente leitura, decisão por cenário e recibo restrito.
Resultado liquidado no ledger sem envelope analítico não libera nova cobrança;
interrupção após consumo de combo não libera restauração presumida de direitos.
A intervenção específica e a avaliação cabem a Boni. Não há comando genérico
de reparo ou retomada automática nesta entrega.

## Verificação PostgreSQL local

Após `pnpm build`, os testes de cobrança podem usar
`FORGELEX_ANALISE_TEST_POSTGRES_URL` apontando somente para o banco temporário
`forgelex_analise_review` em `127.0.0.1`. Executar:

```text
pnpm exec vitest run packages/analise-juridica/src/cobranca.test.ts --maxWorkers=1 --testTimeout=15000
node scripts/smoke-analise-postgres.mjs
```

Esses ensaios criam e removem dados sintéticos no banco de teste. O smoke verifica
o comando real de migration com e sem opção de análise, idempotência do journal,
inicialização `verify` em transação somente leitura, resíduos, expurgo, isolamento
do outro tenant e instalação sem o módulo. Os testes de cobrança incluem
interrupções após liquidação e consumo de combo. A CI cria o banco dedicado
`forgelex_analise_review` separado de `forgelex` e executa ambos os comandos
sequencialmente, sem compartilhar tabelas com as outras regressões PostgreSQL.

## Preços iniciais (centavos; a calibrar)

Triagem embutida: 12. `peca_analisar` 75, `mapear_teses` 125, `avaliar_prova` 125,
`estrategia_definir` 200, `peca_redigir` 300 — cada chamada cobra tool + triagem.
Combos (15% abaixo da soma): `decisao` (analisar + mapear + estrategia) e `completo`
(as cinco). Cada tool do pacote é coberta uma vez por sessão; depois, preço cheio.
Sem reembolso retroativo.
