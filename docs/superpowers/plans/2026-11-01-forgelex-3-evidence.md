# Capacidade probatória — plano de implementação

Execução inline com executing-plans; revisão técnica independente ao final.
Objetivo: ação probatória da solicitação à entrega auditável, sem adoção de fatos.
Stack: TypeScript/Zod/pnpm/Vitest existentes, sem nova dependência ou schema SQL.
Spec: `docs/superpowers/specs/2026-11-01-forgelex-3-evidence-design.md`.

## Restrições e foco

Preservar alterações anteriores. Sem commit/push/deploy ou chamadas pagas.
10 papéis, um refinamento, 48 tools/12 por etapa, 192.000 bytes. Conferir
especialmente referências falsas, fontes secundárias apresentadas como prova,
datas inventadas, checkpoints históricos e cobrança por resultado ausente.

- [x] Capturar fixture v2 do build anterior; escrever testes vermelhos do novo
  fluxo em `agentic-case-task/evidence-analysis.test.ts`.
- [x] Criar contratos em `domain/contracts/task-evidence.ts`, perfis probatórios
  em `legal-agents/src/agentic-evidence.ts` e auditoria em
  `legal-workflows/src/agentic-case-task/evidence-audit.ts`.
- [x] Integrar estado v3/ação ao runtime e grafo, preservando v1/v2; conferir
  origem, cobertura, cronologia, conflitos, limites e retomada.
- [x] Disponibilizar ação na API nativa local; apresentar matriz/cronologia na entrega web;
  testar critério comercial e persistência sem incorporação automática.
- [x] Revisão técnica, regressões necessárias e testes focais verdes.
- [x] Build, tipos, lint, suíte, E2E e PostgreSQL locais; relatório e recibo.

Desenho segue a implementação incremental autorizada por Boni; escolhas
compatíveis com a arquitetura são decisões técnicas, não novas autorizações.

## Registro de decisões e evidência

- Fixture v2 capturada antes do código, contrato
  `be6575c4850189f940e206101d9148cc33430bf023e833549c06d4d9ec7ea482`.
- Ruling: cobrança da nova ação exige vínculo DOCUMENT literal conferido;
  relatos continuam úteis para organizar alegações, mas não bastam para cobrar.
  A completude considera todas as claims ativas, inclusive as posteriores.
- Ruling: entrada probatória é ação explícita, com schema de planejador restrito
  a `analyze_evidence`; demais ações permanecem v2. O teste da restrição falhou
  antes da correção e passou depois.
- Revisão independente inicial sem achado importante; 52 testes focais conferidos pelo
  revisor. Rodada final ampliada: 65 aprovados, incluindo SDK comercial.
- Revisão posterior da deduplicação visual encontrou itens sem cobertura
  ocultados. Duas regressões vermelhas reproduzidas; corrigida a filtragem por
  IDs cobertos. Nove testes de apresentação aprovados; revisor confirmou resolução.
- A rodada geral intermediária encontrou três timeouts padrão de teste.
  Inspeção do runner e repetição isolada dos mesmos arquivos: 56 aprovados,
  sem alteração de timeout ou asserções. Rodada final integral com um worker.
- Rodada integral final: 1.530 aprovados, zero falhas, 17 condicionais pulados;
  16 cobertos pelos 41 testes PostgreSQL. Somente homologação paga não executada.
- E2E: dois cenários aprovados (41,3 s). PostgreSQL: 16 checks de smoke e 41
  testes condicionais aprovados; retomada v3 em processo separado, sem replay.
- Incorporação direta não foi adicionada: exige ponte para o fluxo humano,
  sem simular grant OAuth. A entrega oferece conferência e acesso ao caso.
