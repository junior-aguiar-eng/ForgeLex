# Documentação do ForgeLex

## Estado atual

Referência documental: 10/10/2026. Começar por
[CONTINUIDADE.md](../CONTINUIDADE.md) e [PENDENCIAS.md](../PENDENCIAS.md).

Governança: [Boni é o único avaliador e aprovador humano](../AGENTS.md).
Exigências anteriores de revisão por outra pessoa não são gates vigentes.

O produto ForgeLex limitado ao STJ está `COMPLETED`. REST, MCP remoto, billing
pré-pago e operação pública foram validados; as Fases 9 a 13 permanecem
`FROZEN_STRATEGICALLY` e não representam lacuna do produto aprovado.

O marco de estabilização e validação do escopo atual está entregue. A fase 7 foi
concluída em 02/10/2026: ChatGPT e Claude conectados por OAuth, cadeia jurídica
real no ChatGPT com cobrança única/replay/revogação, validação individual de
Boni e auditoria de acessibilidade com limites explícitos. As regressões de
espaçamento foram publicadas no runtime b6c893c após CI e promoção 5/25/100.
A fase 8 segue como acompanhamento diário não bloqueante, conforme decisão
de Boni em 02/10; sete dias não são condição para continuar o projeto.
O site, DataJud público/autenticado, contexto e retorno de texto por MCP,
leitor, identificação das conexões e Pesquisa → Caso estão publicados.
As correções executáveis do recorte auditado foram encerradas em 09/10:
retenção diária ativada com autorização, mitigação local de braces e migration
0029 de pesquisa aplicada. Consultas amplas continuam custosas; a medição
registrada não constitui p95 nem garantia sob carga. A conferência de aba antiga
durante promoção permanece prevista para o próximo deploy HTTP.
Comprovações humanas, dependências externas e manutenção estão no backlog vigente.

- [Estado canônico e evidências cumulativas](../STATUS_VALIDACAO.md)
- [Plano mestre de conclusão progressiva](../Plano%20de%20conclus%C3%A3o%20progressiva%20do%20F.md)
- [Decisão estratégica de escopo STJ](operations/phase14/strategic-freeze.md)
- [Evidência saneada da cobrança controlada](operations/phase14/controlled-charge-evidence.md)
- [Baseline da estabilização](operations/stabilization/2026-09-25-baseline.md)
- [Gates locais da Fase 1](operations/stabilization/2026-09-26-phase1.md)
- [Fase 7: registro histórico e bloqueio OAuth posteriormente corrigido](operations/stabilization/2026-10-01-phase7.md)
- [Instalação real do Claude e validação manual de Boni](operations/stabilization/2026-10-02-claude-validation.md)
- [Auditoria de acessibilidade e limites de cobertura](operations/stabilization/2026-10-02-accessibility-audit.md)
- [Estudo externo opcional com cinco usuários](operations/stabilization/2026-10-01-phase7-user-study.md)
- [Reconciliação documental da Fase 2](operations/stabilization/2026-09-26-phase2.md)
- [Plano de estabilização pós-auditoria](superpowers/plans/2026-09-25-forgelex-estabilizacao-pos-auditoria.md)

## Operação e evidências

| Documento | Finalidade | Natureza |
| --- | --- | --- |
| [Braces e STJ reavaliados](operations/stabilization/2026-10-10-external-pending-review.md) | Controles locais e consulta às fontes após aprovação fiscal | 51 testes aprovados; correções upstream continuam abertas |
| [Decisão fiscal aprovada](operations/stabilization/2026-10-10-fiscal-decision.md) | Análise de PF/autoria, IR, ISS, IBS/CBS, registros e destinação | v1 aprovada por Boni no escopo descrito; cadastros e apuração não presumidos |
| [Comprovações humanas e externas](operations/stabilization/2026-10-10-human-external-pending-priority.md) | Preparação fiscal/contratual em PF, ensaios e critérios de encerramento | Roteiro; consulta externa com recibo, sem comprovação humana fabricada |
| [Consolidação documental e higiene local](operations/stabilization/2026-10-10-documentation-repository-hygiene.md) | Reconciliação das entradas documentais e preservação das branches históricas | Manutenção integrada pela PR #63; registro conserva o escopo histórico |
| [Encerramento técnico de 09/10](operations/stabilization/2026-10-09-technical-pending-closure.md) | Índice de metadados, aplicação da migration 0029 e medições | Evidência técnica e operacional datada |
| [Pendências residuais de 09/10](operations/stabilization/2026-10-09-audit-residual-closure.md) | Retenção autorizada, mitigação de braces e limites humanos | Evidência operacional datada |
| [Remediação publicada](operations/stabilization/2026-10-07-audit-remediation-publication.md) | Pesquisa → Caso, CI e revisão atual de produção | Recibo de publicação |
| [Leitor e percurso documental](operations/stabilization/2026-10-07-document-reader-publication.md) | Claude, retorno versionado, fontes e DOCX | Homologação com caso sintético e revogação |
| [Identificação das conexões de IA](operations/stabilization/2026-10-07-case-ai-connection-publication.md) | Nome/data/estado e reconexão por caso | Recibo de publicação com limites de ensaio |
| [DataJud no espaço de trabalho](operations/stabilization/2026-10-03-datajud-workspace-navigation.md) | Rotas pública e autenticada gratuitas | Recibo de publicação e testes com dados fictícios |
| [Validação final da Fase 8](operations/phase8/final-validation.md) | Domínio, ingress, REST, MCP, Agent Core e host externo | Snapshot histórico técnico |
| [Corpus STJ](operations/phase8/corpus.md) | Cobertura e promoção do corpus | Evidência histórica do data plane |
| [Gate A](operations/phase8/gate-a.md) | Validação inicial em Cloud Run | Evidência histórica do provisionamento |
| [Preflight](operations/phase8/preflight.md) | Estimativa e pré-condições antes do provisionamento | Evidência histórica |
| [Cobrança controlada da Fase 14](operations/phase14/controlled-charge-evidence.md) | Checkout, webhook, reconciliação e revogação | Evidência final de billing |
| [Encerramento de conta](operations/account-closure/validation.md) | Aceite, implantação, ativação e ensaio sintético | Evidência operacional datada; não prova encerramento real |

## Contratos e arquitetura

- [Legal Tool Gateway](legal-tool-gateway.md): ferramentas jurídicas STJ,
  proveniência, erros e regra de cobrança por capability.
- [Prompt mestre do frontend](product/frontend-master-prompt.md): referência
  canônica integral do site público e da aplicação autenticada, sem condensação.
  É cópia fiel do artefato de origem
  `Prompt_Implementacao_Frontend_Completo_ForgeLex.md` (21/09/2026), com SHA-256
  `530E818BE2678C83B05A9B1BB371CD923E57A4007AC8701AAA3CC132CBD2E001`.
  A cópia versionada é a fonte para revisão e release; o arquivo externo
  permanece apenas como origem.
- `superpowers/specs/`: especificações históricas que fundamentaram as fases.
- `superpowers/plans/`: planos de implementação e seus registros de execução;
  não substituem o estado canônico nem as evidências operacionais.

## Limites preservados

O ForgeLex não fornece modelo de IA, não recebe chaves OpenAI/Anthropic, não
cobra tokens e não anuncia cobertura nacional. O host externo fornece modelo e
raciocínio; o ForgeLex fornece tools jurídicas, índice próprio, proveniência,
autorização, auditoria e billing das operações próprias.
