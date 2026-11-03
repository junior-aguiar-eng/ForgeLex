# Editor final: conexão autorizada com a minuta

Implementação local solicitada por Boni em 03/11/2026, no checkout
`forgelex-3-audit/SDK`, branch `codex/forgelex-3-quality`, HEAD
`5ba4ca87f3d4602db878ce8935552354c2743ee2`. As alterações ainda não commitadas
do contrato editorial de 02/11 foram preservadas.

## Comportamento implementado

O adaptador nativo carrega uma entrega persistida pertencente ao usuário/tenant,
vinculada a execução concluída, e exige os IDs explícitos da minuta e versão.
Revalida acesso atual e revisão do contexto. A versão deve continuar corrente;
título, número/ordem das seções, conteúdo exato e hash devem coincidir com a
entrega. Não aceita checkpoint sem entrega, versão diversa ou conteúdo alterado.

Fontes locais são reconstruídas pela seleção nativa autorizada. Fatos/provas
aprovados passam pela conferência dos recibos, estado atual e vínculos, incluindo
a coerência de `approvedItem`. O texto integral de NORM/AUTHORITY vem apenas das
evidências persistidas da execução concluída, confrontado com todos os metadados
e hashes da entrega. Sem texto íntegro disponível, a operação falha; não pesquisa
fontes nem usa IA para preencher lacunas. Auditoria de suporte ausente não vira
uma auditoria vazia presumidamente limpa.

O serviço `FinalEditorService`, em `legal-workflows`, monta o contrato existente.
Suas dependências já declaradas evitam novo pacote, serviço ou lockfile. Nenhum
papel ou etapa foi adicionado ao grafo v8.

## API local

- `GET /api/agentic/deliveries/:id/editorial-context?draftId=...&versionId=...`
  retorna `FinalEditorialContext`, preparado pelo servidor.
- `POST /api/agentic/deliveries/:id/editorial-proposals/validate`
  recebe `{ draftId, versionId, proposal }`, recarrega o contexto autorizado e
  retorna a proposta validada. Contexto/fontes adicionais vindos do cliente
  são recusados. Divergências na proposta usam `INVALID_INPUT`; versão/fonte
  indisponível ou contexto obsoleto falham explicitamente.

As duas rotas exigem sessão, `research:read`, `matter:read`, proprietário e
compatibilidade da execução com piloto/comercial. Respostas usam `no-store`.
São operações sem escrita de negócio: transações reutilizam updates sem mudança
de valor para os locks existentes. Não criam versão, proposta persistida,
aprovação, cobrança ou evento de execução. O POST não aplica patches.

## Validação

Fixtures de SQLite em memória com migrations locais e serviços reais exercitam
isolamento, escopos, revogação entre GET e POST, alterações de versão/contexto,
integridade de texto/hash, checkpoint sem entrega, fontes indisponíveis,
auditoria ausente, reconstrução de fato aprovado e rejeição após alteração.
Snapshots de tabelas conferem imutabilidade; provider controlado não pode rodar.
As fronteiras piloto/comercial usam serviço de execução real com decisão de
admissão controlada; não representam operação paga desses runtimes.

A rodada inicial RED teve 13 falhas por rotas ausentes; as 16 primeiras
verificações passaram após implementação. A fixture de aprovação recebeu UUID
conforme o contrato existente; 18 casos passaram antes dos dois casos de runtime.
Uma rodada de 20 casos registrou timeout de 5 s durante verificações concorrentes.
O mesmo caso passou isoladamente, sem alterar timeout ou assertions (1,06 s).
O build completo e a suíte geral final (`pnpm test`) passaram: **1.672 testes
aprovados, zero falhas e 17 condicionais ignorados**, em 233 arquivos aprovados e
três ignorados. Os 20 casos editoriais estão incluídos nesse resultado. Tipos de
persistence/workflows/API, lint e formatação dos cinco arquivos de código passaram.
A regressão focada final passou com 78 testes em cinco arquivos, incluindo
contexto nativo, fatos aprovados, driver v8, contrato e rotas editoriais.

As chaves e aprovações pagas ficaram vazias somente no processo dos testes;
variáveis de bancos opcionais foram removidas desse processo. Nenhum arquivo de
ambiente foi alterado. Testes condicionais PostgreSQL/pagos permaneceram
desabilitados; não houve E2E de UI nem smoke PostgreSQL.

[Recibo e hashes](evidence/2026-11-03-editorial-binding/validation.json),
[suíte geral](evidence/2026-11-03-editorial-binding/full-suite.txt) e
[regressão focada](evidence/2026-11-03-editorial-binding/focused-tests.txt).
Os logs são copiados com bytes preservados; `.gitattributes` protege apenas o
novo diretório. Hashes do contrato/evidências anteriores foram conferidos;
comparação Git confirmou mesa, domínio, grafo v8, catálogo, carteira, políticas
do verificador e scripts inalterados.

## Revisão e decisões

Revisão independente read-only por `gpt-6-astra`: sem achados críticos,
importantes ou menores. Boni permanece o único aprovador humano.

- Serviço colocado em `legal-workflows` pelas dependências existentes; há
  export adicional no pacote, sem alteração da execução v8.
- Contexto e versão precisam permanecer correntes. Entregas obsoletas exigem
  novo contexto; não são adaptadas ou reavaliadas silenciosamente.
- Checkpoint fornece apenas texto jurídico auxiliar conferido contra a entrega.
  Histórico sem fonte integral pode ser recusado, sem pesquisa externa.
- Revisão incluiu arquivos locais novos, pois `base...HEAD` vazio omitiria o
  trabalho não commitado. Contrato anterior foi tratado como dependência.
- Equivalência jurídica, aplicação/persistência de propostas, aprovação humana e
  UI continuam fora do incremento. Um consumidor não pode tratar sucesso do
  validador como autorização para alterar a minuta.
- Não há ativação de agente, publicação ou operação paga. Locks PostgreSQL
  foram inspecionados, mas concorrência operacional PostgreSQL não foi executada.

## Continuação e limites

A ligação local está implementada; geração de propostas por modelo e aplicação
humana com nova versão seguem etapas separadas. Qualquer aplicação futura deve
revalidar acesso e conteúdo: uma leitura não congela autorização ou versão.

Mesa, sete papéis v8, carteira, modelos e limites preservados. Nenhuma chamada
paga, alteração de arquivo de ambiente, migration remota, commit novo, push ou
deploy; sem os outros 54 cenários. D04 v8 continua sem medição real e D01/D03
aguardam avaliação de Boni.
