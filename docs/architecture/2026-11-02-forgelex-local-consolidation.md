# Consolidação local do ForgeLex 3.0

Boni autorizou executar a sequência recomendada: revisar e organizar o trabalho,
corrigir o teste residual, validar e criar commits locais, retomando o próximo
incremento pela delimitação do editor final. Checkout `forgelex-3-audit/SDK`,
branch `codex/forgelex-3-quality`, base `025f6dd438ecfd78079b4688fd076e476da74ce9`.

## Organização

- `4c5522e`: finalização explícita de papéis no SDK e diagnósticos enumerados.
- `94b658d`: fluxo nativo, grafo, análise de provas, aprovação/reaprovação, contexto
  aprovado e mesa; handoffs limitados e verificação terminal v8. Testes e dez
  fixtures históricas necessárias acompanham o código para evitar dependência
  de arquivos não versionados.
- `d4dd210`: executor de calibração, corpus, recibos, resultados e documentação.
- [Contrato proposto do editor final](../superpowers/specs/2026-11-02-forgelex-final-editor-contract.md):
  registrado separadamente; delimita o próximo incremento local sem ativar o papel.

As mudanças acumuladas em domínio, persistência, workflow, API e mesa dependem
umas das outras e foram mantidas juntas. Não foi reconstruída uma sequência
artificial de versões intermediárias a partir do estado final.

## Teste residual corrigido

O teste de piloto esperava duas chamadas apesar do encerramento em `task.submit`.
A falha foi reproduzida antes da alteração. A expectativa agora exige uma chamada,
pergunta persistida, consumo sintético e saldo coerentes: 56 centavos liquidados
incluindo o histórico da fixture e 440 disponíveis após cancelamento. Não houve
mudança de política, tarifa, saldo persistente ou controle de orçamento.

## Verificação executada

- `pnpm test`: build completo aprovado; **1.621 testes aprovados, zero falhas,
  17 ignorados**; 231 arquivos aprovados e três condicionais ignorados.
- Suíte focada em piloto, núcleo e SDK: 51 aprovados.
- Testes Node de orçamento, campanha e preparação: 15 aprovados.
- Tipos da API, lint e formatação do teste alterado aprovados.
- Diff e dependências de fixtures conferidos. A única indicação de fixture
  ausente na busca estática era o caminho de saída opcional do benchmark,
  não uma leitura necessária ao teste.

Os condicionais PostgreSQL e a integração paga não foram habilitados. Os testes
foram executados com credenciais reais vazias e aprovação paga desabilitada;
as variáveis de bancos opcionais foram removidas do processo para usar fixtures
em memória. Nenhum arquivo de ambiente foi editado. E2E e smokes PostgreSQL não
foram repetidos nesta consolidação; as evidências anteriores continuam históricas.

[Recibo](evidence/2026-11-02-local-consolidation/validation.json),
[suíte completa](evidence/2026-11-02-local-consolidation/full-suite.log),
[suíte focada](evidence/2026-11-02-local-consolidation/focused-tests.log),
[executor](evidence/2026-11-02-local-consolidation/runner-tests.log).

## Integridade e limites

As evidências de novembro receberam atributos Git que desabilitam conversão de
quebras de linha; logs brutos conservam também seu whitespace. Os blobs staged
são comparados byte a byte aos arquivos locais. Não foram renormalizados os
recibos de outubro nem alterados os hashes históricos para aparentar validação.
Os logs antigos de falha permanecem como evidência anterior, não pendência atual.

Nenhuma chamada paga, push, merge, migration remota ou deploy. Mesa e limites
financeiros não foram alterados nesta consolidação. A migration 0037 já presente
no trabalho local foi versionada, mas não aplicada remotamente.

A correção v8 segue validada por replay local, sem medição do modelo real.
D01/D03 da rodada paga aguardam avaliação de Boni; D04 real não tem entrega final.
O editor final ainda não está implementado/ativado; o próximo passo é seu contrato
local e fixtures, conforme delimitação separada. Os outros 54 cenários não foram
executados e a autorização paga anterior permanece encerrada.
