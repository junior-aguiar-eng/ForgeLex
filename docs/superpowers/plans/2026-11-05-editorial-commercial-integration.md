# Integração comercial editorial — plano de implementação

**Objetivo:** conectar revisão editorial à política BRL aprovada, com recuperação durável e sem ativar produção.
**Arquitetura:** reutilizar ExecutionService/ExecutionWorker e CommercialInferenceService, autorização editorial distinta e checkpoint inicial com destino/hash. Reaproveitar as tabelas existentes; não alterar o grafo v8.
**Stack:** TypeScript, Fastify, React, Drizzle, Vitest e pnpm existentes.
**Spec:** docs/architecture/2026-11-05-editorial-commercial-integration.md.

Decisão de Boni em 05/11: cobrar a revisão concluída mesmo sem alterações. Proposta validada e persistida é entrega utilizável; falhas sem proposta não são cobradas. Piso e limites permanecem os aprovados.

- [x] Testar runtime editorial com banco descartável e transporte simulado: reserva, revisão vazia cobrável, replay, conflito, erro e isolamento.
- [x] Implementar composição editorial com comando independente, checkpoint, worker e liquidação recuperável. Reutilizar autorização e limites comerciais existentes.
- [x] Conectar rotas de disponibilidade, início, leitura e cancelamento, mantendo sessão/escopos e destino autorizado.
- [x] Adaptar painel para confirmação BRL, acompanhamento e recibo recuperável; preservar simulação e revisão/aplicação explícitas.
- [x] Executar regressões pertinentes, tipos, lint e build; registrar resultados e limites.

Sem chamadas pagas, commit, push, migration operacional ou deploy. Tratar cancelamento, custo incerto, perda de resposta, versão alterada e concorrência como testes de recuperação, não como autorização para repetir inferência.

## Revisão durante a execução

A revisão técnica identificou e a implementação corrigiu: recuperação do recibo após mudança da versão corrente; descoberta pelo servidor sem sessionStorage; nova tentativa explícita após falha/cancelamento; preservação da chave de pedido ainda não localizado quando existe revisão antiga. Os casos receberam regressões de runtime/API/navegador. Boni continua sendo o único aprovador humano.

Ruling: reutilizar checkpoint e jobs existentes, com autorização editorial própria e vínculo ao caso, evita nova tabela/migration e conserva os mecanismos de cancelamento, recuperação e retenção. A consulta do último comando pagina o histórico do proprietário; desempenho em históricos muito grandes permanece não medido.
