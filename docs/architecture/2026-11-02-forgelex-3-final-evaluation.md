# Avaliação final do ForgeLex 3 — preparação

Data: 02/11/2026. Estado atualizado: seis lugares de calibração real executados após aprovação de Boni. Custo calculado US$ 0,135442; seis perguntas, nenhuma entrega final. [Resultado e achado](2026-11-02-forgelex-calibration-results.md). Avaliação jurídica e 54 lugares restantes pendentes. Boni é o único avaliador e aprovador humano. Nenhuma mudança na mesa, cobrança ou arquitetura do produto integra esta avaliação.

## O que será comparado

Após a rodada real, a [correção local das lacunas](2026-11-02-forgelex-delivery-gaps.md)
gerou novo candidato e novas simulações offline. O manifesto atual abaixo
identifica esse candidato, ainda sem medição real; o manifesto da rodada paga
anterior foi preservado em [calibration-real/packet.json](evidence/2026-11-02-final-evaluation/calibration-real/packet.json).

- **Inicial:** commit `025f6dd438ecfd78079b4688fd076e476da74ce9`, arquivado integralmente pelo preparador. Usar seus próprios contratos, prompts e runtime. Retomar um checkpoint v1 no código atual não equivale a executar essa versão inicial.
- **Atual:** arquivos de código, testes, scripts, dependências e configuração do worktree, incluindo arquivos ainda não commitados. O pacote registra SHA-256 por arquivo e hash agregado; uma cópia local fica em `tmp/forgelex-final-evaluation/<hash>/candidate`. O arquivo `baseline.tar` está ao lado. Não inclui `.env`, credenciais, banco ou dados do usuário. A cópia é uma referência de fontes, não um ambiente instalado nem executor real homologado.
- **Insumos comuns:** documentos fictícios, fontes fechadas, pedido, ação, modelo, raciocínio e limites iguais para cada par. Rodar cada caso em armazenamento sintético isolado, sem histórico de outra execução. Não usar respostas de uma versão como contexto da outra. Não remendar o motor antigo para adquirir controles novos; o invólucro externo de medição e limite financeiro deve ser idêntico nos dois braços.

O [pacote estruturado](evidence/2026-11-02-final-evaluation/packet.json) contém versões, hashes, corpus, plano de execução e estimativa. Os [60 cenários legíveis](evidence/2026-11-02-final-evaluation/scenarios.md) contêm as entradas e critérios. A [ficha de notas vazia](evidence/2026-11-02-final-evaluation/scores-template.csv) não contém resultados. Copiar a ficha para outro arquivo antes de avaliar; o preparador só regenera o template.

## Composição e sequência

| Grupo              | Cenários | Execuções com IA previstas | Finalidade                                                                |
| ------------------ | -------: | -------------------------: | ------------------------------------------------------------------------- |
| Comparação pareada |       24 |                         48 | Oito dossiês em análise, elaboração e revisão, nas duas versões           |
| Capacidades novas  |       12 |                     Até 12 | Matriz probatória, contexto aprovado, alteração, nova aprovação e limites |
| Controles locais   |       24 |                          0 | Testes existentes de autorização, orçamento, persistência, grafo e mesa   |
| Total              |       60 |                     Até 60 | Sem transformar ausência de capacidade antiga em nota zero                |

1. Preparar e validar o pacote offline, verificar referências dos testes e conservar as evidências locais anteriores.
2. Preparar e validar localmente o executor isolado com transporte falso: reserva acumulada antes do despacho, orçamento compartilhado entre braços, retomada sem repetir custo, cancelamento e bloqueio de chamadas fora da lista. Implementado para a calibração; envio pago exige aprovação específica do custo.
3. Executar somente a calibração: `D01-analyze`, `D04-create`, `D03-review`, ambas as versões, seis execuções. Medir tokens, chamadas, latência, saída, falhas e custo; encerrar no teto. Validar que os adaptadores preservam o comportamento dos dois motores.
4. Apresentar a medição e eventual revisão da estimativa a Boni antes do restante. Não ampliar teto, contexto ou número de chamadas para obter uma saída mais favorável. Não repetir falhas silenciosamente.
5. Executar os 54 lugares restantes do plano se autorizados. Bloqueio antes do modelo é um resultado válido quando esperado (por exemplo, fonte revogada); não consumir artificialmente o orçamento reservado àquele lugar.
6. Entregar saídas A/B sem identificação da versão para avaliação, mantendo a chave em registro separado. O plano usa ordem contrabalançada, não aleatoriedade estatística. Guardar falhas, saídas incompletas e chamadas auxiliares; nenhuma exclusão retrospectiva de casos desfavoráveis.
7. Boni atribui notas e registra aprovação, fundamento e data. Só então preencher a comparação jurídica. Qualquer correção posterior cria outro candidato/hash e outra rodada identificada.

## Rubrica e decisão

Cinco dimensões, de 0 a 4: cobertura das questões; suporte e alcance das provas; requisitos processuais e limites; enfrentamento de argumentos contrários; adequação dos pedidos/correções. Em revisão, a última dimensão mede as correções propostas. Em análise, mede a adequação das providências sugeridas. Ausência de dados pode exigir uma pergunta ou limitação e não deve ser penalizada como falha por si só.

- **0:** ausente ou materialmente incorreto.
- **1:** falhas materiais.
- **2:** parcial, exige correção.
- **3:** adequado com ressalva menor.
- **4:** adequado ao recorte, com limites explícitos.

Registrar nota e justificativa com trecho da saída e âncora da fonte. A média não compensa falha crítica: invenção material de fato/fonte/prazo/citação; uso de alteração não aprovada como aprovada; vazamento de fonte revogada ou de outro caso; incorporação sem decisão; violação de orçamento ou repetição de custo incerto. Esses eventos reprovam o respectivo cenário independentemente da soma.

Para os 24 pares: publicar notas por dimensão, diferença por par, vitórias/empates/regressões, falhas críticas e número de afirmações materiais sem suporte sobre o total de afirmações materiais. Se o denominador for zero, usar “não aplicável”; nunca transformar ausência de afirmações em precisão de 100%. Publicar custo total, custo por cenário concluído e latência mediana/máxima, incluindo custo das falhas. Uma recusa genérica não recebe nota máxima por simplesmente evitar afirmações.

Critério proposto para aceitar o conjunto: controles locais aprovados; nenhuma falha crítica atual; todos os 12 roteiros novos atendidos ou corretamente bloqueados conforme seu resultado esperado; nenhuma regressão material nos pares; ganho jurídico observável na rubrica. Se houver empate sem ganho, declarar que o avanço jurídico não foi demonstrado. O aceite final é de Boni, sem segundo avaliador obrigatório. Uma amostra pequena, fechada e sem repetições não demonstra significância estatística nem desempenho em todo o direito brasileiro.

## Fontes e limites do recorte

Fatos, nomes, documentos e a referência `REsp 0000000/ZZ` são fictícios e assim identificados. A referência fictícia é uma armadilha de verificação, nunca autoridade. Os documentos possuem âncoras estáveis por dossiê, identificador, versão e parágrafo. Rascunhos defeituosos só entram nos pedidos de revisão.

O corpus inclui recortes consultados no [Senado — CPC](https://legis.senado.gov.br/norma/584917/publicacao/15633703) e no [STJ — Súmula 481](https://scon.stj.jus.br/SCON/sumstj/doc.jsp?b=SUMU&i=196&l=100&operador=AND&ordenacao=-%40NUM&p=false&tipo=SUMULA+OR+SU). São recortes expressamente delimitados, não pesquisa atual exaustiva ou inteiro teor de precedentes. Espaços artificiais da extração do Senado foram normalizados; o texto entregue ao modelo fica congelado no pacote. Preservar no adaptador a diferença entre documento sintético, alegação, norma e enunciado oficial. Não marcar recorte como inteiro teor verificado.

Na calibração implementada, os recortes oficiais entram diretamente no contexto selecionado, sem ferramenta de pesquisa (`tools: []`). Pesquisa por ferramenta local de corpus fechado fica prevista para o executor dos demais cenários, ainda não implementado. Nenhuma consulta STJ paga ou busca externa está incluída. Essa rodada mede raciocínio e controles sobre insumos conhecidos, não cobertura da pesquisa viva. A decisão comercial já tomada — pesquisa incluída no teto do trabalho, sem cobrança separada — permanece intacta.

## Custo antes da execução

Modelo mantido: `gpt-6.1-sol`, raciocínio `low`, serviço `default`. [Tarifa oficial consultada em 02/11/2026](https://developers.openai.com/api/docs/pricing): US$ 2 por milhão de tokens de entrada e US$ 10 por milhão de saída no intervalo padrão. Não contar descontos de cache, Batch ou Flex. Não usar contexto acima de 272 mil tokens, serviço acelerado ou região com acréscimo nesta estimativa. Confirmar tarifa e configuração novamente antes do envio.

Hipótese de planejamento por execução completa, somando todas as chamadas: 15–50 mil tokens de entrada e 3–8 mil de saída, equivalentes a US$ 0,06–0,18. Não são contagens medidas. O limite atual de 2.048 tokens é por chamada; a estimativa de saída é agregada. Chamadas internas, verificação, refinamento e saídas incompletas entram na conta.

| Rodada                                  | Execuções | Estimativa de API | Teto proposto |
| --------------------------------------- | --------: | ----------------: | ------------: |
| Calibração                              |         6 |     US$ 0,36–1,08 |      US$ 1,50 |
| Conjunto completo, incluindo calibração |        60 |    US$ 3,60–10,80 |     US$ 15,00 |

Preservar o teto existente de US$ 0,25 por execução, até 24 chamadas, 2.048 tokens de saída por chamada e demais controles atuais. O custo conservador reservado antes de uma chamada pode impedir sua realização mesmo quando a estimativa média parecer caber; registrar encerramento por orçamento sem aumentar limites. Teto não garante conclusão.

O executor da calibração implementa registro durável de consumido + reservado + incerto, com teto agregado de US$ 1,50 entre os seis lugares. Boni aprovou esses seis lugares, já executados conforme o relatório acima. O teto de US$ 15 e o executor das fases restantes continuam propostos; não estão autorizados nem implementados como campanha completa. Não reaproveitar autorização ou saldo histórico do piloto de US$ 5. Sem fallback, repetição automática, juiz de IA, pesquisa paga ou custo externo adicional. Uso incerto mantém reserva e interrompe a rodada. Uma nova tentativa exige reconciliar o gasto anterior e respeitar a autorização vigente.

Valores em dólares da API, separados do preço cobrado ao cliente ForgeLex. Não aplicar a margem comercial BRL como câmbio. Conversão, tributos e encargos de pagamento não estão estimados. Nenhuma chave ou arquivo de ambiente foi necessário à preparação.

## Comparação já disponível e o que falta

| Evidência                                      | Inicial             | Atual                                                         | O que permite concluir                                                        |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Benchmark determinístico de suporte de 01/11   | 30/60               | 60/60                                                         | Melhoria dos controles testados, sem nota de mérito jurídico                  |
| Conflito com resultados fixos de especialistas | CANDIDATE, 2 papéis | LIMITED, 3 papéis                                             | Tratamento explícito do conflito naquele fixture; sem medição de tokens reais |
| Validação registrada do incremento 6           | Não aplicável       | 1.582 testes locais aprovados, 41 PostgreSQL, smoke 14, E2E 3 | Evidência técnica local anterior; não resultado desta rodada de IA            |
| Qualidade jurídica pareada com modelo real     | Não avaliada        | Não avaliada                                                  | Pendente de execução e avaliação de Boni                                      |
| Custo calculado da calibração real             | US$ 0,067562        | US$ 0,067880                                                  | Três perguntas em cada versão; custo parcial, sem entrega final               |

Referências: [auditoria inicial](2026-11-01-forgelex-3-audit.md), [comparação determinística do grafo](evidence/2026-11-01-adaptive-graph-comparison.json), [recibo local do incremento 6](evidence/2026-11-02-evidence-reapproval-validation.json). Os números são resultados registrados nessas evidências; não foram convertidos em alegação de qualidade jurídica ou produção.

## Reproduzir a preparação

Validação executada nesta preparação: **86 testes de regressão aprovados em oito arquivos**, incluindo correspondência exata dos 24 controles; **quatro testes do preparador aprovados**; lint dos scripts e `git diff --check` sem erros. A cópia congelada e os arquivos atuais foram conferidos contra todos os hashes do manifesto, assim como o arquivo da versão inicial. O [recibo desta preparação](evidence/2026-11-02-final-evaluation/validation.json) registra resultados e limites. Build e suíte completa não foram repetidos para a mudança restrita a scripts offline e documentação.

```powershell
node --test scripts/forgelex-final-evaluation/prepare.test.mjs
node scripts/forgelex-final-evaluation/prepare.mjs
```

O preparador valida os 60 cenários, referências de fontes, nomes exatos dos 24 controles, seis lugares de calibração e orçamento de todas as execuções. Congela fontes locais e produz manifesto, roteiros e ficha vazia. Não carrega SDK, transporte, credencial ou `.env`; não executa inferência nem migrations. `tmp` está ignorado pelo Git; manter a cópia local até encerrar a comparação. O manifesto permite verificar seus hashes, mas não recupera sozinho bytes apagados.

Antes de executar, verificar que o candidato do manifesto continua sendo o avaliado; mudanças de código exigem regenerar a preparação e revalidar o pacote. O recibo `validation.json` acima preserva a preparação anterior: seu hash antecede o menu reorganizado e o executor. Ele não atesta o manifesto regenerado; o novo recibo está abaixo. Não houve commit, push ou deploy.

## Executor da calibração e validação atual

`calibrate.mjs` recongela o candidato no modo offline, verifica as fontes dos dois braços e o lockfile, e executa cada lugar com aliases para seu próprio snapshot. O adaptador usa o workflow e o transporte comercial de cada versão, sem alterar o motor antigo. A carteira é exclusivamente um ledger local de avaliação; nenhum saldo de cliente é acessado. Pedidos e hashes das entradas dos três pares são conferidos ao final. Critérios esperados não são enviados ao modelo.

O lock do executor é adquirido antes de preparar arquivos e mantido durante toda a campanha. Cada reserva de chamada é persistida antes do transporte; custo incerto bloqueia continuidade. Lugares iniciados não são repetidos automaticamente. Em interrupção abrupta, locks e reservas remanescentes exigem conferência manual antes de qualquer retomada. Cancelamento tem o mesmo estado no ledger e no resultado.

Validação: **11 testes do preparador e orçamento**, **10 regressões do transporte comercial** e **seis execuções com respostas sintéticas pelo SDK**, nas versões inicial e atual. Lint dos scripts, formatação dos arquivos novos e `git diff --check` aprovados. Chamada do CLI real sem a autorização explícita foi rejeitada antes de enviar qualquer pedido. [Recibo atual](evidence/2026-11-02-final-evaluation/calibration-validation.json).

```powershell
node --test scripts/forgelex-final-evaluation/budget.test.mjs scripts/forgelex-final-evaluation/prepare.test.mjs
node scripts/forgelex-final-evaluation/calibrate.mjs
```

O segundo comando é offline por padrão: remove a chave de API do ambiente dos processos de teste e usa respostas sintéticas. Gera `comparison.json`, resultados e uma leitura A/B em `review.md`, identificada como simulação. Esses resultados offline não demonstram qualidade jurídica nem consumo real de tokens. O executor real exige flag explícita e chave no ambiente, sem carregar `.env`. A rodada real autorizada está encerrada no relatório acima; esta descrição não autoriza repeti-la ou ampliar seu escopo.

Limites: não valida login, interface, saldo comercial ou pesquisa viva; não executa os 54 lugares restantes. Build e suíte completa não foram repetidos nesta alteração de scripts. A integração de edição e revisão à mesa permanece para uma etapa posterior.
