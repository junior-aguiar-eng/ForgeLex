# ForgeLex 3 — plano de implementação do incremento 1

**Objetivo:** fechar lacunas de handoff e tornar verificações de suporte auditáveis.
**Arquitetura:** runtime nativo com verificador terminal; auditoria determinística.
**Stack:** TypeScript, Zod 4, pnpm 11.19.0, Vitest, persistência existente.
**Spec:** `docs/superpowers/specs/2026-11-01-forgelex-3-quality-design.md`.

Execução inline com as skills writing-plans, executing-plans e TDD. O pedido
delega a escolha da arquitetura e execução: sem gate adicional de aprovação.
Sem commits automáticos apesar de recomendações genéricas das skills.

- [x] Registrar baseline existente e 60 cenários no runtime original.
- [x] Adicionar contrato opcional de auditoria em domain; validar pares de suporte
      em módulo focado do workflow, integrando a entrega e a lista de limitações.
- [x] Mover verificador para depois dos produtores, atualizar instruções internas
      sem mudar catálogo histórico; testar contexto completo e retomada.
- [x] Validar persistência/API/apresentação; executar build, tipos, lint e testes.
- [x] Revisar diff e registrar comparação, limites e próximos incrementos.

Foco da revisão: avaliações duplicadas, referências estranhas, produtor tardio,
checkpoint de versão anterior, vazamento de diagnóstico na interface/cobrança.

## Registro de decisões

- 01/11: checkout original tem alterações alheias; worktree baseado em main.
- 01/11: o escopo executável deste ciclo é o primeiro incremento vertical, conforme
  diretriz final do prompt. Não declarar os incrementos 2–4 concluídos.
- 01/11: revisão técnica adicional encontrou autoverificação por claims novos no
  papel terminal e amplificação da matriz de auditoria. Dois testes falharam
  antes da correção e passaram depois; schema fechado e limite final aplicados.
- 01/11: limpeza SQLite da migration 0036 falha com EBUSY também no checkout
  intacto da main. Manter diagnóstico separado, sem modificar teste não relacionado.
- 01/11: Docker ativado por Boni; quatro smokes PostgreSQL concluídos, 41 checks.
  Suíte final: 1.452 aprovados, 17 ignorados, 1 falha preexistente EBUSY. Recorte
  final alterado: 108 aprovados; E2E comercial sintético: 1 aprovado. Build,
  tipos, lint e formatação focal aprovados. Relatório e recibos concluídos.
