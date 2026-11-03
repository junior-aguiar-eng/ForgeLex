# Aplicação humana versionada — 03/11/2026

Checkout `C:/Users/Boni Jr/.codex/worktrees/forgelex-3-audit/SDK`, branch
`codex/forgelex-3-quality`. O trabalho anterior foi consolidado, por autorização
expressa de Boni, no commit `cb5c16a71919c776e04b9f9da843b4d913f754f4`:
`feat(agentic): integrar propostas editoriais e revisão humana`. O checkout ficou
limpo antes desta implementação. As mudanças desta etapa permanecem locais.

## Comportamento

Concordar/Rejeitar/Adiar continuam salvando somente decisões. No mesmo diálogo,
Boni seleciona os ajustes aceitos de uma proposta, informa fundamento e confirma
**Criar nova versão com selecionadas**. Seleção e confirmação iniciam vazias.
Sugestões substantivas não podem ser aplicadas por este comando.

A API recebe IDs e hash da proposta persistida, sem aceitar texto substituto do
cliente. Reconfere contexto, fontes, versão, histórico e última decisão de cada
item. Intervalos UTF-16 são aplicados de trás para frente, preservando o restante
do texto. Resultado acima do limite ou que exigiria normalização silenciosa é
recusado antes de escrever.

Na mesma transação são criados a versão `HUMAN/DRAFT`, derivada da original, e
o recibo com autor, data, fundamento, proposta, itens, revisão/contexto, versão
original e identidade/hash da versão criada. A minuta aponta para a nova versão;
original, entrega e decisões anteriores permanecem intactas. Vínculos e citações
são copiados; verificação de citações, revisão e aprovação jurídica não são
herdadas. O recibo permite abrir a versão criada no editor já existente.

## Persistência, concorrência e limites

Reutiliza `DraftRepository.insertVersionInTransaction` sob locks nativos na ordem
conversa → caso → documentos/minuta. Falha após inserir a versão e antes do recibo
reverte a transação. Edição manual, revisão mais recente, troca de fonte/contexto
ou outra aplicação concorrente impedem gravação sobre estado obsoleto.

O recibo é opcional no registro editorial v1 existente: registros anteriores
continuam legíveis e não há nova migração. Há uma aplicação por entrega; depois
dela a entrega original fica obsoleta para novas decisões/aplicações. Replay do
mesmo UUID e corpo retorna o resultado salvo, por leitura histórica reautorizada.
Mesmo UUID com outro corpo é conflito; nenhuma exceção de acesso é concedida.

Resposta perdida mantém o comando exato, bloqueia outros envios e permite
verificar/reconciliar. Recarregar consulta o recibo persistido. Não há repetição
com UUID novo, aplicação ao aceitar uma sugestão ou disparo de agente/modelo.

Mantidos 2.048 bytes por proposta, dez propostas e cem comandos por entrega;
a aplicação conta nesse teto. Cem decisões já salvas impedem um comando adicional,
sem truncamento. Seleção de 1 a 30 IDs únicos, fundamento de 3 a 1.000 caracteres
e confirmação explícita. Limites financeiros, v8, catálogo e fluxo da mesa intactos.

## Verificação

Evidências: [recibo e hashes](evidence/2026-11-03-editorial-application/validation.json),
[desktop](evidence/2026-11-03-editorial-application/desktop.png) e
[móvel](evidence/2026-11-03-editorial-application/mobile.png).

- 135 testes focados passaram, incluindo 55 testes da API editorial.
- Nove testes de navegador passaram com API real local, SQLite descartável e
  provedor simulado; incluem comando explícito, recarga, resposta perdida e acesso
  à nova versão. Axe não encontrou violações no diálogo a 320 px.
- Três regressões da mesa passaram: opções no compositor, sugestões opcionais
  e percurso de caso/pergunta/entrega/fontes/edição manual. Capturas desktop e
  móvel da aplicação foram inspecionadas; identificador do autor quebra linha.
- Aplicação parcial, Unicode, IDs herdados de Object, último aceite, replay,
  concorrência simultânea entre aplicações, rollback, autorização, limites de texto e preservação de metadados
  exercitados. Teste do 101º comando falhou antes da correção e passou depois.
- Mudança de decisão e edição manual foram exercitadas em sequência; não houve
  teste simultâneo entre esses comandos e a aplicação. A revisão leu os locks
  existentes, sem converter essa inspeção em prova de concorrência remota.
- Primeiro teste focado teve timeout de cinco segundos em `case-task-driver`
  durante validações concorrentes. Repetição da mesma bateria sem essas execuções
  paralelas passou, sem alteração do timeout ou das asserções.
- `pnpm test` concluiu com build completo aprovado e **1.729 testes aprovados,
  17 ignorados, zero falhas**, em 235 arquivos aprovados e três ignorados.
  Tipos da API, lint, formatação e `git diff --check` também passaram.
  Os hashes das evidências anteriores e do contrato/gerador foram conferidos.

Revisão independente read-only por `gpt-6-astra`: nenhum achado crítico,
importante ou menor reportado. Revisor não executou testes; resultados pertencem
às execuções locais registradas pelo executor. Sem segunda rodada de revisão.

## Decisões e limitações

- Registro existente evita nova infraestrutura/migração, mas uma aplicação torna
  os outros ajustes daquela entrega obsoletos; não há aplicação incremental sobre
  versão já modificada. É necessário um novo contexto de revisão.
- Nova versão é rascunho e citações ficam não verificadas, inclusive as inalteradas;
  Boni deve conferir antes de aprovar o conteúdo para uso.
- Seleção pertence a uma única proposta. Não há composição de propostas nem
  tentativa automática de adaptar intervalos a outro texto.
- A revisão compara o estado local ao commit consolidado e inclui arquivos novos;
  um intervalo de commits vazio não representa a implementação ainda sem commit.

Validação não mede qualidade jurídica nem comprova operação PostgreSQL/produção.
Geração real continua desabilitada; entrada por JSON não autentica autoria em IA.
Boni permanece único avaliador humano. Sem chamadas pagas, aplicação automática,
push, deploy, migração operacional ou ampliação aos outros 54 cenários.
