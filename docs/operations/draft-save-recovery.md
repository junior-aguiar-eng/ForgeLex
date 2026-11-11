# Ativação da recuperação de salvamento

A migração `persistence-0041-draft-save-commands` cria a tabela de recibos de salvamento e seus índices. Cada recibo registra o comando no escopo do tenant e do usuário e conserva os metadados originais do resultado. O texto, as seções e as citações são recuperados da versão correspondente. A exclusão definitiva da versão remove o recibo. A purga do caso e o encerramento da conta também removem os recibos aplicáveis.

## Preparar a aplicação

1. Identifique o banco PostgreSQL e confirme a autorização de Boni para aplicar a migração nesse alvo.
2. Confirme que o esquema de rascunhos existente está atualizado e que há backup restaurável. Registre o alvo e a evidência do backup sem expor a credencial.
3. Com `DATABASE_URL` apontando para o alvo autorizado, execute o comando abaixo em uma sessão de PowerShell. O modo dedicado aplica apenas a migração de recibos.

```powershell
$env:FORGELEX_MIGRATE_DRAFT_SAVE_COMMANDS = 'true'
try { pnpm db:migrate } finally { Remove-Item Env:FORGELEX_MIGRATE_DRAFT_SAVE_COMMANDS }
```

4. Confira `persistence-0041-draft-save-commands` no registro de migrações e confirme a criação da tabela e dos índices. Habilite `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED=true` na API depois dessa conferência. O editor usa comandos quando a API anuncia o recurso na listagem dos rascunhos.
5. Com dados de teste autorizados, confira criação, leitura do recibo, repetição do mesmo comando e rejeição do mesmo identificador com conteúdo diferente.

## Reverter a ativação

Concilie os salvamentos pendentes e desabilite `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED`. Mantenha a tabela e os recibos para recuperar comandos anteriores após uma reativação. A remoção da tabela exige decisão separada, backup verificado e avaliação dos recibos que seriam perdidos.
