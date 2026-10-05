# Conferência de rascunhos

A primeira frente do plano aprovado acrescenta conferência explicável e correções dentro de Rascunhos. As conexões para leitura do caso por ChatGPT/Claude e o retorno da produção ao editor pertencem às próximas frentes.

## Uso

1. Salvar a minuta e selecionar **Conferir rascunho**. Havendo edição, **Salvar e conferir** cria uma versão e confere exatamente a versão retornada. Falha ao salvar mantém os campos e não inicia a conferência.
2. Abrir **Ver ponto** para ler o resultado, a seção, a citação e a fonte disponível. Para um fato, o painel mostra provas e trechos vinculados diretamente ou por intermédio de uma prova.
3. Selecionar prova ou documento/trecho e indicar se apoia, contradiz ou contextualiza o fato. Essa operação preserva a edição e exige nova conferência.
4. Corrigir seção ou vínculo ausente, salvar nova versão e conferir. Referência que não pertence ao caso pode ser removida daquela seção pelo painel; a remoção só entra na minuta persistida após salvar.
5. Encaminhar à aprovação após uma conferência completa, sem bloqueadores e com versão/contexto correspondentes. Alertas permanecem sujeitos à decisão humana.

O histórico fica recolhido, separado por versão e execução. Consultá-lo preserva texto, versão de exportação e seleção de edição. Respostas antigas de outro caso ou de outra consulta histórica são ignoradas. Trocar de caso/rascunho com alterações não salvas permite cancelar o descarte, inclusive na composição inicial.

O painel admite teclado, ESC durante leitura, fechamento explícito e retorno de foco. Enquanto grava um vínculo, aguarda a conclusão da escrita antes de fechar. DOCX permanece acessível para a versão salva, mesmo com pendências.

Quando o vínculo é gravado e a releitura da fonte falha, a tela confirma a gravação e informa a falha de carregamento separadamente. A aprovação exige nova conferência mesmo nesse caso, sem induzir o usuário a repetir uma escrita já concluída.

## O que é conferido

- **Referências cadastradas:** pertencimento ao caso, vínculo com a seção e reconsulta no servidor por tribunal, processo e data de julgamento. O caminho REST usa o acervo jurisprudencial persistido. Não realiza uma consulta nova diretamente ao tribunal a cada execução.
- **Fatos e provas:** pertencimento ao caso, relações registradas de apoio/contradição/contexto e disponibilidade dos trechos envolvidos.
- **Estrutura:** conteúdo das seções e presença de vínculos previstos pelas regras existentes.

“Localizada no acervo” não confirma pertinência jurídica, fidelidade literal de uma transcrição ou atualidade da orientação jurisprudencial. Relação de apoio não demonstra verdade material. A automação não identifica todas as referências no texto livre.

Localização automática e conferência humana têm estados separados. A reconsulta nunca altera o campo humano `verified`. Ausência no acervo não significa inexistência do julgado. Divergência de metadados, tribunal fora da cobertura e falha/timeout têm explicações próprias.

## Execuções e aprovação

A migration aditiva `persistence-0025-draft-review-runs` registra execuções, inclusive aquelas sem achados, iniciadas ou incompletas. Resultados e achados são concluídos na mesma transação; ordem é definida pela abertura, não pelo término. Consultas iguais de uma execução são deduplicadas, com no máximo quatro simultâneas e limite de 15 segundos por referência.

Estados internos: `RUNNING`, `COMPLETE`, `INCOMPLETE`; resumo: `PASSED`, `WARNINGS`, `BLOCKED`, `INCOMPLETE`. Indisponibilidade não vira confirmação nem ausência. Mudança do contexto relevante durante a conferência torna a execução incompleta.

Aprovação exige a tentativa **ALL mais recente** completa, identificador/hash da versão, hash do contexto ainda correspondente e ausência de bloqueadores. Tentativas específicas não substituem ALL. Uma tentativa ALL iniciada/incompleta posterior não herda um resultado antigo. A decisão APPROVED revalida esses requisitos transacionalmente; uma versão histórica válida continua aprovável sem aprovar a corrente. Aprovações já decididas são preservadas.

A persistência serializa aprovação e gravação dos vínculos de suporte pela linha do caso, e abertura/conclusão de conferências pela versão. Pedido pendente duplicado é verificado novamente dentro da transação. Achados legados sem execução continuam armazenados, mas não demonstram conferência vigente nem liberam aprovação.

Decisões simultâneas sobre a mesma solicitação produzem um único vencedor; a outra tentativa recebe erro de solicitação decidida/token utilizado. Conflitos de bloqueio do SQLite admitem até cinco tentativas, com espera limitada. O resultado é recuperado e validado dentro da transação, evitando repetir uma decisão já gravada por falha de leitura posterior.

O detalhe do rascunho fornece `latestReviewRun`, `currentReviewRun` e `reviewContextChanged`; achados vêm de uma única execução completa da versão corrente. A tela destaca uma tentativa recente incompleta e não a apresenta como aprovada.

## API e operação

- POST `/api/v2/matters/:matterId/drafts/:draftId/review`: `matter:read` e `draft:write`; corpo `type` (all/citations/fact_support/adversarial) e `versionId` opcional. Retorno principal preservado, com `run` aditivo e estado INCOMPLETE explícito.
- GET `.../drafts/:draftId/review-runs?versionId=...`: `matter:read`, execuções da versão corrente ou da versão indicada, somente no caso autorizado.
- GET `.../facts/:factId/support`: `matter:read`, fontes e cobertura existentes.
- POST de suporte existente: `matter:write`. OpenAPI descreve `evidenceItemId`, `anchorId` e a relação.

Auditoria registra execução, versão e estado sem texto integral. Somente COMPLETE emite `draft.review.completed`. O expurgo de conta inclui achados e execuções antes das versões/documentos.

Validação local usa SQLite descartável e autenticação/acervo sintéticos. Não utiliza conta de nuvem ou modelo pago. O smoke PostgreSQL foi estendido para executar conferência, reexecução, histórico e aprovação; seu job existente em CI usa PostgreSQL 16 isolado. PostgreSQL não foi executado neste ambiente: Docker está instalado, mas o daemon não está disponível e não havia URL de banco de teste identificada. Esse check deve passar antes da integração.

Branch de trabalho: `codex/conferencia-rascunho`, base `ac4af32ba1368d35a413759cda6747b368979aeb`. Commit local autorizado em 05/10/2026. Push, migration remota e publicação continuam etapas separadas.
