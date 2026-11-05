# Lacunas impeditivas e entrega com ressalvas

Correção local de 02/11/2026, autorizada por Boni após a calibração real.

O plano anterior usava `material` tanto para indicar relevância quanto para
interromper o pedido. Na revisão D03, o próprio plano dizia que a ausência
de comprovante não impedia corrigir o texto, mas o workflow parava para perguntar.

Novos pedidos distinguem `deliveryImpact: BLOCKING` de `LIMITATION` nos bastidores.
O primeiro mantém a pergunta; o segundo permite executar os especialistas e
entregar com ressalva explícita, fontes e revisão humana obrigatória. Omissão da
classificação conserva a regra anterior para lacunas materiais. Uma indicação
explícita de impedimento prevalece mesmo se o modelo marcar `material: false`.

As instruções separam informação indispensável para cumprir o pedido de falta
de prova que limita uma conclusão. Não se inventam dados, resolvem contradições
por preferência ou escolhem medidas não autorizadas. Não há palavras-chave para
inferir a decisão a partir da justificativa livre do modelo.

As ressalvas são derivadas do plano também na entrega final, mesmo se o
especialista não as repetir. Preservam razão e fontes e mantêm a entrega como
limitada. Contradições exigem duas fontes distintas. A nova ressalva integra os
códigos de limitação financeira: isoladamente, não configura entrega utilizável
para cobrança. Aprovação de fatos/provas, autorização, orçamento e fontes
continuam sujeitos aos controles existentes.

## Compatibilidade e mesa

Novos pedidos usam estado v5 e perfil/política 1.6.0. Checkpoints v1–v4 mantêm
seus próprios contratos e instruções; não são migrados silenciosamente. Os
estados v3/v4 usados no teste de compatibilidade foram capturados com o candidato
congelado anterior à correção, sem rede. Não houve migration de banco.

A mesa não ganhou opções, etapas ou controles. A ressalva aparece em linguagem
normal nos pontos a conferir já existentes. Um teste de renderização verifica
que códigos e classificações internas não aparecem. União de edição/revisão
continua para uma etapa posterior.

## Validação

- **231 testes distintos** de workflow, contratos, aprovação, contexto, pesquisa,
  transporte, cobrança e apresentação aprovados.
- **11 testes** de preparação e orçamento aprovados.
- **Seis simulações pelo SDK** aprovadas: versão inicial v1 e candidato v5,
  incluindo três entregas do candidato com lacunas não impeditivas e ressalvas.
- Build dos módulos e dependências, tipos da API, lint dos arquivos alterados,
  formatação e `git diff --check` aprovados.

O teste de regressão usa o plano registrado na calibração D03 e o conteúdo do
corpus sintético. A classificação e os resultados dos especialistas são fixados
no teste para exercitar o fluxo; isso não comprova que o modelo real escolherá
corretamente a classificação sob as novas instruções. Testes também cobrem
pergunta indispensável, classificação ausente, mistura de ressalva e bloqueio,
contradição sem fontes suficientes e preservação das ressalvas ao retomar.

[Recibo local](evidence/2026-11-02-delivery-gaps-validation.json).
O novo candidato foi congelado para comparação. O manifesto da calibração real
anterior está preservado em [calibration-real/packet.json](evidence/2026-11-02-final-evaluation/calibration-real/packet.json),
e seu ledger permaneceu idêntico: nenhuma nova chamada paga.

Não foram repetidos a suíte integral do repositório, E2E de navegador ou smoke
PostgreSQL. Nenhum código de interface, schema de banco ou migration foi alterado.
Nova calibração real exige rodada identificada e autorização específica; a
campanha paga anterior não deve ser sobrescrita. Sem commit, push ou deploy.
