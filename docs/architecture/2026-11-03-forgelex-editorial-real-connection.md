# Conexão local do editor final

Continuação autorizada por Boni em seis etapas. A aplicação humana anterior foi
consolidada em `adc823b518934e8b1bbdb0aaef8fb27ccd599698`. O código desta etapa
permanece no working tree `codex/forgelex-3-quality`, checkout `forgelex-3-audit/SDK`.

## Geração e autorização

`createFinalEditorOpenAIRuntime` conecta o gerador ao SDK OpenAI existente com
`gpt-6.1-sol`, esforço low, serviço default, saída até 2048 tokens, sem pesquisa,
fallback, tracing ou repetição automática. A única ferramenta é `editorial.submit`.
Conservam-se uma proposta, 2048 bytes, um turno, 16 eventos e cinco minutos.
O transporte tem timeout por chamada de 30 segundos e limite de requisição de
64 KB; não aumenta o limite anterior para acomodar o editor.

O comando financeiro é separado da execução v8 concluída. Sua identidade de
chamada é estável; a autorização é persistida antes do envio. Recriar o runtime
não repete a chamada. Uso retornado é liquidado mesmo quando a proposta falha
depois; resposta perdida deixa exposição incerta, nunca custo zero presumido.
Antes de cada envio e antes de retornar a proposta, acesso e contexto são
revalidados. O gerador encaminha execuções do SDK por seu contador de submissões.

A API exige sessão, leitura e escrita no caso e confirmação explícita para
geração real. O diálogo pode consultar disponibilidade e pedir geração quando
o host configura a factory autorizada. Confirmação de custo, decisão editorial
e criação de versão continuam sendo ações separadas. Resposta perdida não gera
repetição automática. O bootstrap remoto permanece sem ativação do editor.

## Comando local utilizável

`scripts/generate-editorial-proposal.mjs` é o host local concreto. Usa somente
arquivo SQLite explicitamente escolhido e existente, conta/tenant/vínculo ativos
e a mesma leitura autorizada da minuta. Não cria contas nem aplica migrations.
Mantém ledger próprio em `.superpowers/sdd/editorial-generation/<commandId>`;
não usa carteira comercial, saldo histórico do piloto ou orçamento da calibração.

Depois do build, o arquivo de comando deve conter `commandId` UUID,
`databaseFile` absoluto, `owner` com `tenantId`/`userId`, `deliveryId`, `draftId`
e `versionId`. A preparação local calcula o hash do contexto e grava outro
arquivo, sem sobrescrever o comando original:

```powershell
node scripts/generate-editorial-proposal.mjs --command=COMANDO.json --prepare
node scripts/generate-editorial-proposal.mjs --command=COMANDO.json.prepared.json
```

A segunda linha usa SDK real com HTTP sintético e **zero chamadas pagas**.
Uma futura execução paga exige outro UUID, credencial já configurada no processo
e os dois argumentos `--real --approve-editorial-usd=0.25`. Não se pode converter
o ledger de uma simulação em execução paga. Esta sequência não executou geração
editorial paga; a autorização de calibração v8 cobre apenas seus seis lugares.

O host produz `proposal-import.json`, importável no diálogo existente, e
`proposal.json`, recibo com hash, modo, modelo, contexto e orçamento. Um comando
concluído pode recuperar seu recibo sem repetir inferência; comando interrompido,
custo incerto ou recibo ausente exige conferência, sem contornar o bloqueio.
O arquivo importado continua sem autenticação de origem; toda proposta passa
novamente pelo validador e pela revisão humana antes de eventual aplicação.

## Evidência e limites

- 94 testes focados de API, gerador e transporte passaram.
- Cinco testes do host passaram, incluindo invocação do CLI em processo separado,
  banco local descartável com conta ativa, contexto preparado, saída importável,
  minuta intacta e recusa após revogação.
- 11 testes de navegador passaram, incluindo confirmação de custo, perda de
  resposta, histórico, aplicação humana e acessibilidade.
- As duas corridas novas passaram em SQLite e PostgreSQL. Elas verificam
  resultados consistentes sob concorrência, sem afirmar cobertura determinística
  de todos os ordenamentos de locks.

O achado importante da revisão independente — ausência de host financeiro — foi
tratado pelo comando local e seus testes. O host foi acrescentado após essa
revisão; não se atribui ao revisor uma avaliação do código que ele não recebeu.
Qualidade jurídica permanece não avaliada. Ativação de um serviço editorial
comercial para múltiplos comandos/usuários não faz parte desta conexão local.
O [recibo desta etapa](evidence/2026-11-03-editorial-continuation/validation.json)
registra build aprovado, 1.737 testes gerais aprovados, 17 ignorados e zero
falhas; 58 testes PostgreSQL, 22 Node, tipos, lint e formatação aprovados.
A corrida de 100 decisões excedeu o prazo em uma tentativa anterior com setup
redundante de migrations; o ensaio final passou com as mesmas asserções e prazo.
Upgrade 0038 e idempotência foram verificados em ensaio PostgreSQL separado.

A [calibração v8](2026-11-03-forgelex-recalibration-v8-results.md) usou somente
o fluxo v8. Sua falha D04 com custo incerto não é resultado do gerador editorial,
nem transforma os testes locais deste gerador em validação de inferência real.
