# Reutilização do contexto aprovado — registro de trabalho

A direção vigente está em
[design](../../superpowers/specs/2026-11-01-forgelex-3-approved-case-context-design.md).

A proposta de catálogo e seleção explícita por item em cada pedido foi retirada
por contrariar a experiência definida por Boni. Não implementar essa interface.
Preservar a mesa do Claude Code e suas opções objetivas; engenharia nos bastidores.

Pendente: captura automática do contexto aprovado por caso, revalidação durante
a execução, uso na elaboração/revisão e vínculos de fatos/provas nas seções.
Validar isolamento, alterações concorrentes, retomadas, compatibilidade histórica,
limites de contexto, cobrança e uso apenas de trechos autorizados. Ensaios locais
sintéticos não homologam qualidade jurídica nem aprovam conteúdo real.

## Execução local — 02/11/2026

Ruling: usar referências internas opcionais no contexto, capturadas pelo servidor
em novos pedidos. O corpo público rejeita o campo. Nenhum seletor ou endpoint de
catálogo foi adicionado. Captura limitada a 50 itens e 128 KB sem truncamento
silencioso; excesso impede execução. Itens manuais sem recibo não são presumidos
aprovados. A captura contempla o caso vinculado, inclusive pedido com ação inferida.

- Implementado: recuperação de recibos aprovados, validação dos registros/vínculos/
  documentos e fontes CASE_FACT/CASE_EVIDENCE com trechos e textos revisados.
- Implementado: captura em novos pedidos, referências congeladas nas retomadas,
  validação durante execução e vínculos de fatos/provas nas seções de minuta.
- Implementado: estado v4/perfil 1.5 somente quando há fontes aprovadas; contratos
  e checkpoints v1/v2/v3 preservados. Redator e revisor recebem as mesmas fontes.
- Implementado: apresentação dessas fontes somente quando o usuário as consulta;
  consentimento comercial menciona também os fatos/provas aprovados do caso.
- Revisão fresca encontrou reclassificação de fonte e acesso histórico rígido.
  Testes reproduziram ambos. Corrigidos: comparação pelo packet confiável e
  leitura histórica das versões originais, sem exigir fatos atuais iguais.
- Revisão também reproduziu candidato inválido preso em QUEUED. Corrigida a
  classificação em claimNext: contexto alterado encerra o pedido, chama o
  fechamento financeiro e libera o próximo candidato. Teste RED→GREEN confirma.
- Build integral, tipos e lint aprovados; E2E ampliado (3 cenários) e PostgreSQL
  local (11 verificações) aprovados. Regressão integral: 1.569 aprovados e 17
  pulados; PostgreSQL adicional: 41 aprovados, cobrindo os 16 cenários condicionais.
  O teste com provedor real pago permaneceu pulado. Revisão final sem novos achados.

RED observado: módulo inexistente, captura ausente, entrada pública indevidamente
aceita e estado v2 em vez de v4. GREEN inicial: 11 testes backend; 42 testes de
workflow (novos + regressão); após revisão, 14 testes backend/apresentação.
Sem commit/push/publicação/chamada paga. Aprovação jurídica real não foi realizada.
