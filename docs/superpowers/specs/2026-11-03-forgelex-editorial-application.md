# Aplicação humana versionada do editor final

Boni autorizou consolidar o trabalho anterior e implementar esta etapa localmente.
Baseline consolidado: cb5c16a71919c776e04b9f9da843b4d913f754f4. Mesa, v8 e limites
financeiros permanecem; sem IA paga, aplicação automática, push ou deploy.

## Comportamento

A revisão mantém Concordar/Rejeitar/Adiar como decisões sem efeito no texto.
Após salvar Concordar, Boni seleciona explicitamente os ajustes editoriais da
mesma proposta, informa fundamento e confirma criar nova versão. Nada vem
selecionado. Sugestões substantivas não são aplicáveis. O servidor recebe IDs,
nunca texto substituto fornecido pelo comando; usa a proposta persistida.

Revalidar autorização, proprietário/runtime, contexto, fontes, versão atual,
hashes, revisão do histórico e última decisão de cada item na transação. Aplicar
intervalos UTF-16 exatos de trás para frente por seção; rejeitar IDs duplicados,
desconhecidos, decisões pendentes/rejeitadas, sobreposições e resultados fora dos
limites do documento. Preservar seções, vínculos, citações e texto não selecionado.

Criar versão HUMAN/DRAFT derivada da original, torná-la atual e guardar recibo
na mesma transação. Não copiar aprovação ou revisão jurídica; citações da nova
versão ficam não verificadas. Original, entrega e histórico de decisões intactos.

Recibo: comando/hash, proposta/hash, itens, revisão/contexto de origem, versões
anterior/nova, número/hash da nova versão, autor, fundamento e data. Um recibo
por entrega: após aplicar, a entrega original fica obsoleta para novos comandos.
Replay exato retorna o recibo autorizado mesmo após mudança de versão; UUID
reutilizado com outro corpo é conflito. Falha entre escrita e recibo reverte tudo.

Resposta perdida mantém comando exato e bloqueia novos envios; consulta histórica
reconcilia o resultado sem criar outro comando. Recarga mostra o recibo e permite
abrir a nova versão no editor existente. Mudanças de acesso continuam bloqueando
consulta; histórico não é uma exceção de autorização.

## Abordagem e limites

Escolha de implementação: extensão opcional do registro editorial v1 existente,
compatível com registros anteriores; nenhuma migração nova. Reutilizar transação
e locks nativos e DraftRepository.insertVersionInTransaction. Uma tabela própria
duplicaria retenção; editar a versão original violaria o requisito de versionamento.
Limites anteriores: 2.048 bytes/proposta, 10 propostas, 100 comandos por entrega
(incluindo a aplicação; 100 decisões já salvas impedem uma aplicação adicional);
seleção de 1 a 30 ajustes, fundamento de 3 a 1.000 caracteres e confirmação true.

Validação local não comprova equivalência jurídica nem concorrência PostgreSQL.
Boni permanece único avaliador humano. Commit autorizado do trabalho anterior
já executado; implementação nova permanece separada para revisão local.
