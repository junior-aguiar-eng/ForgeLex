# Roteiro do ensaio em homologação — E3, chave inválida do provedor (24/11/2026)

Pendência 3 da seção 1A do [plano unificado](../../superpowers/plans/2026-11-11-forgelex-plano-unificado.md) e item aberto de E3:
"Ensaio em homologação com chave inválida, confirmando o log e o e-mail do alerta".
Executor, conferente e aprovador: Boni. Este roteiro **não autoriza** nenhuma operação remota; cada passo com `gcloud` que
altera estado depende da autorização dele (seção 0 do plano).

**Aceite (E3).** Uma chave inválida gera alerta em até 15 minutos sem ação de cliente. **Reversão.** Voltar o serviço à
revisão anterior, remover a política e o Uptime Check temporários e apagar o segredo de ensaio.

## 1. O que a leitura do código e do runbook mostrou (e que muda o ensaio)

Três coisas impedem rodar o ensaio "como está", e por isso o roteiro as trata como preparação:

1. **O monitor só existe com comércio ligado.** `apps/api/src/app.ts:1167` cria o `ProviderKeyMonitor` apenas se
   `FORGELEX_COMMERCIAL_EXECUTION_ENABLED === 'true'` e houver `OPENAI_API_KEY`. Nos serviços de homologação a flag está
   ausente (`forgelex-api-hml`, `forgelex-api-hml-isolated`) ou `false` (`forgelex-closure-hml-private`). Sem ela, o `/readyz`
   não consulta a OpenAI e nenhum log `provider.key_invalid` é gravado.
2. **A política de alerta só enxerga a produção.** O filtro de `provision-provider-alert.ps1` fixa
   `service_name="forgelex-api-prod"`. Um 401 em homologação não dispara a política existente. O script aceita
   `-ApiService` e `-DisplayName`, o que permite criar uma política **temporária** para o serviço de ensaio.
3. **Só o serviço isolado é seguro para ligar o comércio.** `forgelex-api-hml` e `forgelex-closure-hml-private` usam o
   mesmo segredo de banco e a mesma instância Cloud SQL da produção (`forgelex-hml-pg`). Usar `forgelex-api-hml-isolated`
   (banco `forgelex-hml-isolated-pg`, parado por padrão).

Duas observações de risco, a medir no ensaio e não a presumir:

- A verificação roda no máximo a cada 10 minutos (`ttlMs`) e o Uptime Check de produção chama `/readyz` a cada 300 s. Se a
  chave ficar inválida logo após uma consulta, a próxima consulta pode vir até ~15 minutos depois, antes de contar a
  latência do alerta. O aceite de 15 minutos pode ser estourado no pior caso. Registrar o tempo observado.
- O Uptime Check atual foi criado no console e aponta para `nexojuris.ia.br`; ele não cobre homologação. Em 12/11,
  `hml.nexojuris.ia.br` deu timeout. A parte "sem ação de cliente" exige um disparo periódico próprio no ensaio (Etapa 6).

## 2. Decisão de Boni antes de começar

| Escopo | Prova | Custo e risco |
| --- | --- | --- |
| **A. Manual** (Etapas 0–5) | Log `provider.key_invalid` e e-mail do alerta, com o disparo feito por `curl` em `/readyz`. | Sobe o banco isolado por cerca de 1 h. Sem chamada paga (a chave é falsa). |
| **B. Completo** (A + Etapa 6) | Acrescenta o critério "até 15 minutos, sem ação de cliente", com um Uptime Check temporário. | Mais 20–30 min; exige que o serviço isolado seja alcançável pelo Uptime Check. |

Recomendação: **B**. O aceite de E3 fala em 15 minutos sem ação de cliente, e só B o demonstra.

## 3. Etapas

Projeto: `project-bbbe1209-c295-4720-867`. Região: `southamerica-east1`. Registrar horários em UTC.

### Etapa 0 — Linha de base (somente leitura)

```powershell
$P = 'project-bbbe1209-c295-4720-867'; $R = 'southamerica-east1'; $S = 'forgelex-api-hml-isolated'
gcloud run services describe $S --project=$P --region=$R --format='yaml(status.latestReadyRevisionName,status.traffic,spec.template.spec.containers[0].env,spec.template.spec.containers[0].image)'
gcloud sql instances describe forgelex-hml-isolated-pg --project=$P --format='value(state,settings.activationPolicy)'
gcloud beta monitoring channels list --project=$P --format='table(displayName,type,enabled)'
gcloud alpha monitoring policies list --project=$P --format='value(displayName)'
```

Anotar: revisão atual e imagem (alvo da reversão), estado do banco (esperado `STOPPED`/`NEVER`), canal
`ForgeLex STJ ingestion alerts` ativo, e a ausência de política de ensaio. Conferir também que a imagem do serviço
isolado contém `provider-key-monitor` (SHA recente); se for anterior a 09/11, o ensaio não vale: publicar antes, com
autorização própria.

### Etapa 1 — Segredo de chave falsa

Criar `forgelex-hml-invalid-provider-key` com um valor sintético sem relação com chave real (por exemplo
`sk-invalid-ensaio-e3`), lido de arquivo temporário ou da entrada padrão. **Nunca** usar a chave de produção, nem colar
valor em chat, log ou ticket. Conceder acesso à conta de serviço do `forgelex-api-hml-isolated`.

### Etapa 2 — Preparar o ambiente isolado (exige autorização)

1. Ligar o banco: `gcloud sql instances patch forgelex-hml-isolated-pg --project=$P --activation-policy=ALWAYS --quiet`;
   esperar `RUNNABLE`. O `startupProbe` de `/readyz` precisa do banco para a revisão nova ficar pronta.
2. Criar a revisão com `FORGELEX_COMMERCIAL_EXECUTION_ENABLED=true` e `OPENAI_API_KEY` apontando para o segredo falso
   (`--set-env-vars` e `--set-secrets ...=forgelex-hml-invalid-provider-key:latest`). Não alterar nenhuma outra variável.
3. Conferir `/health` e `/readyz` da revisão nova: `/readyz` deve responder 200 (a chave inválida **não** altera a
   prontidão; isso também é parte do que se prova).

### Etapa 3 — Política de alerta temporária

```powershell
./ops/gcp/production/provision-provider-alert.ps1 -ApiService forgelex-api-hml-isolated `
  -DisplayName 'ENSAIO E3 - chave do provedor (hml-isolated)' -DryRun
```

Ler o filtro (deve citar `service_name="forgelex-api-hml-isolated"`) e só então rodar sem `-DryRun`. O script usa o mesmo
canal de e-mail dos alertas de produção; o e-mail virá com o texto da política de produção (documentação fixa no script), então
identifique-o pelo nome "ENSAIO E3".

### Etapa 4 — Disparo e prova do log (T0)

Registrar **T0** e chamar `/readyz` da URL do serviço isolado uma vez (a primeira consulta ignora o cache):

```powershell
$URL = gcloud run services describe $S --project=$P --region=$R --format='value(status.url)'
Get-Date -AsUTC -Format o; curl.exe -s -o NUL -w "%{http_code}`n" "$URL/readyz"
```

Em até ~1 minuto:

```powershell
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$S AND jsonPayload.message=provider.key_invalid" `
  --project=$P --freshness=15m --limit=5 --format='json(timestamp,jsonPayload.message,jsonPayload.provider,jsonPayload.httpStatus)'
```

Esperado: registro `provider.key_invalid`, `provider=openai`, `httpStatus=401`, **sem a chave no payload**. Conferir que o
`/readyz` seguiu 200 e que não apareceu `provider.key_unverifiable` (que seria 403, sem alerta).
Anotar **T1** (horário do log).

### Etapa 5 — Prova do e-mail (T2)

Conferir a caixa do canal de alertas e o incidente em Monitoring > Alerting. Anotar **T2** (recebimento) e o conteúdo:
título da política, serviço, ausência de chave e de conteúdo jurídico. Esperado: um e-mail, e não mais de um por hora
(`notificationRateLimit` de 3600 s) mesmo com novos 401 a cada 10 minutos.

### Etapa 6 — Prova do disparo periódico (só no escopo B)

1. Criar um Uptime Check temporário em `$URL/readyz` a cada 300 s (nome `ENSAIO E3 - uptime hml-isolated`).
2. Esperar passar a janela do cache (10 min) sem fazer nenhuma chamada manual e confirmar novo `provider.key_invalid`
   com horário de uma chamada do Uptime (user agent de Uptime Check no log de requisição).
3. Medir o intervalo entre registros consecutivos de `provider.key_invalid` e a latência T1→T2.
   Critério: com a chave já inválida desde o início, primeiro alerta em ≤ 15 min; registrar também o pior caso teórico
   (chave que fica inválida logo após uma consulta boa).

Se o Uptime Check não alcançar o serviço isolado (acesso privado ou IAM), registrar o motivo e encerrar em escopo A, sem
afirmar o critério dos 15 minutos.

### Etapa 7 — Desmontagem (obrigatória, mesmo se o ensaio falhar)

1. Apagar o Uptime Check e a política `ENSAIO E3 - ...`.
2. Devolver 100% do tráfego do `forgelex-api-hml-isolated` à revisão anotada na Etapa 0 e confirmar `/readyz`.
3. Desabilitar/apagar o segredo `forgelex-hml-invalid-provider-key`.
4. Parar o banco: `--activation-policy=NEVER`; conferir `STOPPED`.
5. Conferir que a política de produção e o Uptime Check de produção não foram tocados (comparar com a Etapa 0).

## 4. Critérios de aprovação

- [ ] `provider.key_invalid` gravado com `httpStatus=401`, sem a chave.
- [ ] `/readyz` continuou 200 com chave inválida.
- [ ] E-mail recebido, com limite de um por hora.
- [ ] (Escopo B) alerta em ≤ 15 min sem chamada manual; tempos T0, T1, T2 anotados.
- [ ] Desmontagem concluída e conferida; banco isolado parado.
- [ ] Nenhum serviço de produção ou compartilhado alterado.

## 5. Registro do resultado (preencher na execução)

| Campo | Valor |
| --- | --- |
| Data e executor | |
| Revisão antes / durante / depois | |
| T0, T1, T2 (UTC) e latência | |
| Escopo executado (A ou B) | |
| Desvios e achados | |
| Decisão de Boni sobre o aceite de E3 | |

Ao fechar: marcar o item de E3 no plano, atualizar a linha "Ainda não ensaiado" em `ops/gcp/production/README.md` e a
pendência 3 da seção 1A. Se o pior caso estourar 15 minutos, a decisão (reduzir o `ttlMs` de 10 min, por exemplo) é de
Boni e vira alteração de código própria.

## 6. Limites deste roteiro

Não verifiquei, por falta de acesso ao projeto: a revisão e a imagem atuais do `forgelex-api-hml-isolated`, se a URL dele
é alcançável pelo Uptime Check, o formato exato do e-mail do alerta e as permissões da conta de serviço sobre o segredo
novo. Os comandos `gcloud` das Etapas 0 a 7 não foram executados; a Etapa 0 existe para confirmar essas premissas antes de
qualquer alteração.

## 7. Resultado (27/11/2026)

Só a Etapa 0 foi feita, em leitura, com `gcloud`:

- `forgelex-api-hml-isolated`: revisão `forgelex-api-hml-isolated-m2fix-idle-9888d4e6` com 100% do tráfego, imagem de
  `5793964` (12/11, já com o `ProviderKeyMonitor`), `FORGELEX_COMMERCIAL_EXECUTION_ENABLED=false`. O ingress é
  `internal-and-cloud-load-balancing`: o `/readyz` chamado de fora responde 404, então nem o disparo manual (escopo A) nem
  um Uptime Check (escopo B) alcançam o serviço sem abrir o ingress.
- `forgelex-hml-isolated-pg`: estava `RUNNABLE`/`ALWAYS`, e não parado como o roteiro supunha. A última alteração da instância
  é de 18/11/2026. Foi parada em 27/11 (`STOPPED`/`NEVER`), com autorização de Boni.
- Canal `ForgeLex STJ ingestion alerts` ativo; política de produção “falha de autenticacao do provedor comercial” ativa;
  único Uptime Check em `nexojuris.ia.br/readyz`, a cada 300 s. Nada disso foi alterado.

**Decisão de Boni (27/11/2026, regra do mínimo):** o ensaio foi encerrado como desnecessário. As Etapas 1 a 7 não foram executadas.
