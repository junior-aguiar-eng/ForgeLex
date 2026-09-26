# Documentação do ForgeLex

## Estado atual

O produto ForgeLex limitado ao STJ está `COMPLETED`. REST, MCP remoto, billing
pré-pago e operação pública foram validados; as Fases 9 a 13 permanecem
`FROZEN_STRATEGICALLY` e não representam lacuna do produto aprovado.

Em 26/09/2026, a revisão pública observada era
`forgelex-api-hml-00021-max`, imagem `closure-release-f10e13f`, com
encerramento de conta habilitado. O novo site público está implementado na
branch de trabalho, sem deploy dessa versão. A integração em `main`, os checks
no SHA final, a decisão de topologia e a publicação do site pertencem ao plano
de estabilização; a operação contínua do encerramento continua sujeita a
monitoramento e atendimento.

- [Estado canônico e evidências cumulativas](../STATUS_VALIDACAO.md)
- [Plano mestre de conclusão progressiva](../Plano%20de%20conclus%C3%A3o%20progressiva%20do%20F.md)
- [Decisão estratégica de escopo STJ](operations/phase14/strategic-freeze.md)
- [Evidência saneada da cobrança controlada](operations/phase14/controlled-charge-evidence.md)
- [Baseline da estabilização](operations/stabilization/2026-09-25-baseline.md)
- [Gates locais da Fase 1](operations/stabilization/2026-09-26-phase1.md)
- [Reconciliação documental da Fase 2](operations/stabilization/2026-09-26-phase2.md)
- [Plano de estabilização pós-auditoria](superpowers/plans/2026-09-25-forgelex-estabilizacao-pos-auditoria.md)

## Operação e evidências

| Documento | Finalidade | Natureza |
| --- | --- | --- |
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
