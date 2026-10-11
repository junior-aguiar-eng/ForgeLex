# Escopo do site: pesquisa e integração MCP

Decisão de Boni em 11/10/2026. Implementação local sobre main
`f5f9316dd0255e49029972806fb161963ab4d54a`, branch
`codex/site-mcp-scope-freeze`. Publicação e aprovação visual por Boni são
estados separados da validação técnica local.

## Matriz do congelamento

| Componente | Estado da interface | Implementação/contrato |
| --- | --- | --- |
| Casos e análise documental existente | Ocultos | Telas, serviços e dados preservados |
| Rascunhos e revisão | Ocultos; fila não carregada | Código e testes de regressão preservados |
| Salvar julgado/compartilhar caso | Atalhos ocultos | Componentes e autorização existentes preservados |
| Pesquisa STJ, cópia e proveniência | Disponíveis | Cobrança e API preservadas |
| Conectar IA, guia, OAuth e aplicações | Disponíveis | Autorizações e revogação preservadas |
| Conta, créditos, atividade, segurança, chaves | Disponíveis | Retornos de pagamento/senha e encerramento preservados |
| API Docs e consulta TJAL/DataJud gratuita | Disponíveis | Contratos, caminhos e políticas preservados |
| MCP atual | Preservado integralmente | Inclui ferramentas de casos e memorando com matterId |

`VITE_FORGELEX_CASE_WORKSPACE_ENABLED` é uma configuração pública de
apresentação, com default desabilitado. Somente o valor exato `true` habilita
as telas antigas. URLs de casos/rascunhos/revisão, inclusive aliases e barra
final, são substituídas por `/app/conectar`, descartando parâmetros/hash do
caso. Conta e callbacks próprios conservam seus parâmetros.

A fila interna usa `{ state: 'unavailable', data: [] }` no modo enxuto: esse
estado significa que não foi consultada, sem afirmar ausência de pendências
reais. A listagem de aplicativos autorizados continua usando o módulo de
permissões existente. Nenhum grant foi revogado por esta alteração.

## Limites e frentes suspensas

O congelamento suspende evolução funcional do fluxo; manutenção de segurança
e compatibilidade permanece possível. Não desliga REST/MCP, remove dados,
altera retenção nem restringe chamadas já autorizadas. Nenhum leitor de decisões
MCP foi implementado; resultados locais não comprovam execução em hosts reais.

A simplificação do fluxo e a transição para mesa/orquestração V2 ficam
suspensas. Os artefatos anteriores permanecem no checkout original e em
backup recuperável; seus patches não participam deste worktree. O plano visual
MCP de 11/10 é independente, e suas referências a salvar em casos devem ser
revistas antes de executar essa frente. Restrição do catálogo MCP exige plano
próprio de compatibilidade, separado desta ocultação visual.

## Reversão local e produção

1. Defina `$env:VITE_FORGELEX_CASE_WORKSPACE_ENABLED='true'` no PowerShell.
2. Reinicie Vite para desenvolvimento ou execute `pnpm --filter @forgelex/web build`
   para reconstruir o bundle. A flag é fixada no build; alterar o ambiente do
   servidor runtime não altera um bundle existente.
3. Abra `/app/casos`, `/app/rascunhos` e `/app/revisao`. Os testes de documentos,
   leitor, lifecycle, revisão e pesquisa mantêm a flag explicitamente habilitada.
4. Ao terminar, defina a flag como `false`, reconstrua e entregue a prévia enxuta.

Docker aceita `--build-arg VITE_FORGELEX_CASE_WORKSPACE_ENABLED=true`; o default
é `false`. Reversão em produção requer autorização própria de Boni e pode usar
a revisão anterior preservada ou um novo bundle. Não requer SQL, migração,
restauração do banco ou mudança de grants.

## Evidências

O registro técnico desta execução fica em
[registro local](../operations/stabilization/2026-10-11-site-mcp-scope-freeze.md).
Homologação visual por Boni, commit, integração e deploy não são presumidos.

Commit, push, PR, integração e deploy foram posteriormente autorizados por Boni
e executados em 11/10/2026. PR #66 integrada em `a6672d4`; revisão
`forgelex-api-prod-site-a6672d49` com 100% do tráfego. A avaliação humana da
interface continua distinta das verificações técnicas realizadas.
[Publicação e rollback](../operations/stabilization/2026-10-11-site-mcp-publication.md).
