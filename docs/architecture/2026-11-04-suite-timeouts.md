# Timeouts de integração — 04/11/2026

Os dois arquivos de integração passam a ter limite explícito de 15 segundos por teste. O limite geral permanece em 5 segundos; nenhum deadline do produto ou limite financeiro foi alterado. Mantidos dois workers, todas as asserções, os dados isolados e a ausência de retries.

## Investigação

Na execução anterior da suíte completa, dois casos excederam 5.000 ms:

- `commercial-runtime.test.ts`: `charges only concrete persisted review_text results (document=false, claims=refusal)`.
- `final-editor-routes.test.ts`: `aplicação humana exige seleção única, confirmação, revisão e proposta persistida`.

Os 93 testes dos dois arquivos passaram juntos antes da alteração. A instrumentação temporária dos dois casos mediu aproximadamente 759 ms de fixture em 963 ms totais no comercial (79%) e 1.532 ms em 1.693 ms no editorial (90%). Cada caso cria banco isolado, aplica migrações e executa fluxos completos; esse preparo está incluído no limite por teste. Não foi encontrada falha funcional reproduzível ou espera artificial nesses dois caminhos. A origem exata da variação de carga da máquina não foi isolada.

O limite de 15 segundos oferece margem superior a duas vezes os cerca de 6–7 segundos observados nos casos que estouraram o limite anterior, sem remover uma proteção finita contra travamento. Foi aplicado aos dois arquivos que compartilham essas fixtures. A configuração do Vitest instalado restaura as opções ao terminar cada arquivo; portanto, o ajuste não se propaga ao restante da suíte. Hooks e deadlines funcionais permanecem como antes.

## Escopo e preservação

A instrumentação foi removida. A alteração desta tarefa acrescenta cinco linhas a cada arquivo de teste, preservando as mudanças preexistentes. Não há mudança no código de produção, nas campanhas, nas entregas, nos ledgers ou em arquivos de ambiente. A execução da suíte usa transportes simulados; as variáveis OPENAI_API_KEY e ANTHROPIC_API_KEY foram retiradas apenas do ambiente do processo filho.

[Diagnóstico e medições](evidence/2026-11-04-suite-timeouts/diagnosis.json) · [Alterações delimitadas](evidence/2026-11-04-suite-timeouts/changes.json) · [Validação](evidence/2026-11-04-suite-timeouts/validation.json)

Sem chamadas pagas, commit, push ou publicação.

## Resultado da validação

`pnpm test` concluiu com build aprovado e 1.772 testes aprovados, 17 ignorados, nenhuma falha (241 arquivos aprovados e três ignorados). Duração dos testes: 460,66 segundos. Os dois casos antes sujeitos a timeout passaram dentro da suíte completa; nenhum retry foi adicionado. Lint dos dois arquivos e formatação aprovados.

Os 464 arquivos de evidência anteriores e os 815 arquivos do snapshot da campanha foram conferidos por SHA-256 e permanecem intactos. Os gastos da v9 e a reserva histórica não foram alterados. Uma execução completa aprovada demonstra esta validação; não elimina a possibilidade de variação de duração em máquinas com outras condições de carga.
