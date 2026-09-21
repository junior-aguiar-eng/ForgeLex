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
3. Execute `02-provision-gate-a.sh`, migração, seed sintético e testes do gate A. Grave `gate-a.json` saneado com `status`, `commit` e `digest`.
4. Execute `03-publish-gate-b.sh`; crie manualmente no Registro.br apenas o registro indicado e aguarde certificado ativo.
5. Execute `04-inventory.sh` antes e depois de cada gate. Para desmontar, defina `FORGELEX_PHASE8_TEARDOWN=confirmed` e execute `05-teardown.sh`.

Os scripts não criam chaves de conta de serviço, não concedem papel básico amplo, não configuram rede autorizada no PostgreSQL e não alteram DNS. No gate A, a URL nativa aceita tráfego público, mas os endpoints jurídicos continuam protegidos pela autenticação da aplicação. Depois da publicação HTTPS do gate B, o ingress direto do Cloud Run deve ser restringido ao balanceador.
