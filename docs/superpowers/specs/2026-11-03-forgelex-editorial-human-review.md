# Revisão humana editorial na mesa

Boni autorizou implementar revisão na mesa, com decisões salvas no histórico do
caso. Preservar mesa, fluxo v8 e limites; sem chamadas pagas, aplicação automática,
commit, push ou deploy. Migração aditiva validada só em bancos descartáveis.

Adicionar à entrega de minuta concluída a ação Revisar proposta editorial, em
diálogo no padrão da mesa. Abrir carrega histórico autorizado, sem gerar IA.
Carregar arquivo JSON de proposta (ou envelope SIMULATED já produzido pelo gerador)
passa pelo validador do servidor. Arquivo não constitui prova de origem em IA.
Não habilitar factory produtiva nem oferecer geração paga nesta etapa.

Mostrar antes/depois editorial, seção, justificativa, fontes, ressalvas,
requisitos pendentes e sugestões substantivas separadas sem patch. Nada começa
selecionado. Decisões individuais CONCORDAR, REJEITAR ou ADIAR exigem fundamento e
clique explícito para salvar. Concordar não aprova juridicamente nem muda texto.

Salvar proposta, identidade/hash do contexto, item, ação, fundamento, autor e
data em histórico próprio da entrega. Ler novamente após recarga. Revisões de
decisão preservam eventos anteriores. Uma revisão otimista por entrega e UUID de
comando garantem conflito entre abas e retry idempotente após resposta perdida.
Reautorizar e validar minuta, fontes e contexto na mesma transação da escrita.
Decisão não libera tarefa, não altera orçamento, não gera versão de minuta.
Histórico continua consultável depois de nova versão/contexto, mediante a mesma
política de leitura histórica autorizada. Snapshot obsoleto retorna somente
histórico e stale=true; não habilita novas decisões. Após resposta perdida e
retry conflitante, consulta por commandId reconcilia registro/ausência observada.

Limites adicionais de armazenamento: até 10 propostas e 100 comandos por entrega,
uma decisão por comando e 1.000 caracteres de fundamento. Propostas mantêm teto
de 2.048 bytes UTF-8 do gerador. Sem truncar ou substituir histórico ao atingir teto.

Escopos de leitura existentes; salvar exige também matter:write e sessão humana.
Mesmo isolamento por proprietário/runtime. Falha/obsolescência bloqueia salvar até
recarregar; resultado incerto permite repetir apenas o mesmo comando. Troca de
entrega/desmontagem descarta respostas tardias; texto nunca renderizado como HTML.

Persistência usa coluna editorial_review_json separada de payload/evidence review,
com operação sob os locks já usados pelo snapshot. Não mudar grafo/catalogo.
Validação: API real com SQLite descartável; navegador local com fixture de minuta
e propostas sintéticas, recarga, erro/conflito, mobile/teclado/Axe e ausência de
escrita na minuta. Não equivale a avaliação semântica ou PostgreSQL concorrente.
