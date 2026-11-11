# Correção dos bloqueios editoriais

## Contrato e escopo

Boni determinou em 30/10 corrigir os bloqueios editoriais antes de aprovar o
piloto. A saída histórica T6-GAP mistura quatro orientações de redação com
requisitos processuais; o agregador exige fonte normativa de todas e encaminha
todo documento ao especialista processual. O registro factual termina limitado
por exigências que não correspondem à tarefa solicitada.

A correção será aditiva, sem migrations ou nova chamada paga:

- Classificar requisitos como `EDITORIAL` ou `PROCEDURAL`. Ausência da nova
  classificação mantém a interpretação processual anterior, sem transformar
  payloads históricos na leitura.
- Distinguir explicitamente no plano `FACTUAL_RECORD` de `LEGAL_DOCUMENT`.
  Planos antigos continuam no caminho jurídico conservador. Registro factual
  só recebe o caminho simplificado sem pedido de normas, jurisprudência ou
  procedimento; declarações contraditórias não removem os controles jurídicos.
- Orientações editoriais verificadas não precisam de norma jurídica. Requisitos
  editoriais não cumpridos continuam identificados. Requisitos processuais
  continuam exigindo norma e verificação; apenas orientações editoriais não
  satisfazem a avaliação processual de um documento jurídico.
- Preservar fontes, lacunas, validação de citações, avaliação jurídica pendente
  e revisão humana obrigatória. Atualizar as instruções versionadas e rejeitar
  retomada de checkpoints com o contrato anterior.

## Arquivos propostos

- `packages/domain/src/contracts/agentic-case-task.ts`
- `packages/legal-agents/src/agentic-case-contracts.ts`
- `packages/legal-workflows/src/agentic-case-task/case-task.ts`
- `packages/legal-workflows/src/agentic-case-task/case-task.test.ts`
- Testes de contrato em `packages/domain/src/contracts/agentic-case-task.test.ts`
- Registro da correção e da avaliação ainda pendente em
  `docs/operations/agentic-workspace/2026-10-30-pilot-evaluation.md`

## Execução e critérios

1. Reproduzir a classificação incorreta com as orientações e o texto reais da
   evidência sintética T6-GAP; ver a regressão falhar antes da implementação.
2. Implementar finalidade e classificação explícitas, com semântica conservadora
   para dados antigos. Testar que registros históricos não são reescritos.
3. Demonstrar registro factual candidato sem bloqueios processuais artificiais,
   mantendo texto, lacunas e revisão humana; demonstrar bloqueio de documento
   jurídico sem exame processual e de requisito processual sem norma.
4. Validar contratos, workflow e integração pertinente; build, lint, tipos e
   regressão geral. Não carregar o runner real nem abrir o ledger do piloto.
5. Registrar limites do replay local, enviar correção para CI e integrar somente
   com checks aprovados. A aprovação jurídica continua dependendo de Boni.
