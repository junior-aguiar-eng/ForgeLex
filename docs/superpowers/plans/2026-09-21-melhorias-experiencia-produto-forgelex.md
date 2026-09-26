# Plano incremental de melhoria da experiência e do produto ForgeLex

**Estado atualizado em 26/09/2026:** incrementos 0–8 concluídos no escopo técnico local. O encerramento de conta foi publicado e habilitado posteriormente, conforme `docs/operations/account-closure/validation.md`. O novo site público está implementado na branch e aguarda integração, CI no SHA final e release; seu prompt mestre canônico está em `docs/product/frontend-master-prompt.md`. A conexão real com Claude continua fora do escopo revisado; a interface não comprova integração com esse host.

Os incrementos 0–6 têm entregas identificáveis nos commits `2c99857`, `622b886`, `a13261b`, `5bd1100`, `b2fb779`, `a6990ed` e `4f9bdce`. O incremento 7 tem implementação e testes locais documentados em `STATUS_VALIDACAO.md` e `docs/operations/account-closure/validation.md`; a matriz também registra as revisões humanas aprovadas, a implantação e a habilitação posteriores. O incremento 8 tem QA local documentado em `docs/product/mcp-onboarding.md`, com aceite manual declarado pelo usuário em 24/09/2026. Os checklists abaixo preservam o roteiro original, não são uma certificação retroativa de que cada item foi executado literalmente; o escopo efetivamente concluído e os limites estão na seção 15.

> **Registro de execução:** o roteiro abaixo orientou os incrementos locais. Seus checklists originais não são prova individual de execução; o fechamento e os gates remanescentes estão na seção 15. Commit, push, migração, deploy e publicação continuam sendo autorizações separadas.

**Objetivo:** transformar o ForgeLex de uma aplicação tecnicamente clara, porém pouco orientada à ativação, em um produto de autoatendimento no qual um advogado consiga compreender, conectar, testar e acompanhar o MCP sem conhecimento técnico, preservando a arquitetura existente e a profundidade do espaço de trabalho jurídico.

**Arquitetura:** evolução incremental do frontend React existente, reaproveitando `ConnectionsScreen`, os endpoints de API keys, o billing, a autenticação Supabase e o gateway MCP já implementados. O plano evita troca de framework, redesenho geral, alteração do núcleo jurídico ou duplicação da infraestrutura REST/MCP.

**Stack atual:** React 18, TypeScript, Vite, Tailwind CSS, Fastify, Supabase Auth, PostgreSQL, Playwright, Vitest e gateway MCP Streamable HTTP.

**Especificação:** este documento, especialmente as seções “Diagnóstico consolidado”, “Decisões de produto”, “Jornada-alvo” e “Critérios globais de aceite”.

## 1. Diagnóstico consolidado

### 1.1 Qualidades que devem ser preservadas no ForgeLex

- Posicionamento jurídico mais amplo do que um simples buscador: casos, pesquisa, rascunhos, revisão humana e verificação de autoridade formam uma jornada coerente de trabalho.
- Separação conceitual correta entre modelo do host, infraestrutura ForgeLex, tokens de IA e operações jurídicas faturáveis.
- Mensagens honestas sobre demonstração, fonte, cobrança, privacidade e limites da integração.
- Interface visual consistente, sóbria e apropriada ao público jurídico.
- Cobrança específica por capacidade: somente a pesquisa jurisprudencial é faturável; verificação e workflows não devem herdar preço indevidamente.
- Infraestrutura compartilhada entre REST e MCP, evitando dois produtos tecnicamente divergentes.

### 1.2 Lacunas prioritárias do ForgeLex

1. O MCP está escondido em “Modelos e integrações” e não aparece como caminho principal de uso.
2. A tela informa que o MCP está “Ativo”, mas não permite conectar, copiar a URL, gerar credencial, testar ou verificar o estado da conexão.
3. MCP e API REST são apresentados juntos, embora atendam públicos diferentes.
4. A documentação começa por JSON-RPC, `curl` e `tools/list`, inadequados como primeiro contato de um advogado.
5. Não há orientação clara sobre o que perguntar após a ativação.
6. Falta uma confirmação operacional simples: “o conector está funcionando”.
7. O cliente não encontra, em uma única visão, conexão, último uso, chave, saldo, consumo e lançamentos.
8. A navegação interna baseada exclusivamente em estado mantém todas as áreas na mesma URL, prejudicando recarregamento, botão Voltar, favoritos, suporte e compartilhamento de links.
9. Gestão de API keys já existe no backend, mas não aparece como superfície de conta no frontend.
10. Não há página dedicada de segurança/conta comparável à maturidade já existente em autenticação, billing e persistência.

### 1.3 Qualidades úteis observadas na Exordial

- “Conexões” é uma área própria e imediatamente reconhecível.
- Claude e ChatGPT têm jornadas distintas.
- A URL MCP é visível e copiável.
- Há instruções numeradas, restrições de plataforma/plano, vídeo e chamada direta para conexão.
- A documentação para advogados é separada da documentação para desenvolvedores.
- O produto mostra saldo, atividade, extrato, status da chave e último uso.
- A conta oferece ações de segurança e encerramento.

### 1.4 Deficiências da Exordial que não devem ser reproduzidas

- Inconsistência entre valores mínimos de recarga exibidos em superfícies diferentes.
- Ambiguidade entre cobrança “por pesquisa”, “por página” e “por consulta de detalhe”.
- Promessa ampla de ausência de alucinação sem explicitar que a síntese final continua pertencendo ao modelo do host.
- Mistura entre status técnico e comunicação comercial sem uma taxonomia explícita de custos.
- Jornada centrada em pesquisa isolada, sem a profundidade de caso, revisão e rastreabilidade já existente no ForgeLex.

## 2. Decisões de produto

### 2.1 Abordagem escolhida

Adotar uma **camada incremental de ativação e conta** sobre os componentes existentes. Não haverá redesenho geral, novo design system, substituição do `AppContext`, troca de autenticação ou duplicação do gateway MCP.

As mudanças concentram-se em cinco unidades:

1. navegação endereçável;
2. central de conexão MCP orientada ao cliente;
3. teste e status de conexão;
4. conta operacional com chaves e atividade;
5. documentação segmentada por público.

### 2.2 Alternativas rejeitadas

**Refatoração geral do frontend:** elevaria risco, prazo e regressão sem resolver mais rapidamente a ativação do MCP.

**Copiar a estrutura da Exordial:** melhoraria o onboarding, mas reduziria a identidade do ForgeLex a um buscador e importaria inconsistências comerciais já observadas.

**Criar um segundo portal exclusivo para MCP:** duplicaria autenticação, navegação, billing e documentação. A conexão deve permanecer integrada ao espaço de trabalho.

### 2.3 Princípios obrigatórios

- Linguagem do advogado antes da linguagem do protocolo.
- Uma ação principal por tela.
- Nenhum status “Ativo” sem estado verificável ou explicação precisa.
- Nenhuma demonstração apresentada como chamada real.
- Nenhuma afirmação de conexão baseada apenas em configuração local do navegador.
- Preço derivado da mesma fonte de verdade do billing; não duplicar `R$ 0,20` em múltiplos componentes sem contrato compartilhado.
- Privacidade descrita com exatidão: o ForgeLex recebe a chamada autenticada e os argumentos da ferramenta, não o histórico geral do host.
- Credenciais exibidas integralmente somente uma vez, nunca em logs, auditoria, telemetria ou capturas de erro.
- Implementação em incrementos pequenos, mantendo o produto utilizável ao fim de cada etapa.

## 3. Jornada-alvo

### 3.1 Usuário advogado

Os passos de retorno do host, primeira pesquisa dentro dele e confirmação de uso descrevem a jornada-alvo de publicação, não uma conexão com host real demonstrada neste fechamento local.

1. Entra no ForgeLex e vê “Usar no ChatGPT ou Claude”.
2. Escolhe a plataforma.
3. Lê requisitos objetivos: computador, plano compatível e cobrança ForgeLex.
4. Inicia a conexão por OAuth quando o host suportar; caso contrário, recebe URL e instruções manuais.
5. Retorna ao ForgeLex e executa um teste gratuito de disponibilidade, sem pesquisa jurisprudencial faturável.
6. Vê o estado “Conectado” somente após evidência válida.
7. Copia uma pergunta-modelo e realiza a primeira pesquisa no host escolhido.
8. Confere no ForgeLex o último uso e o lançamento correspondente.

### 3.2 Desenvolvedor

1. Acessa “API para desenvolvedores”.
2. Cria uma chave com nome e escopos mínimos.
3. Copia o segredo uma única vez.
4. Usa exemplos REST ou MCP técnicos separados.
5. Confere criação, último uso e revogação da chave.

### 3.3 Estados que a interface deve distinguir

- Não configurado.
- Pronto para conectar.
- Autorização iniciada.
- Conectado e verificado.
- Credencial revogada.
- Credencial expirada.
- Serviço temporariamente indisponível.
- Conta sem saldo para operação faturável.
- Plataforma não suportada ou plano incompatível.

## 4. Estrutura de arquivos prevista

### Arquivos existentes a modificar

- `apps/web/src/App.tsx` — registrar novas telas sem alterar a composição principal da aplicação.
- `apps/web/src/context/AppContext.tsx` — substituir estado de aba isolado por navegação sincronizada com URL, preservando a API de seleção durante a migração.
- `apps/web/src/components/Header.tsx` — manter o trabalho jurídico como navegação primária e expor a conexão por ação contextual quando pertinente.
- `apps/web/src/components/Sidebar.tsx` — renomear “Modelos e integrações” para “Conectar IA” e separar documentação técnica.
- `apps/web/src/screens/LandingScreen.tsx` — acrescentar CTA contextual de ativação sem retirar o início pelo caso/pesquisa.
- `apps/web/src/screens/ConnectionsScreen.tsx` — transformar a tela informativa em central de ativação por plataforma.
- `apps/web/src/screens/ApiDocsScreen.tsx` — restringir o foco a desenvolvedores e remover o MCP de usuário final dessa tela.
- `apps/web/src/screens/CreditsScreen.tsx` — integrar resumo de consumo e links para extrato/conexões, sem refazer o checkout.
- `apps/web/src/api-client.ts` — adicionar clientes tipados apenas para contratos necessários à conta, chaves e estado da conexão.
- `apps/api/src/app.ts` — expor somente endpoints de leitura/teste que ainda não existirem; preservar autenticação, escopos, auditoria e billing atuais.
- `apps/api/src/distribution/openapi.ts` — documentar novos contratos e manter REST/MCP consistentes.
- `apps/api/src/app.test.ts` — cobrir endpoints de conexão, chaves, atividade e segurança.
- `tests/e2e/phase-7.spec.ts` — preservar a regressão existente; não transformar esse teste em suíte genérica de onboarding.

### Arquivos novos recomendados

- `apps/web/src/navigation/routes.ts` — mapeamento único entre rota, `AppTab` e título.
- `apps/web/src/navigation/routes.test.ts` — recarregamento, deep link, rota desconhecida e botão Voltar.
- `apps/web/src/screens/connections/connection-model.ts` — tipos e regras puras dos estados de conexão.
- `apps/web/src/screens/connections/connection-model.test.ts` — matriz de estados e mensagens.
- `apps/web/src/screens/connections/PlatformConnectionCard.tsx` — cartão reutilizável de ChatGPT/Claude.
- `apps/web/src/screens/connections/ConnectionChecklist.tsx` — requisitos e passos por plataforma.
- `apps/web/src/screens/connections/FirstUseExamples.tsx` — perguntas-modelo e aviso de custo.
- `apps/web/src/screens/ApiKeysScreen.tsx` — listar, criar e revogar chaves.
- `apps/web/src/screens/ApiKeysScreen.test.tsx` — segredo de exibição única, escopos e revogação.
- `apps/web/src/screens/AccountActivityScreen.tsx` — consumo, último uso e lançamentos, usando dados existentes.
- `apps/web/src/screens/AccountSecurityScreen.tsx` — senha, sessões e encerramento somente quando os contratos correspondentes existirem.
- `apps/web/src/screens/ForLawyersGuideScreen.tsx` — guia não técnico de ativação e primeiro uso.
- `apps/web/src/screens/ConnectionsScreen.test.tsx` — fluxo por plataforma e estados de erro.
- `tests/e2e/mcp-onboarding.spec.ts` — onboarding sem cobrança e transição para operação faturável simulada.
- `docs/product/mcp-onboarding.md` — contrato canônico de UX, copy, estados e eventos.

### Arquivos que não devem ser reestruturados nesta iniciativa

- `packages/mcp-server/**`
- `packages/legal-tools/**`
- `packages/agent-core/**`
- persistência de casos, rascunhos e revisão
- ledger e checkout, salvo correção estritamente necessária para expor dados já existentes

## 5. Critérios globais de aceite

- Um usuário não técnico encontra a conexão MCP a partir da visão geral em até um clique.
- ChatGPT e Claude possuem requisitos, instruções e estados próprios.
- A URL MCP canônica é obtida da configuração do ambiente; não é hardcoded no componente.
- O teste de conexão não executa pesquisa faturável.
- A primeira pesquisa informa previamente o custo e gera exatamente um lançamento quando bem-sucedida.
- “Conectado” exige evidência do servidor; não pode ser inferido apenas porque o usuário clicou em um botão externo.
- Chave secreta é mostrada uma única vez e nunca reaparece após recarregar.
- Revogação invalida a chave e atualiza a interface.
- Nenhum payload privado de conversa, arquivo ou histórico é aceito ou persistido pelo MCP.
- A experiência funciona por teclado, com foco visível, regiões semânticas e mensagens anunciáveis.
- Desktop e viewport móvel são testados.
- Todas as telas possuem URL estável e sobrevivem a recarregamento.
- O preço exibido vem do contrato de billing e permanece consistente em landing, conexão, pesquisa e conta.
- Nenhuma mudança amplia os tribunais comercialmente habilitados.

## 6. Review Focus

1. **OAuth indisponível ou incompleto:** a tela deve oferecer instrução manual honesta, sem declarar conexão.
2. **Saldo zero:** o teste técnico continua gratuito; a primeira pesquisa explica a necessidade de recarga sem consumir tentativa.
3. **Credencial criada e não copiada:** o segredo não pode ser recuperado; a interface orienta revogação e nova criação.
4. **Retorno do host sem confirmação:** abrir ChatGPT/Claude não basta para marcar “Conectado”.
5. **Mudança de preço no backend:** todas as superfícies devem refletir o novo valor sem alteração manual de copy.

---

## 7. Plano de execução original (registro histórico)

### Incremento 0 — Congelar contratos de produto e métricas

**Resultado revisável:** copy, estados e métricas definidos antes de alterar telas.

**Arquivos:**

- Criar: `docs/product/mcp-onboarding.md`
- Modificar: `README.md`
- Verificar: `apps/api/src/distribution/openapi.ts`

- [ ] Registrar no documento canônico os públicos “advogado” e “desenvolvedor”, a jornada-alvo, os estados de conexão e o significado exato de “Conectado”.
- [ ] Fixar a taxonomia comercial: busca STJ faturável; verificação de autoridade, listagem de tribunais, saúde e teste de conexão gratuitos.
- [ ] Definir eventos sem conteúdo jurídico: `connection_viewed`, `connection_started`, `connection_verified`, `example_copied`, `first_search_completed` e `connection_failed`, contendo apenas plataforma, estado, timestamp e identificadores técnicos saneados.
- [ ] Proibir nos eventos consulta, ementa, número processual, token, chave, header Authorization e conteúdo da conversa.
- [ ] Revisar OpenAPI e documentação para confirmar que a mesma taxonomia aparece nos contratos públicos.
- [ ] Executar `rg -n "R\$ ?0,20|por busca|por pesquisa|por execução" apps docs README.md` e eliminar divergências, mantendo uma fonte de verdade sempre que possível.
- [ ] Rodar `pnpm typecheck` e `git diff --check`.

**Gate:** revisão conjunta de produto, jurídico e engenharia; nenhuma implementação visual deve prosseguir com preço ou significado de conexão ambíguos.

### Incremento 1 — Tornar a navegação endereçável

**Resultado revisável:** URLs estáveis sem adoção de um roteador pesado.

**Arquivos:**

- Criar: `apps/web/src/navigation/routes.ts`
- Criar: `apps/web/src/navigation/routes.test.ts`
- Modificar: `apps/web/src/App.tsx`
- Modificar: `apps/web/src/context/AppContext.tsx`
- Modificar: `apps/web/src/components/Header.tsx`
- Modificar: `apps/web/src/components/Sidebar.tsx`
- Testar: `tests/e2e/mcp-onboarding.spec.ts`

**Interface proposta:**

```ts
export type AppRoute = {
  tab: AppTab;
  path: string;
  title: string;
};

export function routeForTab(tab: AppTab): AppRoute;
export function tabForPath(pathname: string): AppTab;
export function navigateToTab(tab: AppTab, mode?: 'push' | 'replace'): void;
```

- [ ] Escrever testes falhando para `/`, `/pesquisa`, `/casos`, `/rascunhos`, `/revisao`, `/conectar`, `/conta`, `/conta/chaves`, `/conta/atividade`, `/guia/mcp` e `/desenvolvedores/api`.
- [ ] Testar rota desconhecida retornando à visão geral sem loop ou tela vazia.
- [ ] Testar `popstate` para que os botões Voltar/Avançar restaurem a tela correta.
- [ ] Implementar o mapeamento por History API, sem introduzir React Router nesta iniciativa.
- [ ] Adaptar `setActiveTab` para atualizar a URL e preservar chamadas existentes.
- [ ] Garantir que retorno do Mercado Pago mantenha parâmetros necessários e selecione `/conta`.
- [ ] Atualizar links e botões de navegação para usar a função central.
- [ ] Rodar `pnpm --filter @forgelex/web build`, os testes de rota e o E2E Chromium existente.

**Gate:** todas as telas atuais continuam acessíveis; recarregar qualquer rota não perde o contexto de navegação nem quebra o static fallback.

### Incremento 2 — Central de conexão MCP orientada ao advogado

**Resultado revisável:** o cliente entende e inicia a conexão sem abrir documentação técnica.

**Arquivos:**

- Modificar: `apps/web/src/screens/ConnectionsScreen.tsx`
- Criar: `apps/web/src/screens/connections/connection-model.ts`
- Criar: `apps/web/src/screens/connections/connection-model.test.ts`
- Criar: `apps/web/src/screens/connections/PlatformConnectionCard.tsx`
- Criar: `apps/web/src/screens/connections/ConnectionChecklist.tsx`
- Criar: `apps/web/src/screens/connections/FirstUseExamples.tsx`
- Criar: `apps/web/src/screens/ConnectionsScreen.test.tsx`
- Modificar: `apps/web/src/components/Sidebar.tsx`
- Modificar: `apps/web/src/screens/LandingScreen.tsx`

**Modelo mínimo:**

```ts
export type HostPlatform = 'chatgpt' | 'claude';
export type ConnectionState =
  | 'not_configured'
  | 'ready'
  | 'authorization_started'
  | 'verified'
  | 'revoked'
  | 'expired'
  | 'unavailable';

export interface PlatformConnection {
  platform: HostPlatform;
  state: ConnectionState;
  mcpUrl: string;
  lastVerifiedAt: string | null;
  requirements: string[];
}
```

- [ ] Escrever testes falhando para os sete estados e impedir que `authorization_started` seja renderizado como “Conectado”.
- [ ] Renomear a navegação para “Conectar IA”, com ícone e descrição voltados ao uso.
- [ ] Substituir cartões passivos por seleção ChatGPT/Claude, URL copiável e CTA primário contextual.
- [ ] Exibir requisitos por plataforma, incluindo computador e eventual exigência de plano do host, sem prometer compatibilidade não validada.
- [ ] Manter o aviso de que a assinatura do host não paga operações ForgeLex.
- [ ] Mostrar privacidade em linguagem curta e disponibilizar detalhes expansíveis.
- [ ] Adicionar perguntas-modelo alinhadas às ferramentas reais: pesquisar, abrir autoridade e verificar proveniência.
- [ ] Indicar custo antes de exemplos faturáveis e marcar comandos gratuitos.
- [ ] Na landing, adicionar CTA secundário “Usar no ChatGPT ou Claude”, sem competir com “Abrir caso” e “Pesquisar”.
- [ ] Validar teclado, ordem de foco, nomes acessíveis e layout móvel.
- [ ] Rodar testes focados, build web e E2E de navegação.

**Gate de validação de produto pré-publicação, não executado:** cinco usuários de perfil jurídico conseguem explicar como conectar e qual operação custa crédito após observar a tela por no máximo dois minutos, sem orientação externa. O aceite manual do usuário no Incremento 8 não substitui essa amostra.

### Incremento 3 — Teste gratuito e estado verificável de conexão

**Resultado revisável:** a interface confirma disponibilidade sem cobrar pesquisa e sem fingir conhecer o estado interno do host.

**Arquivos:**

- Modificar: `apps/api/src/app.ts`
- Modificar: `apps/api/src/app.test.ts`
- Modificar: `apps/api/src/distribution/openapi.ts`
- Modificar: `apps/web/src/api-client.ts`
- Modificar: `apps/web/src/screens/connections/connection-model.ts`
- Modificar: `apps/web/src/screens/ConnectionsScreen.tsx`
- Testar: `tests/e2e/mcp-onboarding.spec.ts`

**Contrato recomendado:**

```ts
interface McpConnectionStatusResponse {
  serviceAvailable: boolean;
  mcpUrl: string;
  authenticatedCredential: boolean;
  scopes: string[];
  lastMcpUseAt: string | null;
  billableOperationExecuted: boolean;
}
```

- [ ] Primeiro verificar se os endpoints e metadados atuais permitem derivar o contrato sem criar nova persistência.
- [ ] Escrever teste falhando para resposta autenticada sem expor segredo, consulta ou payload jurídico.
- [ ] Implementar endpoint de leitura somente se a composição dos dados existentes não puder ser feita no frontend.
- [ ] Tratar saúde do serviço e credencial válida como sinais separados.
- [ ] Não marcar a plataforma específica como conectada apenas pela existência de uma API key; usar “Credencial pronta” quando não houver callback verificável do host.
- [ ] Exibir “Último uso do MCP” somente quando houver evento auditável correspondente.
- [ ] Criar ação “Testar disponibilidade”, chamando apenas operação gratuita e não jurisprudencial.
- [ ] Simular no E2E: serviço disponível, credencial ausente, escopo insuficiente, credencial revogada, saldo zero e indisponibilidade temporária.
- [ ] Confirmar que nenhum cenário de teste cria débito ou `usage_event` faturável.
- [ ] Rodar testes focados de API/MCP, typecheck, build web e E2E.

**Gate:** o usuário consegue distinguir “serviço disponível”, “credencial pronta” e “uso confirmado”; nenhum deles é chamado genericamente de “Ativo”.

### Incremento 4 — Gestão de API keys e separação do público desenvolvedor

**Resultado revisável:** chaves são gerenciáveis no frontend e a documentação técnica deixa de competir com o onboarding do advogado.

**Arquivos:**

- Criar: `apps/web/src/screens/ApiKeysScreen.tsx`
- Criar: `apps/web/src/screens/ApiKeysScreen.test.tsx`
- Modificar: `apps/web/src/api-client.ts`
- Modificar: `apps/web/src/App.tsx`
- Modificar: `apps/web/src/components/Sidebar.tsx`
- Modificar: `apps/web/src/screens/ApiDocsScreen.tsx`
- Modificar: `apps/web/src/screens/ApiDocsScreen.test.ts`
- Verificar: `apps/api/src/app.ts`
- Verificar: `apps/api/src/auth/api-key-service.ts`

- [ ] Reutilizar `GET`, `POST` e `DELETE /api/v2/api-keys`; não criar rotas paralelas.
- [ ] Escrever teste falhando para listagem somente de metadados.
- [ ] Escrever teste falhando para criação com nome e escopos mínimos.
- [ ] Escrever teste falhando que garante exibição integral do segredo apenas na resposta de criação.
- [ ] Exigir confirmação imediata antes da revogação e refletir o estado revogado sem recarregar a página.
- [ ] Oferecer perfis de escopo “MCP de pesquisa” e “API de pesquisa”; esconder escopos administrativos do fluxo comum.
- [ ] Renomear “Documentação da API” para “API para desenvolvedores”.
- [ ] Remover da primeira dobra técnica qualquer texto que sugira ser aquele o caminho normal de um advogado.
- [ ] Manter exemplos `curl`, Node e Python, mas introduzir fluxo: criar chave, listar tribunais, pesquisar, abrir autoridade e tratar erros.
- [ ] Documentar `401`, `402`, `403`, `409`, `422`, `429` e `503` com comportamento esperado, sem transformar o frontend em console operacional.
- [ ] Rodar testes de chave, OpenAPI, build e E2E de criação/revogação com segredo sintético.

**Gate:** recarregar a página nunca revela novamente o segredo; chave revogada falha com `401`; o guia do advogado não contém `curl` ou JSON-RPC.

### Incremento 5 — Guia para advogados e primeiro uso assistido

**Resultado revisável:** onboarding completo sem depender de vídeo, suporte ou conhecimento de MCP.

**Arquivos:**

- Criar: `apps/web/src/screens/ForLawyersGuideScreen.tsx`
- Criar: `apps/web/src/screens/ForLawyersGuideScreen.test.tsx`
- Modificar: `apps/web/src/App.tsx`
- Modificar: `apps/web/src/screens/ConnectionsScreen.tsx`
- Modificar: `apps/web/src/screens/LandingScreen.tsx`
- Modificar: `README.md`

- [ ] Estruturar o guia em “O que é”, “Como conectar”, “Como perguntar”, “Quanto custa”, “Privacidade” e “Como revogar”.
- [ ] Criar instruções separadas para ChatGPT e Claude, com data de última verificação da instrução.
- [ ] Evitar prometer botão ou menu do host que não tenha sido validado na versão atual.
- [ ] Incluir três perguntas-modelo e explicar a sequência `pesquisar → abrir autoridade → verificar`.
- [ ] Explicar que resultados vêm da infraestrutura ForgeLex, mas a redação da resposta pertence ao modelo do host.
- [ ] Exibir custo da pesquisa por dado retornado pelo billing; não repetir preço estático.
- [ ] Tratar saldo insuficiente com CTA para `/conta`, preservando a consulta no cliente apenas se isso não registrar conteúdo jurídico sensível.
- [ ] Tornar vídeo opcional e complementar; o texto deve bastar.
- [ ] Testar navegação por teclado, headings, links e viewport móvel.
- [ ] Rodar testes focados, build e E2E do primeiro uso.

**Gate:** o usuário completa o roteiro sem documentação de desenvolvedor; todos os claims sobre host, custo e privacidade possuem fonte interna identificável.

### Incremento 6 — Conta operacional e atividade

**Resultado revisável:** o cliente entende saldo, consumo e uso do MCP sem replicar o dashboard da Exordial.

**Arquivos:**

- Criar: `apps/web/src/screens/AccountActivityScreen.tsx`
- Criar: `apps/web/src/screens/AccountActivityScreen.test.tsx`
- Modificar: `apps/web/src/screens/CreditsScreen.tsx`
- Modificar: `apps/web/src/App.tsx`
- Modificar: `apps/web/src/components/Sidebar.tsx`
- Modificar: `apps/web/src/api-client.ts`
- Verificar: `apps/api/src/billing/billing-operations.ts`
- Verificar: `packages/billing-ledger/src/ledger-service.ts`

- [ ] Reutilizar saldo, transações, compras, faturas e métodos de pagamento existentes.
- [ ] Definir uma visão de atividade com data, capacidade, canal `WEB | REST | MCP`, status e valor, sem armazenar a consulta jurídica em texto.
- [ ] Caso o backend não exponha canal e capacidade, adicionar projeção saneada sobre eventos existentes, sem nova tabela até comprovar necessidade.
- [ ] Mostrar métricas de 30 dias somente se houver dados reais: operações, gasto e último uso.
- [ ] Não exibir gráfico vazio como evidência de funcionamento; usar estado vazio explicativo.
- [ ] Vincular cada lançamento faturável a uma capacidade, nunca a nomes internos de endpoint como principal rótulo do cliente.
- [ ] Manter detalhes técnicos expansíveis para suporte.
- [ ] Testar promoção, saldo pago, reembolso, replay idempotente, operação gratuita e ausência de atividade.
- [ ] Rodar testes de billing/ledger, PostgreSQL focal, build e E2E.

**Gate:** a soma dos lançamentos exibidos reconcilia com o saldo; operações gratuitas não aparecem como débito; replays não geram duplicidade.

### Incremento 7 — Segurança e encerramento de conta

**Resultado revisável:** ações essenciais de segurança são autônomas e coerentes com Supabase e retenção legal.

**Arquivos:**

- Criar: `apps/web/src/screens/AccountSecurityScreen.tsx`
- Criar: `apps/web/src/screens/AccountSecurityScreen.test.tsx`
- Modificar: `apps/web/src/auth/AuthContext.tsx`
- Modificar: `apps/web/src/App.tsx`
- Modificar: `apps/web/src/components/Sidebar.tsx`
- Criar ou modificar: rota de conta em `apps/api/src/app.ts` somente após política de retenção aprovada
- Modificar: `apps/api/src/account-routes.test.ts`
- Verificar: `apps/api/src/operations/retention-service.ts`

- [ ] Reutilizar o fluxo de recuperação/alteração de senha já suportado por Supabase.
- [ ] Expor encerramento somente depois de definir dados apagados, anonimizados, retidos e prazo legal de cada categoria.
- [ ] Exigir reautenticação e confirmação explícita para encerramento.
- [ ] Revogar sessões, API keys e credenciais MCP como parte da operação transacional ou reconciliável.
- [ ] Preservar registros fiscais exigidos sem manter conteúdo jurídico identificável além do necessário.
- [ ] Não apagar nem alterar dados por interface durante testes E2E compartilhados; usar tenant descartável.
- [ ] Testar senha, sessão expirada, encerramento parcial compensado, idempotência e novo login rejeitado.
- [ ] Executar revisão jurídica de Termos e Política de Privacidade antes de publicação.

**Gate:** nenhuma ação destrutiva é publicada sem política de retenção, confirmação, trilha auditável e teste de reconciliação.

### Incremento 8 — QA visual, acessibilidade e coerência de copy

**Resultado revisável:** acabamento transversal sem redesenho geral.

**Arquivos:**

- Modificar apenas componentes tocados nos incrementos anteriores.
- Criar: `tests/e2e/mcp-onboarding.spec.ts`
- Modificar: `playwright.config.ts` apenas se necessário para projetos mobile/desktop.
- Atualizar: `docs/product/mcp-onboarding.md`

- [x] Auditar contraste, foco, landmarks, headings, nomes acessíveis, mensagens de erro e alvos de toque nas telas do incremento; limitações da auditoria heurística registradas em `docs/product/mcp-onboarding.md`.
- [x] Validar 375×812, 768×1024, 1366×768 e 1440×900; 320×812 foi inspecionado adicionalmente.
- [x] Verificar zoom nativo acima de 200% em `/conectar`: o usuário relatou navegação adequada até 350% e forneceu captura da tela em Chrome. A captura não mede automaticamente a escala nem cobre as demais rotas.
- [x] Cobrir por E2E um percurso móvel apenas por teclado entre conexão, guia, conta, atividade, segurança, chaves e documentação; corrigir o retorno de foco após selecionar uma rota no menu móvel.
- [x] Revisar manualmente as telas do incremento por teclado e leitor de tela: o usuário informou ter feito a revisão e aprovado a prévia em 24/09/2026; não forneceu matriz de ações, tecnologias assistivas ou resultados por estado.
- [x] Garantir que estados observados não dependam apenas de cor.
- [x] Revisar as ocorrências de “ativo”, “conectado”, “gratuito”, “seguro”, “oficial” e “sem acesso” nas telas tocadas, sem afirmar conexão do host por seleção local.
- [x] Conferir preço e tribunal com a API e retirar claims não confirmados sobre saldo e meios de pagamento; disponibilidade de planos dos hosts permanece condicional.
- [x] Executar E2E com serviço disponível, indisponível, saldo zero, chave revogada, billing desabilitado e transição disponível → indisponível.
- [x] Rodar os gates proporcionais: testes focados, `pnpm typecheck`, `pnpm test`, build web, E2E Chromium e `git diff --check`.

Em 22/09/2026, o QA técnico local foi validado nos gates registrados em
`docs/product/mcp-onboarding.md`. Em 23/09/2026, o usuário acrescentou a
verificação manual de zoom em `/conectar`, e um novo E2E reproduziu e cobriu a
correção de foco do menu móvel. Em 24/09/2026, após receber a prévia local, o
usuário informou ter revisado e aprovado as telas do incremento por teclado e
leitor de tela. O aceite manual encerra o gate local do Incremento 8, mas não
constitui auditoria formal WCAG nem documenta a cobertura por ação ou estado.
Não foi feita conexão, autenticação ou chamada ao Claude; os gates do plano
que dependem de hosts reais ou usuários adicionais permanecem separados.

**Gate:** zero defeitos críticos de acessibilidade ou copy; nenhuma divergência comercial entre landing, conexão, pesquisa, documentação e billing.

## 8. Ordem recomendada e dependências

| Ordem | Incremento | Dependência | Valor entregue |
|---:|---|---|---|
| 0 | Contratos e métricas | Nenhuma | Remove ambiguidades antes do código |
| 1 | Rotas estáveis | Incremento 0 | Deep links, suporte e navegação correta |
| 2 | Central MCP | Incrementos 0–1 | Descoberta e ativação compreensíveis |
| 3 | Status verificável | Incremento 2 | Confiança operacional sem cobrança |
| 4 | API keys e developers | Incrementos 1–3 | Autonomia técnica e separação de públicos |
| 5 | Guia e primeiro uso | Incrementos 2–4 | Onboarding completo do advogado |
| 6 | Conta e atividade | Incrementos 0 e 3 | Transparência de consumo e operação |
| 7 | Segurança | Política de retenção | Autonomia e conformidade da conta |
| 8 | QA transversal | Incrementos anteriores | Coerência final e acessibilidade |

Os incrementos 4 e 6 podem ser desenvolvidos separadamente após o Incremento 3. O Incremento 7 deve permanecer isolado por envolver ação destrutiva e retenção legal.

## 9. Priorização de lançamento

### P0 — necessário antes de promover o MCP como autoatendimento

- Incrementos 0, 1, 2, 3 e 5.
- Evidência E2E atual de conexão, teste gratuito, primeira pesquisa faturável e lançamento único.
- Copy de preço, privacidade e compatibilidade revisada.

### P1 — necessário para operação comercial madura

- Incrementos 4 e 6.
- Gestão de chaves, último uso, consumo e reconciliação do saldo.

### P2 — autonomia completa da conta

- Incrementos 7 e 8.
- Segurança, encerramento, acessibilidade e acabamento transversal.

## 10. Métricas de sucesso

### Funil de ativação

- Percentual de usuários autenticados que abrem `/conectar`.
- Percentual que inicia a conexão por plataforma.
- Percentual com credencial pronta.
- Percentual com primeiro uso MCP confirmado.
- Percentual com primeira pesquisa concluída.
- Tempo mediano entre cadastro e primeiro uso confirmado.

### Qualidade da experiência

- Taxa de falha por etapa e plataforma.
- Percentual de usuários que recorrem à documentação técnica antes do primeiro uso.
- Contatos de suporte relacionados a conexão por 100 ativações.
- Abandono após mensagem de plano incompatível ou saldo insuficiente.

### Confiabilidade comercial

- Divergência entre saldo e soma de lançamentos: zero.
- Débitos duplicados por replay: zero.
- Operações gratuitas cobradas: zero.
- Chaves revogadas ainda aceitas: zero.
- Eventos com conteúdo jurídico ou segredo: zero.

Não definir metas percentuais antes de obter uma linha de base real; os primeiros 30 dias devem medir, não maquiar, o funil.

## 11. Estratégia de testes

### Unitários

- resolução de rotas;
- modelo de estado da conexão;
- copy por plataforma;
- preço derivado do contrato;
- exibição única de segredo;
- projeção de atividade sem conteúdo sensível.

### Integração de API

- autenticação e escopos;
- criação/listagem/revogação de chaves;
- status da conexão;
- saúde separada de autenticação;
- billing indisponível;
- saldo zero;
- idempotência e revogação.

### E2E

- login → conectar → testar disponibilidade;
- conexão manual e OAuth quando suportado;
- primeira pesquisa com confirmação de custo;
- lançamento único no extrato;
- revogação e falha subsequente;
- rotas recarregáveis e botão Voltar;
- desktop e mobile.

### Homologação real

- executar no ChatGPT antes de promover a conexão como autoatendimento; a conexão real ao Claude foi retirada do escopo por decisão do usuário;
- registrar plano/versão do host e data;
- validar `search → get authority → verify authority`;
- validar saldo antes/depois e evento único;
- confirmar que arquivos, histórico e conversa não são transmitidos além dos argumentos autorizados;
- revogar credencial de teste e comprovar `401`.

Cliente HTTP isolado não substitui prova no host real.
Esta homologação em ChatGPT não foi executada neste marco local.

## 12. Riscos e contenções

| Risco | Contenção |
|---|---|
| Interfaces dos hosts mudarem | Instruções versionadas e data de última verificação |
| “Conectado” falso positivo | Estados separados e evidência do servidor |
| Copy comercial divergente | Preço retornado pelo billing e teste de consistência |
| Vazamento de segredo | Exibição única, redaction e testes negativos |
| Escopo virar refatoração | Lista explícita de arquivos preservados e gates por incremento |
| Duplicação REST/MCP | Reutilizar serviços, ToolRegistry, ledger e auditoria existentes |
| Métrica coletar conteúdo jurídico | Allowlist de eventos e campos, com teste de schema |
| Mudança destruir navegação atual | Compatibilidade temporária de `setActiveTab` e E2E existente |
| Dependência de vídeo | Guia textual completo e vídeo apenas complementar |

## 13. Limites de escopo

Este plano não autoriza nem inclui:

- redesign completo;
- troca de framework ou design system;
- novo provedor de autenticação;
- novos tribunais comercialmente habilitados;
- alteração do preço;
- novo modelo de IA hospedado pelo ForgeLex;
- leitura de conversas, arquivos ou histórico do host;
- migração ou deploy remoto;
- commit ou push;
- exclusão de dados reais;
- criação de aplicativo MCP separado.
- conexão, autenticação ou chamadas reais ao Claude.

No fechamento local de 24/09/2026, homologação no ChatGPT real, estudo com cinco usuários e revisões humanas do encerramento ainda eram gates posteriores. As revisões humanas e a ativação do encerramento foram registradas depois na matriz operacional; a homologação real no ChatGPT e o estudo com usuários continuam sem prova neste plano.

## 14. Gates de entrega

Cada incremento deve passar, na medida aplicável:

1. revisão do diff limitado ao incremento;
2. testes focados escritos antes ou junto da mudança;
3. typecheck;
4. build do frontend;
5. E2E proporcional ao fluxo alterado;
6. `git diff --check`;
7. revisão de copy e acessibilidade;
8. atualização de `docs/product/mcp-onboarding.md`, README e documentação pública afetada.

Os seguintes gates permanecem independentes e exigem autorização própria: commit, push, migração remota, configuração de OAuth live, deploy, homologação faturável e publicação.

## 15. Definição de concluído no escopo revisado

A implementação técnica local dos incrementos 0–8 está concluída e aceita para este marco porque:

- o MCP é descoberto sem depender da documentação da API;
- a interface oferece instruções distintas para ChatGPT e Claude, sem afirmar que qualquer host externo foi conectado;
- disponibilidade, credencial e uso confirmado são estados distintos;
- o usuário recebe exemplos de primeiro uso e custo antes da operação;
- API keys podem ser criadas e revogadas com segurança;
- conta e atividade apresentam saldo e lançamentos reconciliáveis nos testes locais;
- as rotas são recarregáveis e compartilháveis;
- a documentação de advogados e desenvolvedores está separada;
- preço, privacidade e limites seguem contratos consistentes nas superfícies verificadas;
- os fluxos locais passaram nos gates automatizados registrados em `docs/product/mcp-onboarding.md` e `docs/operations/account-closure/validation.md`;
- o usuário aprovou a revisão manual das telas do Incremento 8, conforme registro em `docs/product/mcp-onboarding.md`.

Este fechamento local não declara ausência absoluta de regressões nem conformidade formal WCAG. Em 24/09/2026, estudo com cinco usuários jurídicos, homologação do fluxo real no ChatGPT e os gates remotos ainda não tinham sido demonstrados por este plano. Depois desse marco, as revisões jurídica, fiscal, de segurança e UX do encerramento foram aprovadas; a implantação e a habilitação foram registradas em `docs/operations/account-closure/validation.md`. Permanecem sem prova neste plano a homologação real no ChatGPT, com reconciliação de débito e revogação, e o estudo com cinco usuários jurídicos. O novo site público depende de release e validação próprios. A integração real com Claude não é pendência do escopo revisado.

## 16. Estado do checkout observado ao elaborar o plano

- Repositório: `C:\Users\Boni Jr\.antigravity-ide\SDK`
- Branch: `main`
- Remoto: `origin` → `junior-aguiar-eng/ForgeLex`
- HEAD observado: `c572b62570ae9edff81f4a2cde46da00447686d5`
- Alterações preexistentes preservadas: `Dockerfile`, `ops/gcp/phase8/cloudbuild-auth.yaml` e `tests/dockerfile.test.ts`

Este documento não modificou o checkout do ForgeLex.
