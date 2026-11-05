# ForgeLex 3 — fechamento das pendências locais do incremento 1

Data: 01/11/2026. Branch `codex/forgelex-3-quality`, base `025f6dd`.
Complemento à [auditoria inicial](2026-11-01-forgelex-3-audit.md), cujas medidas
permanecem históricas. Desenvolvimento e validação locais; nenhuma publicação,
migration remota, operação financeira real ou inferência paga.

## Decisão e comportamento

Boni pediu a execução das pendências e decidiu expressamente: “Incluir a
pesquisa no teto do trabalho, sem cobrança separada”. A pesquisa STJ realizada
pelo trabalho comercial usa sua reserva única. A pesquisa avulsa mantém seu
fluxo existente; nenhum preço ou saldo real foi modificado.

`app.ts` injeta o serviço existente, configurado com índice persistido obrigatório
e STJ como único tribunal habilitado. O driver comercial disponibiliza busca,
obtenção e verificação de autoridades sem chamar `executeResearchCall` do ledger
de pesquisa avulsa. Cada ferramenta revalida usuário, execução, cancelamento e
reserva antes/depois da leitura; o workflow mantém limites de 12 ferramentas por
etapa e 48 por trabalho. Os limites de inferência, tokens, bytes e duração são
preservados. Não foi acrescentado provedor, dependência ou migration.

O workflow fornece ao provider um `selectedPacket` separado do contexto que
contém autoridades recuperadas. A conferência anterior a cada HTTP compara a
seleção com o banco sem rejeitar evidências recuperadas pelo próprio workflow.
A allowlist comercial admite apenas as três ferramentas STJ adicionais; a do
piloto não foi ampliada. A tela de confirmação informa que a pesquisa STJ está
incluída no limite.

## Fixture SQLite

A falha `EBUSY` foi novamente reproduzida antes da alteração. O teste da
migration 0036 precisava de isolamento, não de persistência entre processos.
Ele agora usa `file::memory:` privado em vez de arquivo temporário, mantendo as
inserções e todas as asserções. Isso evita a dependência acidental da liberação
imediata de handles nativos para remover o arquivo no Windows. Não é uma
correção do driver libSQL nem uma garantia de fechamento imediato de arquivos.
O teste `db-native-lifecycle.test.ts` continua verificando FTS, rollback, GC e
saída de processo usando arquivos reais.

## Verificação

Os novos testes percorrem SDK e transporte SSE sintético, workflow, reserva,
persistência e liquidação. Busca, obtenção e verificação são executadas; a entrega
preserva hash e auditoria de suporte. A cobrança sintética é de R$ 0,50, com
liberação de R$ 4,50 e nenhum evento de cobrança avulsa de pesquisa. Testes
adversos cobrem revogação, cancelamento, outro usuário, reserva encerrada,
alteração da seleção e ferramentas fora da allowlist. Não medem qualidade
jurídica de modelo real.

Resultados finais e hashes constam no
[recibo de validação](evidence/2026-11-01-pending-local-validation.json).

| Verificação | Resultado |
| --- | --- |
| Migration SQLite e ciclo de vida nativo | 4 aprovados |
| Runtime comercial, providers comercial/piloto e pesquisa | 62 aprovados |
| Suíte completa Vitest | 1.460 aprovados, zero falhas, 17 ignorados |
| Rodada PostgreSQL com os casos condicionais habilitados | 41 aprovados, zero ignorados; cobre 16 dos 17 ignorados na suíte completa |
| Smoke financeiro comercial PostgreSQL | 9 checks aprovados, zero chamadas reais |
| Playwright comercial | 1 aprovado em 29,8 s |
| Build, tipos, lint, Prettier focal e `git diff --check` | Aprovados |

Apenas a homologação com provider real permaneceu não executada; não houve
inferência paga. O novo container PostgreSQL descartável foi removido; os
containers existentes não foram alterados. A aprovação automática bloqueou a
remoção do arquivo SQLite temporário da reprodução, com motivo genérico
`blocked by policy`; a limpeza não foi repetida nem contornada e não afeta as
validações acima.

Revisão técnica adicional por IA: nenhum achado acionável nas mudanças deste
complemento; Boni permanece o único avaliador/aprovador humano.

## Limites remanescentes

Integração/publicação e inferência paga não foram executadas. O tratamento de
checkpoints e rollback por versão continua conforme a auditoria inicial.
Grafo adaptativo, vertical probatória e avaliação semântica comparativa são os
próximos incrementos do programa; este complemento não declara sua conclusão.
