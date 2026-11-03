# ForgeLex 3 — incremento 3: análise probatória

Implementação local na branch `codex/forgelex-3-quality`, sobre os incrementos
anteriores não commitados. A ação **Analisar fatos e provas** recebe o objetivo
e a seleção nativa existente, percorre o grafo e entrega matriz, cronologia e
contradições para conferência. Não houve inferência paga ou operação produtiva.

## Percurso e resultado

O analista relaciona questões e alegações/inferências a trechos com fonte e
posição explícitas. O servidor confere IDs, offset UTF-16, ocorrência literal
e hash da fonte. A relação SUPPORTS/CONTRADICTS/CONTEXT permanece proposta do
modelo. Uma ocorrência literal não confirma veracidade, autenticidade,
admissibilidade ou suficiência da prova.

As linhas distinguem trecho documental localizado, somente contexto relatado,
ausência de referência, contradição e trecho não conferido. DOCUMENT permite
vínculo documental; USER_TEXT/ANSWER preservam a origem de alegações. NORM,
AUTHORITY, DRAFT e PREVIOUS_DELIVERY não são aceitos como prova primária nesta
matriz. Fontes jurídicas continuam disponíveis ao fluxo jurídico pelos controles
anteriores, sem serem convertidas em prova dos fatos.

A revisão adversarial é obrigatória na nova ação. O revisor examina a matriz,
mas não pode substituí-la no próprio handoff. Toda afirmação da entrega ativa
deve aparecer na matriz; novas afirmações posteriores e questões sem cobertura
geram limitação. Ausência de matriz não é mascarada por uma entrega em prosa.

A cronologia conserva o texto da data e a referência. Somente data ISO válida,
literalmente presente no trecho conferido, ganha posição ordenável. Datas
imprecisas, ausentes ou incompatíveis ficam separadas como incertas. Não há
inferência automática de ano, cálculo de prazo ou conclusão temporal jurídica.
Contradições e lacunas permanecem explícitas, sem decisão automática de mérito.

## Controles, cobrança e incorporação

Permanecem seleção autorizada, tenant/usuário/caso, revisão do contexto e fonte,
cancelamento, journal e limite de chamadas. A conferência nativa também ocorre
imediatamente antes da criação do provider. Limites: dez papéis, um refinamento,
48 ferramentas por trabalho/12 por etapa e 192.000 bytes de estado/entrega.
Nenhuma ferramenta nova de escrita ou pesquisa externa foi disponibilizada.

Matriz e cronologia são persistidas dentro da entrega existente, protegidas
pelo hash do payload e pelo acesso do proprietário. Não houve schema SQL novo.
O novo critério comercial exige ao menos uma afirmação ligada a trecho DOCUMENT
conferido, com hash correspondente. Só relatos ou limitações não tornam a ação
utilizável para cobrança. Continua uma reserva e um teto; pesquisa eventualmente
solicitada segue incluída, sem débito separado.

A interface apresenta questões, alegações, trechos, relações propostas,
cronologia e contradições com fontes. Oferece acesso ao caso quando disponível
para conferência e operações humanas existentes. **Não existe incorporação
automática nem botão de adoção em lote deste resultado.** O recebimento OAuth
de análises possui grant e âncoras próprios; não foi contornado com credenciais
fictícias. Uma ponte para incorporação direta seria outro incremento.

`humanReviewRequired: true` e `legalAssessment: NOT_EVALUATED` permanecem.
Boni é o único avaliador e aprovador humano. Não foram implementados juízos
automáticos de admissibilidade, distribuição de ônus ou confirmação de fatos.

## Compatibilidade

A ação explícita `analyze_evidence` usa estado v3, perfis/policy 1.4.0 e contrato
de saída 6. O schema do planejador é restrito à ação escolhida. As outras quatro
ações continuam em v2/1.3.0; checkpoints v1 preservam o caminho anterior.
A fixture `pre-evidence-v2.json` foi capturada do build do incremento 2 antes
das alterações, com hash
`be6575c4850189f940e206101d9148cc33430bf023e833549c06d4d9ec7ea482`.
O teste retoma esse checkpoint sem executar novamente o planejador.

A matriz é opcional no schema de entrega para ler registros históricos sem
reescrever conteúdo/hash. Não há migração silenciosa de tarefas antigas para
a capacidade nova. Uma futura publicação/rollback precisa considerar os estados
v3 que imagens anteriores não leem.

## Evidência local

| Verificação | Resultado |
| --- | --- |
| Suíte integral Vitest, um worker | 1.530 aprovados, zero falhas, 17 condicionais pulados |
| Rodada PostgreSQL | 41 aprovados, cobrindo 16 condicionais da suíte integral |
| Recorte probatório/comercial | 65 aprovados |
| Apresentação após correção da revisão | Nove aprovados; incluídos novamente na suíte integral |
| Smoke PostgreSQL entre processos | 16 checks aprovados |
| E2E comercial Chromium | Dois cenários aprovados, 41,3 s |
| Build, tipos, lint e formatação pertinentes | Aprovados |

As rodadas se sobrepõem; as contagens não devem ser somadas. A única validação
condicional sem execução é a homologação paga com provider real. A rodada geral
anterior teve três timeouts no limite padrão; os mesmos 56 testes dos arquivos
afetados passaram isolados. A rodada integral final usou `--maxWorkers=1`, sem
alterar timeout, asserções ou configuração permanente do projeto.

Testes sintéticos cobrem vínculos e offsets, fontes secundárias rejeitadas,
datas incertas, duplicatas, referências inexistentes, matriz ausente/incompleta,
limite de estado, revisão obrigatória, retomada e controles de acesso.
Integração comercial percorre o SDK com transporte sintético, persistência,
reserva/liquidação única e ausência de gravação de fatos/provas.

Os resultados consolidados e hashes estão no
[recibo de validação](evidence/2026-11-01-evidence-validation.json).
A revisão técnica de IA encontrou uma omissão de apresentação: afirmações e
questões sem linha na matriz desapareciam na tentativa de evitar repetição.
A correção conserva esses itens na tela e no texto copiado, identificados como
sem cobertura; matriz parcial e vazia têm regressões específicas. O revisor
conferiu a correção e considerou o achado resolvido.
Os ensaios verificam estrutura e controles; não medem qualidade semântica com
modelo real nem homologam conclusões jurídicas.

Sem commit, push, merge, deploy, migração remota ou chamada paga. Publicação,
avaliação semântica real e incorporação direta de itens não foram executadas.
