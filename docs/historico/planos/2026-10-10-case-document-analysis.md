# Analisar documentos do caso

Escopo aprovado por Boni em 10/10/2026: IA externa consulta material selecionado,
devolve análise estruturada e Boni confere, edita, incorpora ou descarta itens.
Sem modelos internos, novas fontes, alteração de preços ou efeitos externos.

## Execução e interfaces

1. Contratos: permissão independente de receber análise com objetivo; itens
   tipados (fato, prova, evento, questão, lacuna), referências documentais fixas
   e relações de suporte/contradição. Não confirmar automaticamente fatos.
2. Persistência: migration incremental, recibo imutável da proposta, revisão e
   decisões separadas; transações, isolamento e idempotência. Incorporação
   seletiva alimenta entidades atuais e conserva origem. Exclusão/retenção deve
   abranger recibos. Documentos indisponíveis bloqueiam incorporação.
3. MCP e REST: `case.save_analysis` gratuito, OAuth revalidado, permissão/revisão
   atuais; API de conferência somente em sessão com autorização de domínio.
4. UI: autorizar objetivo/material, copiar instrução para o host, conferir
   propostas com leitor na versão fixada, editar texto e incorporar/descartar.
5. Validar contratos, isolamento, revogação, replay, rollback, concorrência,
   fontes inválidas e percurso E2E sintético; typecheck, testes, build e docs.

## Progresso

- Preparação: branch exclusiva `codex/case-document-analysis`, árvore limpa;
  base com mesmo conteúdo de `origin/main` (PR 65).
- Decisão: trabalhar neste checkout em branch exclusiva, sem alterar outros
  worktrees. Commit, push, migration remota e publicação ficam fora desta tarefa.
- Decisão: aprovação humana somente de Boni conforme AGENTS.md; conferência
  técnica não representa autenticação ou suficiência judicial da prova.
- Implementado: contratos, permissionamento, migration 0030, recebimento
  gratuito pelo MCP, API somente de sessão e UI de conferência/incorporação.
- Validado: 27 testes focados, nove E2E de contexto/análise/rascunhos, nove
  checks em PostgreSQL local, build, typecheck e lint. Revisão técnica local
  cobriu escopo de acesso, limites, fontes fixas, transações e exclusão.
- Suíte geral final: 821 testes aprovados e 17 ignorados, exit code zero.
- Execução local concluída; nenhuma operação remota ou publicação executada.
- Documentação de produto, continuidade, índice e registro canônico adequados.
  Evidências e limites em
  [registro local](../../operations/stabilization/2026-10-10-case-document-analysis.md).
