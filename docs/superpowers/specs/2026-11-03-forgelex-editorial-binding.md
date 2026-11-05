# Editor final: vínculo autorizado com minuta versionada

Escopo autorizado por Boni: conectar o contrato editorial à minuta entregue,
preservando mesa, v8 e limites. Sem modelo, aplicação de patches, deploy ou commit.

Abordagem: reutilizar a fronteira nativa de autorização e transações. A entrega
persistida, vinculada ao proprietário e a uma execução COMPLETED, fornece os IDs
reais de minuta/versão e o documento original. Rejeitar versão corrente diversa,
revisão de contexto alterada, texto/título/ordem/hash divergente ou ausência de
entrega. Um checkpoint não substitui a entrega.

Fontes locais são reconstruídas pela seleção nativa atual, incluindo recibos
aprovados e seus vínculos. Texto de NORM/AUTHORITY é recuperado somente da
evidência persistida da execução concluída (versões 1–8), conferindo hash e todos
os metadados contra a entrega. Ausência/divergência falha; nenhuma pesquisa é
feita. A leitura atual revalida acesso e coerência de approvedItem.

Dois endpoints de sessão, research:read e matter:read:
- GET /api/agentic/deliveries/:id/editorial-context?draftId=...&versionId=...
- POST /api/agentic/deliveries/:id/editorial-proposals/validate
  com { draftId, versionId, proposal }; nenhum contexto/fontes vindo do cliente.

O POST recarrega o contexto autorizado a cada chamada e retorna a proposta
validada. Não persiste proposta/aprovação, não altera minuta, versão, entrega,
checkpoint ou suporte. Transações usam os locks já existentes (updates sem
mudança de valor). Futuro uso/aplicação exige nova revalidação; esta leitura não
congela autorização nem certifica equivalência jurídica.

A integração usa persistência nativa, serviço em legal-workflows e rotas API,
respeitando as dependências declaradas entre esses pacotes e legal-agents.
Sem dependências novas ou mudança do grafo v8. Integração
automática ao runtime e UI foram descartadas por excederem o pedido.
