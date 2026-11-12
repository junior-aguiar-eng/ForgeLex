# Encerramento das pendências residuais da auditoria

Escopo aprovado: pedido de Boni em 09/10 para resolver as pendências da auditoria de 07/10. As Tasks 1–6 do plano anterior já foram integradas nas PRs #58/#59; não serão reexecutadas.

## Restrições

- Preservar arquitetura MCP, preços, dados de clientes e publicação vigente.
- Não fabricar revisão humana, parecer fiscal, contrato ou aprovação de expurgo.
- Não descartar o advisory de braces: patch local não é release do fornecedor.
- Usar o worktree document-reader, branch codex/audit-residual-closure, base 0649273.

## Tarefas

1. Revalidar Git, CI, dependências, tráfego e execução diária de retenção.
2. Reproduzir a recursão descontrolada de braces com teste real; aplicar patch pnpm com validação iterativa de profundidade antes dos walkers compile/expand/stringify. Provar rejeição controlada de strings e ASTs profundos e compatibilidade de globs normais.
3. Validar build/CSS, lint, typecheck, suíte unitária e audit; registrar o alerta residual sem ocultá-lo.
4. Registrar inspeção, backups e proposta concreta de ativação, com categorias e gates de aprovação; obter as informações humanas disponíveis.
5. Revisar a alteração, fazer commit/push/PR e acompanhar os checks antes da integração já autorizada. Deploy somente se necessário para entregar comportamento de runtime alterado.

## Foco da revisão

- O patch deve proteger entradas AST e string sem recursão em sua própria validação, incluindo o caminho stringify chamado por expand.
- Instalação congelada e build devem usar a dependência efetivamente corrigida; nenhum teste deve resolver uma cópia sem patch.
- CSS e globs usuais devem conservar o comportamento; o limite se aplica à profundidade, não à quantidade de irmãos.
- Nenhuma afirmação de encerramento humano ou expurgo ativo deve decorrer de teste automatizado ou inspeção.
