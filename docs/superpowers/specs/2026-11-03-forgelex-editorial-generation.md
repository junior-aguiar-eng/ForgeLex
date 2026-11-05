# Geração local de propostas editoriais

Pedido de Boni: implementar geração com provedor simulado, mantendo mesa, v8 e
limites; sem chamada paga, aplicação automática ou deploy.

Gerador separado, sobre FinalEditorService. Primeiro carrega contexto autorizado,
depois fornece cópia ao provider, com hashes de seção calculados pelo servidor.
Somente editorial.submit é disponibilizada: recebe proposta e valida estrutura,
identidade, referências e âncoras pelo contrato existente. Texto livre/evento de
conclusão não substitui submissão. Ao receber proposta aceita, encerra iteração;
nenhum retry, fallback, ferramenta de pesquisa ou escrita.

A factory é configuração confiável do servidor e fica ausente por padrão.
Provider diferente de id=fake é recusado antes de run. Não importar SDK real,
ler credenciais ou conectar a factory ao bootstrap produtivo. O cliente não
envia provider, instruções, contexto ou proposta no comando de geração.

Perfil versionado separado do catálogo/grafo v8: 1 tentativa/turno, 16 eventos,
5 minutos, prompt até 128.000 bytes; mantém referência ao teto de 2048 tokens.
Na simulação, usa adicionalmente máximo de 2048 bytes UTF-8 no JSON da proposta,
sem truncar. Bytes não são medição real de tokens; a integração paga precisaria
impor seu próprio teto de 2048 tokens e autorização/contabilização. Custo atual 0.

AbortSignal e timeout encerram o pedido mesmo se o provider ignorar cancelamento.
Submissão tardia após encerramento é recusada. Saída inválida, ausente ou erro não
gera proposta parcial. Mensagens do provider não são expostas ao cliente.

Após geração, recarregar contexto autorizado e comparar integralmente ao snapshot
usado. Revogação, versão, fontes, requisitos ou suporte alterados invalidam saída.
Retornar {mode: SIMULATED, profileVersion, proposal}; sem persistência/aplicação,
sem eventos no fluxo v8 ou alteração de orçamento.

POST /api/agentic/deliveries/:id/editorial-proposals/generate recebe somente
{draftId, versionId}. Mesmas fronteiras de sessão, scopes, proprietário e runtime
da etapa anterior. Factory injetada apenas em testes; produção permanece desabilitada.

Validação simulada comprova encadeamento e recusas; não comprova qualidade de
modelo, equivalência jurídica, resistência semântica a prompt injection ou custo real.
