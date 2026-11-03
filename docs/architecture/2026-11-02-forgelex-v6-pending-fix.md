# Correção local das três pendências da calibração v6

02/11/2026, checkout `C:/Users/Boni Jr/.codex/worktrees/forgelex-3-audit/SDK`,
branch `codex/forgelex-3-quality`, HEAD `025f6dd438ecfd78079b4688fd076e476da74ce9`.
Boni autorizou a correção local. Nenhuma chamada paga, operação remota ou
mudança de limite integra esta entrega.

## Mudanças

**Contexto e reserva de D01.** As fontes completas já estão em
`untrustedContext.sources`. Novos pedidos não oferecem `task.get_sources`
quando o papel não dispõe de pesquisa que possa acrescentar fontes. Quando
há pesquisa autorizada, a ferramenta permanece disponível para recuperar os IDs
e metadados das fontes novas. O contexto selecionado, textos, hashes e controles
de acesso permanecem completos; não houve truncamento, resumo de fonte ou remoção
de ressalvas. O cálculo conservador de reserva não foi alterado.

Uma reprodução com o SDK instalado, o checkpoint real D01 e transporte SSE falso
fixou o consumo anterior ao verificador em US$ 0,085506. O caminho v6 reservou
US$ 0,147844 para reler fontes; após o consumo programado dessa chamada, a próxima
reserva de US$ 0,155348 excedeu o saldo por execução. O novo caminho submeteu
diretamente a saída, com reserva de US$ 0,141532: consumo anterior mais reserva
igual a US$ 0,227038, dentro dos mesmos US$ 0,25. É reprodução local de uma etapa,
não previsão de consumo ou garantia para toda tarefa real.

**Identidade de afirmações em D04.** O servidor atribui um namespace estável por
papel e tentativa aos IDs locais de claims, requisitos e findings. Dois
especialistas podem usar `c1` para proposições distintas sem mesclá-las ou
interromper o trabalho por colisão incidental. As referências de linhas,
cronologia e contradições acompanham o ID canônico; fontes e proposições não
mudam. Reutilização explícita de uma claim canônica exige conteúdo idêntico.
Duplicatas conflitantes na mesma saída e modificação de uma claim existente
continuam rejeitadas antes da aceitação da entrega.

O teste usa um ID e uma proposição da análise D04 preservada e injeta outra
proposição com o mesmo ID para reproduzir a classe da falha. A saída rejeitada
original do consultor não foi persistida; não se afirma reconstrução do par exato.

**Checks de suporte em D03.** Apenas o verificador emite `supportChecks`. Seu
contexto lista pares elegíveis de claim/fonte normativa ou jurisprudencial;
o schema restringe os IDs e o runtime rejeita pares indevidos e duplicatas.
IDs de requisitos não viram IDs de claims. Na saída real D03, `r3` e `ar-r3`
eram requisitos e não existem pares normativos elegíveis entre as claims
registradas. Nesse caso, a lista correta de checks é vazia e eventuais
limitações dos requisitos continuam em findings. Suporte ausente/parcial e
trecho incompatível continuam gerando ressalvas, sem aprovação jurídica automática.
Os checks documentais dos demais especialistas também deixam de ser solicitados;
eles não eram a entrada do auditor jurídico terminal.

## Compatibilidade e limites

Novos pedidos usam estado **v7**, política/perfil **1.8.0** e novo hash de
contrato. Checkpoints v1–v6 conservam contratos e perfis anteriores. A retomada
do checkpoint real D01 v6 mantém a ferramenta de leitura e a opção de término
após submissão, sem migrar silenciosamente para o comportamento novo.

Mesa, políticas financeiras, modelo, 2048 tokens, US$ 0,25 por execução,
24 chamadas, cinco minutos e controles de pesquisa/autorização foram preservados.
Os artefatos das campanhas pagas e os três ledgers permanecem intactos.
O total histórico calculado segue US$ 0,850588; custo novo desta correção: zero.

## Verificação

- Três regressões falharam antes da implementação: leitura redundante, colisão
  entre produtores e aceitação de checks fora do contrato. Passaram após a correção.
- 313 cenários de regressão validados em 25 arquivos. A execução ampla teve
  312 aprovados e uma falha em fixture com ID antigo; a fixture foi adaptada
  ao ID canônico e os quatro testes desse arquivo passaram na repetição dirigida.
  As asserções de cobrança única, entrega e ausência de reexecução foram mantidas.
- O benchmark de suporte conserva 60 cenários: os 25 com vínculos inválidos ou
  duplicados agora exigem rejeição explícita sem entrega; os demais continuam
  verificando suporte, ressalvas e limites jurídicos. As fixtures do verificador
  usam os IDs efetivamente recebidos dos produtores.
- 15 testes do preparador, campanha e orçamento aprovados; seis simulações
  SDK da campanha `2026-11-02-scoped-handoff-v7-validated` concluídas sem chamadas pagas.
- Build dos 11 pacotes selecionados/dependências, typecheck da API, lint dos
  TypeScript alterados e `git diff --check` aprovados. A fixture do harness é
  excluída pelo lint existente e foi exercitada pelas seis simulações.

Snapshot: `519f1bda815967a1cfa40766d7bd01949b325065f6515b101a9710c9bee0662a`.
[Recibo, hashes e comandos](evidence/2026-11-02-scoped-handoff-v7/validation.json).
[Reprodução da reserva](evidence/2026-11-02-scoped-handoff-v7/budget-replay.json).

Não foram executados E2E de navegador, PostgreSQL ou nova calibração paga nesta
correção. Respostas simuladas não demonstram qualidade jurídica nem obediência
do modelo real ao novo contrato. Permanece medição real mediante decisão específica
e avaliação por Boni. Sem commit, push, migration, deploy ou execução dos 54
cenários restantes.
