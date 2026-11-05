# Calibração — leitura A/B

Saídas ainda não avaliadas por Boni. A chave das versões fica no pacote de execução.

## D01-analyze

### A

Pedido: Analise o caso, as questões, o alcance das provas e o que falta esclarecer. Use apenas o corpus fechado selecionado. Documentos e fatos são fictícios; a ausência de fontes deve ser explicitada.

Sem entrega. Conferir a pergunta ou a interrupção registrada antes de atribuir nota.

{"id":"case-task:remaining_delivery","version":1,"contextRevision":1,"prompt":"O que se sabe sobre as quatro mesas não abrangidas pelo recibo? Indique datas e documentos, se existentes, ou informe que desconhece.","selection":"free_text","options":[],"allowFreeText":true,"allowUnknown":true,"reason":"A ausência de registro no recibo não resolve se houve cumprimento posterior ou inadimplemento. Na falta de resposta, limitar a conclusão às seis mesas documentadas."}

### B

Pedido: Analise o caso, as questões, o alcance das provas e o que falta esclarecer. Use apenas o corpus fechado selecionado. Documentos e fatos são fictícios; a ausência de fontes deve ser explicitada.

Sem entrega. Conferir a pergunta ou a interrupção registrada antes de atribuir nota.

{"id":"case-task:destino-quatro-mesas","version":1,"contextRevision":1,"prompt":"Há informação ou documento sobre a entrega das quatro mesas não registradas no recibo, inclusive eventual data? É possível responder livremente ou indicar que não se sabe.","selection":"free_text","options":[],"allowFreeText":true,"allowUnknown":true,"reason":"O recibo tem alcance limitado a seis mesas e não esclarece o cumprimento do restante; a análise deve permanecer condicionada quanto a isso."}

## D03-review

### A

Pedido: Revise o rascunho fornecido, indicando problemas concretos, fontes e correções necessárias. Use apenas o corpus fechado selecionado. Documentos e fatos são fictícios; a ausência de fontes deve ser explicitada.

Sem entrega. Conferir a pergunta ou a interrupção registrada antes de atribuir nota.

{"id":"case-task:comprovacao-pagamento","version":1,"contextRevision":1,"prompt":"O corpus selecionado não esclarece se houve pagamento. A revisão fica limitada a registrar essa ausência, sem concluir pela quitação ou pelo inadimplemento.","selection":"free_text","options":[],"allowFreeText":true,"allowUnknown":true,"reason":"A informação é essencial para afirmar pagamento integral ou avaliar eventual saldo. Como foi solicitado corpus fechado, não se presume documentação externa nem se condiciona a identificação dos erros à sua apresentação."}

### B

Pedido: Revise o rascunho fornecido, indicando problemas concretos, fontes e correções necessárias. Use apenas o corpus fechado selecionado. Documentos e fatos são fictícios; a ausência de fontes deve ser explicitada.

Sem entrega. Conferir a pergunta ou a interrupção registrada antes de atribuir nota.

{"id":"case-task:prova-pagamento","version":1,"contextRevision":1,"prompt":"Entrega limitada ao corpus: o estado do pagamento permanece não informado, pois não há comprovante de quitação ou outros elementos que permitam estabelecê-lo.","selection":"free_text","options":[],"allowFreeText":true,"allowUnknown":true,"reason":"A ausência de informação impede confirmar pagamento, inadimplemento e encerramento; não impede apontar e corrigir os problemas do rascunho nesta revisão limitada."}

## D04-create

### A

Pedido: Prepare uma minuta de manifestação civil limitada ao material selecionado. Marque lacunas essenciais; não invente dados de qualificação, juízo ou prazo. Use apenas o corpus fechado selecionado. Documentos e fatos são fictícios; a ausência de fontes deve ser explicitada.

Sem entrega. Conferir a pergunta ou a interrupção registrada antes de atribuir nota.

{"id":"case-task:perigo-concreto","version":1,"contextRevision":1,"prompt":"Lacuna a marcar na minuta: quais consequências concretas da demora e respectivos elementos de suporte existem? Não informado no corpus fechado.","selection":"free_text","options":[],"allowFreeText":true,"allowUnknown":true,"reason":"A solicitação de entrega imediata não demonstra por si só perigo de dano ou risco ao resultado útil; faltam documentos sobre paralisação ou risco concreto."}

### B

Pedido: Prepare uma minuta de manifestação civil limitada ao material selecionado. Marque lacunas essenciais; não invente dados de qualificação, juízo ou prazo. Use apenas o corpus fechado selecionado. Documentos e fatos são fictícios; a ausência de fontes deve ser explicitada.

Sem entrega. Conferir a pergunta ou a interrupção registrada antes de atribuir nota.

{"id":"case-task:risco-concreto","version":1,"contextRevision":1,"prompt":"Marcar na minuta: não foram fornecidos fatos concretos ou documentos sobre consequências da demora, paralisação ou risco ao resultado útil do processo.","selection":"free_text","options":[],"allowFreeText":true,"allowUnknown":true,"reason":"Entrega limitada solicitada; a ausência impede afirmar suporte fático ao requisito de perigo do art. 300 e não prova inexistência de risco."}
