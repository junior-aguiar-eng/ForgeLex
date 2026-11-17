# Mitigação temporária do aviso do picomatch — 17/11/2026

Decisão de Boni em 17/11/2026: aceitar, com prazo, o aviso `GHSA-fc5q-39xc-vjpf` (picomatch, ReDoS em extglobs repetidos,
severidade alta) no portão de auditoria completa da CI, como já foi feito com o `braces`.

## Por que

O job `security` de `main` ficou vermelho no merge do #184 (execução 44135762750), sem relação com o código dele: o aviso foi
publicado entre o último `main` verde (#183, 15:05) e essa execução. A correção anunciada (`>=4.0.8`) não existe no npm; a
última versão publicada é a 4.0.7. Atualizar não resolve hoje.

## Alcance

- Duas versões, as duas só em ferramentas de desenvolvimento: 4.0.7 pela cadeia do ESLint (`@eslint-react`, `tinyglobby`,
  `fdir`) e 2.3.2 pelo `tailwindcss` (`chokidar`, `anymatch`, `readdirp`, `micromatch`).
- `pnpm audit --prod --audit-level moderate` segue limpo: nenhuma ocorrência entra no produto.
- O portão (`scripts/security/evaluate-build-audit.mjs`) só aceita o id, a gravidade `high` e as versões 2.3.2 e 4.0.7. Outra
  versão, outro id do mesmo pacote, gravidade maior ou ocorrência sem versão reprova.

## Prazo e saída

Vale até **24/11/2026**; depois disso o portão volta a reprovar. Antes da data: se a 4.0.8 existir, atualizar (sobrepor a versão em
`pnpm-workspace.yaml`, se as ferramentas aceitarem a linha 4) e retirar a entrada; se não existir, Boni decide entre renovar o
prazo e trocar a ferramenta que traz a dependência.

Verificação: testes do portão (`scripts/security/build-audit.test.ts`, 37 no total com a evidência de expiração e dos limites) e
o script contra a auditoria real (`knownMitigated: picomatch`, `actionable: []`).
