# Incorporação probatória — plano

Execução inline com executing-plans e testes antes da implementação.
Spec: `docs/superpowers/specs/2026-11-01-forgelex-3-evidence-adoption-design.md`.
Stack existente TypeScript/Zod/Drizzle/pnpm; sem nova dependência ou serviço.

- [x] Contratos da revisão e migration 0037 aditiva; testar upgrade/idempotência.
- [x] Extrair escritor de itens compartilhado sem alterar o contrato OAuth.
- [x] Converter matriz em propostas com origem e âncoras; testar antes do código.
- [x] Repositório nativo com autorização, transação, token, decisão/idempotência;
      testar preview, subconjunto, alterações, rollback, concorrência e expurgo.
- [x] Rotas de sessão e UI de conferência; testar scopes e percurso E2E local.
- [x] Revisão técnica, correções e regressões focais.
- [x] Build/tipos/lint; PostgreSQL; suíte integral com um worker; relatório/recibo.

Preservar todas as alterações anteriores. Sem commit/push/deploy/inferência paga
ou migration remota. Nenhuma gravação humana de fatos é executada fora dos testes
sintéticos deste trabalho. Permissão de implementação não aprova itens reais.
