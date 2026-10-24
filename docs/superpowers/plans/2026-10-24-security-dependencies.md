# Plano de execução — dependências de segurança

Base: main 489fd79, worktree analise-release, branch própria.
Resultado autorizado: correções atuais com contratos preservados e publicação
validada, sem incluir alterações do checkout original e sem migrations remotas.

1. Adicionar regressões de conversão Zod 4 nos adapters e testes de contratos
   para defaults, nulabilidade, identificadores, records e propriedades extras.
   Demonstrar a falha de conversão na versão anterior.
2. Atualizar manifests, overrides compatíveis e lockfile. Unificar Zod corrigido,
   atualizar Vitest/Fastify e transitivas afetadas, conservar Vite 6/7.
3. Centralizar a conversão nativa em agent-core; integrar MCP e adapters. Migrar
   records, genéricos e identificadores legados. Remover zod-to-json-schema.
4. Executar regressões focadas, build/tipos/lint, suíte completa e audit. Corrigir
   causas identificadas, sem apagar testes ou reduzir gates.
5. Conferir diff, commit, push, PR e CI integral; integrar somente com checks
   aprovados na cabeça correta. Registrar limites e decisão upstream de braces.
6. Conferir estado produtivo e configurações sem conexão SQL direta; build
   canônico de main e inspeção do artefato. Validar candidatas pública/privada e
   comercial no mesmo digest antes da promoção. Limpar recursos temporários,
   registrar provas e conferir os 47 hashes originais.
