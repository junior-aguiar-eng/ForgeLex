# Grafo adaptativo — plano de implementação

> Execução inline com `superpowers:executing-plans`, testes antes da implementação
> e revisão técnica com contexto independente ao final.

**Objetivo:** roteamento por capacidades e um refinamento limitado, com journal
durável e compatibilidade explícita com checkpoints v1.
**Arquitetura:** DAG nativo determinístico; um nó executado por etapa; outputs
substituídos arquivados e excluídos da entrega ativa.
**Stack:** TypeScript, Zod, pnpm e Vitest existentes; sem dependências novas.
**Spec:** `docs/superpowers/specs/2026-11-01-forgelex-3-adaptive-graph-design.md`.

## Restrições

10 execuções de papéis por trabalho, um ciclo de replanejamento; limites de
48 tools/12 por etapa, 192.000 bytes, orçamento e autorizações atuais mantidos.
Sem commit/push/deploy ou chamadas pagas. Preservar todas as mudanças anteriores.
Execução autorizada diretamente por Boni; não adicionar uma nova aprovação
para a direção nativa já escolhida na auditoria e solicitada neste incremento.

## Tarefas

- [x] Capturar checkpoint v1 antes da alteração em
  `packages/legal-workflows/src/agentic-case-task/fixtures/pre-graph-v1.json`.
  Hash de contrato: `d097ba9f837fd4a6b89c97baf3e2baa632949482e505f21e6ba42f0b25860888`.
- [x] Conferir desenho com revisor técnico independente: nenhuma pergunta
  importante pendente; Boni continua único aprovador humano.
- [x] Escrever e executar regressões vermelhas em `adaptive-graph.test.ts`:
  roteamento, capacidade indisponível, dependência tardia, invalidação, limites,
  retomada sem replay, v1 e checkpoint alterado.
- [x] Adicionar contratos adaptativos em `legal-agents/src/agentic-case-graph.ts`,
  preservando schemas/perfis legados; exportar pelo index existente.
- [x] Implementar compilação, reconciliação e conferência do grafo em
  `legal-workflows/src/agentic-case-task/orchestration-graph.ts`; integrar
  estado v2/legado v1 e execução no `case-task.ts`.
- [x] Validar casos focais e comparação determinística antes/depois. Fixar a
  arquitetura pelo comportamento observado, sem extrapolar qualidade jurídica.
- [x] Integrar ao driver comercial sem alterar preços/journal; testar SDK
  sintético, cancelamento, custo único e retomada PostgreSQL entre processos.
- [x] Executar build, tipos, lint, suíte completa, E2E e smokes pertinentes.
- [x] Revisão final, correções necessárias e nova validação focal; atualizar
  CONTINUIDADE, PENDENCIAS, relatório e recibo com hashes/resultados.

## Foco da revisão

Resultado antigo não pode sobreviver à invalidação; pedido repetido não pode
criar laço; verificador não pode preceder nenhum produtor ativo; v1 não pode
ganhar chamadas/contrato novo silenciosamente; tool/conta/fonte/orçamento
revogados devem continuar impedindo dispatch.

## Registro

- Desenho autorizado pelo pedido de implementação do incremento nativo. A
  conferência de desenho não apontou decisões de produto ainda necessárias.
- Fixture v1 capturada executando o build anterior com provider falso; não foi
  fabricado um hash de compatibilidade a partir da implementação nova.
- Ruling: quando um refinamento introduz fundamento jurídico em documento
  inicialmente apenas factual, preservar a condição conservadora existente
  de assessoria processual; não presumir dispensa nem escolher uma medida.
  O teste registra essa etapa adicional e o limite de papéis continua aplicado.
- Revisão encontrou quatro lacunas de integridade/roteamento: inputHash sem
  preimage, SKIPPED com evidência, replay se faltasse plano, bloqueio global de
  fontes/capacidade parcialmente disponível. Regressões reproduzidas antes das
  correções; snapshot verificável e falhas por ferramenta implementados.
- Nova conferência do revisor: 28 testes focais aprovados, sem novo achado
  acionável no recorte; também corrigidos limite de estado ao perguntar e
  sinalização de análise processual vazia em nova capacidade solicitada.
- Validação final: 1.491 testes aprovados e 17 condicionais pulados na suíte
  geral; 41 aprovados na rodada PostgreSQL, cobrindo 16 desses 17. Homologação
  com provider real não executada. Smoke PostgreSQL: 13 checks; E2E comercial:
  um cenário aprovado. Build, tipos, lint e formatação pertinentes aprovados.
