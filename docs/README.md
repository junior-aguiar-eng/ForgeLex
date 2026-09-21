# Documentação do ForgeLex

## Estado atual

O produto ForgeLex limitado ao STJ está `COMPLETED`. REST, MCP remoto, billing
pré-pago e operação pública foram validados; as Fases 9 a 13 permanecem
`FROZEN_STRATEGICALLY` e não representam lacuna do produto aprovado.

- [Estado canônico e evidências cumulativas](../STATUS_VALIDACAO.md)
- [Plano mestre de conclusão progressiva](../Plano%20de%20conclus%C3%A3o%20progressiva%20do%20F.md)
- [Decisão estratégica de escopo STJ](operations/phase14/strategic-freeze.md)
- [Evidência saneada da cobrança controlada](operations/phase14/controlled-charge-evidence.md)

## Operação e evidências

| Documento | Finalidade | Natureza |
| --- | --- | --- |
| [Validação final da Fase 8](operations/phase8/final-validation.md) | Domínio, ingress, REST, MCP, Agent Core e host externo | Snapshot histórico técnico |
| [Corpus STJ](operations/phase8/corpus.md) | Cobertura e promoção do corpus | Evidência histórica do data plane |
| [Gate A](operations/phase8/gate-a.md) | Validação inicial em Cloud Run | Evidência histórica do provisionamento |
| [Preflight](operations/phase8/preflight.md) | Estimativa e pré-condições antes do provisionamento | Evidência histórica |
| [Cobrança controlada da Fase 14](operations/phase14/controlled-charge-evidence.md) | Checkout, webhook, reconciliação e revogação | Evidência final de billing |

## Contratos e arquitetura

- [Legal Tool Gateway](legal-tool-gateway.md): ferramentas jurídicas STJ,
  proveniência, erros e regra de cobrança por capability.
- `superpowers/specs/`: especificações históricas que fundamentaram as fases.
- `superpowers/plans/`: planos de implementação e seus registros de execução;
  não substituem o estado canônico nem as evidências operacionais.

## Limites preservados

O ForgeLex não fornece modelo de IA, não recebe chaves OpenAI/Anthropic, não
cobra tokens e não anuncia cobertura nacional. O host externo fornece modelo e
raciocínio; o ForgeLex fornece tools jurídicas, índice próprio, proveniência,
autorização, auditoria e billing das operações próprias.
