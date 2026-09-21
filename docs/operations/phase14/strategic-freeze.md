# Fase 14 — decisão estratégica de estabilização STJ

Data: 2026-09-21  
Status: `ACTIVE_STRATEGIC_SCOPE`; produto STJ `COMPLETED`

## Decisão

O ForgeLex permanece deliberadamente limitado ao STJ após a conclusão do
produto, de suas operações públicas e da integração comercial. As
Fases 9 a 13 — STF, TST, TJSP, TJRJ e TRF3 — estão
`FROZEN_STRATEGICALLY`: não foram iniciadas, não são escopo implícito e não
constituem incompletude, falha ou bloqueio do produto STJ.

## Consequências de escopo

- Não iniciar provider, descoberta de fonte, parser, coleta, importação,
  deduplicação, migração, capability, UI ou cobrança de tribunal não-STJ.
- Manter tribunais sem provider como indisponíveis no catálogo comercial e
  rejeitar suas buscas antes do ledger.
- Não anunciar cobertura nacional, multi-tribunal, `court=TODOS` ou resultados
  agregados.
- A Fase 14 sucedeu diretamente a Fase 8 e consolidou estabilidade
  operacional, segurança, disponibilidade, observabilidade, custo, billing,
  webhook, banco, deploy, domínio e documentação do produto STJ. A evidência
  final está em `controlled-charge-evidence.md`.

## Regra de retomada

A expansão de tribunal somente pode ser descongelada por decisão estratégica
expressa e documentada. O tribunal escolhido reinicia como fase independente,
com fonte oficial, cobertura, provider, parser, corpus, proveniência,
capability, testes, operação e habilitação comercial próprios. Nada desta
decisão autoriza reutilizar artefatos STJ como prova de completude de outro
tribunal.
