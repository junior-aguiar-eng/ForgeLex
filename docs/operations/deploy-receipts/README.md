# Recibos de publicação

Cada arquivo desta pasta é gerado por `ops/gcp/production/deploy-from-main.ps1` ao terminar uma publicação, e registra o
que o script fez e verificou: SHA, build, digest, revisões antes e depois, flags de execução lidas e, nas falhas, o
motivo. O nome é `AAAA-MM-DD-HHMMZ-<sha7>-<resultado>.md` (UTC).

- O script **não commita**. Boni revisa o arquivo e o commita junto com o registro da aprovação no `PENDENCIAS.md`.
- Um recibo não é aprovação, não prova migrations, não substitui a verificação manual (seção 8 do checklist) e não diz
  quem executou (isso está no log de auditoria do Google Cloud).
- Recibos nunca são sobrescritos; um segundo no mesmo minuto ganha o sufixo `-2`.
- Formato e validação: `scripts/deploy-receipt.mjs`, testado em `scripts/deploy-receipt.test.ts`.
