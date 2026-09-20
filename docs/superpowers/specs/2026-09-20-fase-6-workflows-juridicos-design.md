# Fase 6 — Workflows jurídicos e integração com matters

## Objetivo

Concluir o primeiro workflow jurídico canônico do ForgeLex, `legal-research-memo`, para que seja versionado, auditável e executável sobre os mesmos serviços por REST, MCP e Agent Core opcional. O fluxo não fornece modelo, não chama provider ao vivo como resposta jurídica direta e não introduz cobrança de token, modelo ou workflow.

## Estado de partida

O repositório já contém `VersionedWorkflowRunner`, contratos iniciais de workflow, `LegalResearchMemoWorkflow`, repositórios de matters, authorities e memos, além da rota REST de memo. Essas peças não podem continuar como implementações concorrentes: a rota REST hoje compõe busca e memo diretamente, enquanto o workflow usa um `AgentRuntime` e checkpoints apenas em memória. A Fase 6 consolida-as em uma execução canônica.

## Escopo

O escopo é exclusivamente o workflow `legal-research-memo` e suas adaptações de superfície. O workflow executa, nesta ordem: `intake`, `issues`, `search`, `verify`, `synthesize`, `adversarial-check`, `memo` e `human-review`.

Cada execução recebe `tenantId`, `userId`, `matterId`, query, tribunal e limite. Ela seleciona somente questões que pertençam ao matter do mesmo tenant. A busca usa exclusivamente `research.search_case_law` por meio do Legal Tool Gateway; `get_authority` e `verify_authority` usam o mesmo gateway e contratos. Uma falha ou resultado não concluído do índice encerra a execução sem criar memo.

## Contrato canônico

`WorkflowDefinition` conterá identificador, versão semântica, schemas Zod de entrada e saída, capabilities permitidas, limites de pesquisa, política de aprovação e a lista ordenada de steps. `WorkflowStep` receberá contexto e estado tipado e retornará estado, saída serializável e eventos de tool. `WorkflowContext` conterá a identidade da execução, tenant, usuário, matter, idempotency key e origem da chamada (`REST`, `MCP` ou `AGENT_CORE`).

`WorkflowCheckpoint` registrará execução, versão, tenant, matter, step, estado serializado, status, data e origem. Checkpoints são persistidos e só podem ser lidos pelo tenant da execução. O repositório validará workflow e versão para evitar retomada com definição incompatível.

`WorkflowResult` representará sucesso, falha ou pendência de revisão humana, com `executionId`, definição/versionamento, resultado ou erro estruturado, provenance e referências aos checkpoints. O resultado de sucesso de síntese ainda será `PENDING_HUMAN_REVIEW`; aprovação não é inferida por prompt, provider ou status de busca.

## Proveniência e histórico

O memo persiste um snapshot das authorities selecionadas, incluindo query, court, coverage, provenance e a versão documental/jurisprudencial disponível no índice. Nenhuma atualização posterior da fonte altera o JSON da authority ou o memo já salvo.

Uma revalidação consulta novamente `verify_authority` e cria um registro de verificação posterior vinculado à authority salva e à versão do memo, sem substituir o snapshot histórico. Resultado conflitante é preservado como conflito; não é normalizado em confirmação. Authorities sem provenance válida, resultado de busca incompleto ou verificação ausente quando exigida pela política não chegam à síntese.

## Política de aprovação e efeitos

O workflow não executa efeito externo. A geração do memo sempre produz estado `PENDING_HUMAN_REVIEW`; a transição para `APPROVED` ou `REJECTED` exige decisão explícita e única de usuário autorizado. A decisão, data, revisor e razão ficam persistidas e auditadas.

O prompt, quando a origem for Agent Core ou integração própria, limita-se a orientar a composição sobre dados estruturados. Ele não autoriza tools, não cria authorities, não substitui cálculo determinístico, não remove a revisão humana e não muda provenance.

## Superfícies de execução

REST passa a ser um adaptador fino da execução canônica e continua expondo a rota de memo já documentada. MCP expõe chamadas encadeáveis para iniciar, observar/retomar e revisar a execução; as chamadas usam o mesmo `WorkflowExecutionService`. O Agent Core opcional registra uma tool de workflow que chama o mesmo serviço, sem importar billing de provider e sem tornar o runtime requisito da API ou do MCP.

Todas as superfícies usam a mesma chave de idempotência, os mesmos schemas, capabilities, limites, política de aprovação, erros e auditoria. Repetir a mesma operação devolve a execução ou memo previamente persistido e não cria memo, pesquisa jurídica ou débito adicional.

## Billing e auditoria

O workflow não possui tarifa própria. Somente a capability `research.search_case_law` pode gerar o débito jurídico já declarado; `get_authority`, `verify_authority`, checkpoints, memo e revisão são gratuitos. Nenhum evento de provider, token, modelo, custo técnico ou prompt entra no ledger.

Auditoria registra início, cada checkpoint, falha, criação de memo e revisão, com tenant, matter, execução, versão e origem, sem registrar segredo de provider. A origem é evidência operacional, não critério jurídico nem comercial.

## Persistência e migração

Serão adicionadas tabelas ou colunas incrementais para checkpoints de workflow e histórico de revalidações. A migração preservará `research_memos` e `matter_authorities` existentes. O repositório aplica isolamento por tenant e matter em cada leitura e escrita; chaves de idempotência permanecem únicas no escopo tenant/matter.

## Tratamento de falhas

Falhas de índice retornam erro estruturado, checkpoint `FAILED` e não persistem memo. Falhas de validação de schema, matter/issue de outro tenant, versão de workflow incompatível, retomada inexistente e alteração de estado de revisão já decidida retornam erros de domínio. O workflow não usa fallback para provider ao vivo, authority inventada ou resultado parcial.

## Validação de aceite

- Matter com query STJ gera memo persistido contendo authorities, query, court, coverage, provenance e versão usada.
- REST, MCP e Agent Core opcional produzem o mesmo resultado para a mesma definição, e REST/MCP permanecem disponíveis sem adapter de provider.
- Replay não cria novo memo, nova busca ou novo débito.
- Alteração ou revalidação posterior de fonte preserva o memo histórico e registra resultado novo ou conflitante separadamente.
- Falha do índice, ausência de authority válida, revisão humana e isolamento entre tenants são cobertos por testes.
- `pnpm typecheck`, testes direcionados dos packages e API, `pnpm test`, build web quando afetado e `git diff --check` são executados antes do gate final.

## Fora de escopo

Não inclui novos tribunais comerciais, modelo hospedado pelo ForgeLex, credenciais de modelo, cobrança por token, migration remota, deploy, commit ou push. Draft Studio, interface adicional e operação PostgreSQL ampla permanecem sob as fases posteriores, salvo o ajuste estritamente necessário para a execução canônica da Fase 6.
