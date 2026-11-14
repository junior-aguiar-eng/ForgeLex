# Homologação Google Cloud — Fase 8

> **Status:** runbook histórico de provisionamento. A Fase 8 e a Fase 14 estão
> concluídas; não reexecute provisionamento, carga do corpus ou teardown como
> rotina de validação. O serviço ativo recebe tráfego externo pelo balanceador,
> e a URL nativa do Cloud Run permanece bloqueada. Consulte
> `../../docs/operations/phase8/final-validation.md` e
> `../../docs/operations/phase14/controlled-charge-evidence.md` para a
> evidência final.

Runbook de Cloud Shell para o projeto `project-bbbe1209-c295-4720-867`, região `southamerica-east1` e domínio `hml.nexojuris.ia.br`. O gate A usa apenas a URL nativa do Cloud Run; o gate B publica o balanceador HTTPS e somente imprime o registro A que deverá ser criado no Registro.br.

1. Copie `config.env.example` para `config.env`, informe o SHA do commit, o digest quando já conhecido e as credenciais apenas no ambiente da sessão.
2. Gere e aprove `phase8-measurement.json`; execute `01-preflight.sh`. Se a API
   Cloud Billing Budget estiver desativada, confirme o orçamento já verificado
   no console com `FORGELEX_PHASE8_BUDGET_CONFIRMED=confirmed`; o preflight não
   habilita APIs nem altera o projeto.
3. O provisionador `02-provision-gate-a.sh` está desabilitado e termina antes de ler configuração ou executar comandos. Para eventual novo ambiente autorizado, siga o fluxo seguro abaixo; o roteiro antigo não deve ser reativado. Migração, seed e testes exigem o escopo específico da operação aprovada.
4. Execute `03-publish-gate-b.sh`; crie manualmente no Registro.br apenas o registro indicado e aguarde certificado ativo.
5. Execute `04-inventory.sh` antes e depois de cada gate. Para desmontar, defina `FORGELEX_PHASE8_TEARDOWN=confirmed` e execute `05-teardown.sh`.

Os scripts não criam chaves de conta de serviço, não concedem papel básico amplo, não configuram rede autorizada no PostgreSQL e não alteram DNS. No gate A, a URL nativa aceita tráfego público, mas os endpoints jurídicos continuam protegidos pela autenticação da aplicação. Depois da publicação HTTPS do gate B, o ingress direto do Cloud Run deve ser restringido ao balanceador.

## Substituição segura do provisionador histórico

O script antigo expunha a senha do PostgreSQL nos argumentos de `gcloud` e
`python3`. O bloqueio é permanente; consultar o histórico Git não autoriza executar
sua versão anterior. `01-preflight.sh` e `04-inventory.sh` continuam disponíveis
para suas consultas e verificações previstas.

Para provisionamento novo, Boni deve definir e autorizar o ambiente e a operação.
Use o Console do Google Cloud para criar/alterar o usuário SQL e fornecer a senha
pelo campo protegido, sem `gcloud --password` nem senha em argumentos de scripts.
Cadastre o `DATABASE_URL` diretamente no Secret Manager pelo console, e configure
o Cloud Run para referenciar uma versão do segredo. Uma futura automação deve
usar a Cloud SQL Admin API autenticada, com senha apenas no corpo HTTPS e sem
registro desse corpo; precisa de implementação e validação próprias antes do uso.
O restante da infraestrutura deve seguir o runbook vigente do ambiente pretendido.
Este documento não executa nem autoriza provisionamento ou publicação.

## Exportação e restauração STJ

`scripts/phase8/export-global-stj.mjs` aceita credenciais nas variáveis
`FORGELEX_PHASE8_SOURCE_DATABASE_URL` e `FORGELEX_PHASE8_TARGET_DATABASE_URL`.
As URLs devem informar usuário e banco explicitamente. Forneça-as por ambiente
protegido, sem colá-las no comando ou no histórico do shell.
O script passa uma URL sem senha ao PostgreSQL e cria um `PGPASSFILE` exclusivo
em diretório `0700`, arquivo `0600`, removido após sucesso, erro, SIGINT e SIGTERM.
Não herda as variáveis `PG*` nem as URLs da aplicação para os subprocessos.
A senha pode conter dois-pontos e barra invertida; CR, LF e NUL são rejeitados
porque não podem formar um registro seguro no passfile. Parâmetros de conexão
aceitos: `host`, `port`, `sslmode`, `connect_timeout`, `sslrootcert`, `sslcert` e
`sslkey`; overrides de senha, serviço e passfile são rejeitados. Diagnósticos dos
clientes PostgreSQL são suprimidos; a falha informa somente comando e código.

Plataforma suportada: POSIX com permissões Unix, validada em Linux. Windows é
recusado antes da criação de credenciais temporárias, pois `chmod` não garante
ACL privada. SIGKILL, falha do sistema e desligamento abrupto não permitem rotina
de limpeza: use diretório temporário local privado/efêmero sob a conta operadora.
Para reverter a correção, suspenda a exportação; não recoloque senha em argv.
