# Prompt de implementação — Conta, pagamentos e créditos do ForgeLex

## Papel

Você é o agente responsável por implementar, no repositório ForgeLex, a infraestrutura real de cadastro, autenticação, conta de faturamento, pagamentos e créditos. Trabalhe sobre o código existente, respeitando a arquitetura, os contratos, as migrações, os testes e as alterações locais já presentes.

O objetivo não é criar uma demonstração visual. O objetivo é transformar o ledger interno existente em um fluxo operacional auditável, sem simular saldo, pagamento, transação, credencial ou confirmação de webhook.

## Regra de execução

Antes de alterar qualquer arquivo:

1. confirme o diretório, branch, HEAD, remoto e estado do Git;
2. leia `AGENTS.md` e as instruções locais aplicáveis;
3. examine os pacotes e contratos atuais, especialmente:
   - `apps/api`;
   - `apps/web`;
   - `packages/billing-ledger`;
   - `packages/persistence`;
   - `packages/domain`;
   - `packages/audit`;
   - configurações de workspace, scripts, lockfile e migrações;
4. preserve mudanças locais não relacionadas;
5. não faça `push`, não altere infraestrutura de produção e não introduza dados fictícios para fazer os testes passarem.

Separe no relatório final o que foi confirmado no código, o que foi implementado, o que é limitação do ambiente e o que depende de decisão externa.

## Escopo funcional

Implemente os seguintes fluxos, em ordem de dependência:

### 1. Cadastro de usuário e organização

Criar uma identidade mínima compatível com o modelo multi-tenant existente:

- usuário;
- organização ou tenant;
- vínculo do usuário com a organização;
- papel e permissões mínimas;
- status da conta;
- datas de criação, atualização e eventual desativação;
- índices e restrições de unicidade adequados.

Não armazenar senha em texto puro. Se for implementada autenticação por senha, usar mecanismo seguro de hash e parâmetros configuráveis. Se o projeto já pressupuser um provedor externo de identidade, preservar essa decisão e implementar apenas o adaptador necessário.

Não criar uma identidade fictícia, tenant padrão ou saldo implícito para facilitar a execução local.

### 2. Autenticação e sessão

Integrar o cadastro ao `AuthAdapter` existente sem quebrar a autenticação Bearer já utilizada pelas rotas protegidas.

Implementar, conforme compatibilidade com o projeto:

- registro;
- login ou troca de credencial por sessão;
- expiração;
- revogação;
- identificação segura de `userId` e `tenantId`;
- proteção contra acesso cruzado entre tenants;
- mensagens de erro sem revelar se um usuário existe;
- validação de escopos e permissões.

Tokens devem ser armazenados somente em forma reversível quando isso for estritamente necessário para a sessão ou, preferencialmente, em forma de hash para validação. Nunca registrar tokens brutos em logs, auditoria, respostas ou banco de dados sem justificativa explícita.

### 3. Conta de faturamento

Criar uma conta de faturamento vinculada ao tenant, com:

- moeda;
- status;
- identificador externo do cliente no provedor de pagamento, quando houver;
- plano ou modalidade de cobrança, se aplicável;
- timestamps;
- referência segura para o proprietário da conta;
- idempotência nas operações mutáveis.

A conta de faturamento não deve ser confundida com o ledger. O ledger registra fatos contábeis; a conta de faturamento representa o relacionamento comercial e operacional com o provedor de pagamento.

### 4. Consulta de saldo e extrato

Expor endpoints autenticados para o frontend consultar dados reais:

- saldo pago;
- saldo promocional, somente se houver regra de negócio implementada;
- saldo total derivado de forma consistente;
- extrato paginado;
- filtros por período, tipo, status e operação;
- identificadores de reconciliação;
- estado de lançamento pendente, liquidado, falho, estornado ou revertido.

O backend deve ser a fonte do saldo. O frontend não pode calcular ou fabricar saldo inicial, bônus, transação, número de pesquisas disponíveis ou histórico.

Quando não houver conta ou lançamentos, retornar estado vazio explícito, não valores de demonstração.

### 5. Provedor de pagamento

Escolher e documentar um único provedor inicial compatível com o escopo do ForgeLex. Não implementar vários provedores simultaneamente sem necessidade.

Antes da implementação definitiva, verificar:

- API oficial e SDK oficial disponíveis;
- modo sandbox;
- criação de cliente;
- criação de cobrança ou checkout;
- confirmação de pagamento;
- cancelamento;
- estorno;
- consulta de status;
- assinatura e validação de webhook;
- idempotência;
- requisitos de segurança e dados pessoais;
- política de produção e credenciais necessárias.

Encapsular o provedor por uma interface interna, por exemplo:

- `PaymentProvider`;
- `createCustomer`;
- `createCheckout` ou `createCharge`;
- `getPaymentStatus`;
- `refundPayment`;
- `verifyWebhook`.

O restante do sistema não deve depender diretamente do SDK ou do formato proprietário do provedor.

Não incluir credenciais reais no repositório. Usar variáveis de ambiente documentadas e falhar de modo explícito quando estiverem ausentes.

### 6. Checkout e criação de cobrança

Implementar endpoints autenticados para:

- criar uma intenção de pagamento ou checkout;
- associá-la ao tenant e à conta de faturamento;
- registrar valor, moeda, pacote, referência e idempotency key;
- retornar ao frontend somente os dados necessários para continuar o pagamento;
- impedir alteração indevida do valor pelo cliente;
- evitar cobrança duplicada em reenvio da mesma requisição;
- associar a cobrança ao identificador externo do provedor.

O valor final deve ser determinado pelo backend a partir de um catálogo ou configuração controlada. Nunca confiar no preço enviado livremente pelo navegador.

Se o projeto ainda não possuir catálogo comercial aprovado, criar uma configuração mínima e claramente marcada como ambiente de desenvolvimento, sem afirmar que está pronta para produção.

### 7. Webhook idempotente e verificado

Implementar endpoint de webhook específico para o provedor escolhido:

- validar assinatura antes de processar o corpo;
- preservar o payload bruto necessário para auditoria;
- registrar evento recebido e identificador externo;
- rejeitar assinatura inválida;
- processar cada evento uma única vez;
- suportar reenvio do mesmo evento;
- manter transição de estados monotônica e consistente;
- impedir crédito sem confirmação válida do provedor;
- tratar pagamento aprovado, pendente, recusado, expirado, cancelado e estornado;
- não confiar somente em dados enviados pelo frontend;
- responder ao provedor com status adequado.

O webhook não deve lançar crédito diretamente sem uma operação transacional ou mecanismo equivalente de consistência.

### 8. Lançamento no ledger

Integrar o pagamento confirmado ao `packages/billing-ledger` e às tabelas de persistência existentes.

Requisitos:

- lançamento imutável;
- valor em centavos ou unidade inteira, nunca `float`;
- moeda explícita;
- tenant explícito;
- referência à cobrança externa;
- idempotency key;
- tipo de operação;
- origem do crédito;
- status;
- timestamps;
- correlação com evento de webhook;
- auditoria sem dados sensíveis;
- impossibilidade de saldo negativo;
- estorno como lançamento compensatório, nunca apagando o lançamento original.

Reutilizar as garantias existentes do ledger sempre que possível. Não duplicar regra de saldo em `apps/web`.

### 9. Frontend

Conectar a tela `Créditos e faturamento` aos endpoints reais.

Requisitos de experiência:

- sem saldo inicial fictício;
- sem bônus fictício;
- sem transações pré-criadas;
- sem número de pesquisas disponíveis inventado;
- sem confirmação visual de pagamento antes do retorno do backend ou webhook válido;
- mostrar `Conta não configurada`, `Saldo indisponível`, `Nenhum lançamento` ou estado equivalente quando aplicável;
- mostrar cobrança pendente sem tratá-la como crédito liquidado;
- atualizar o extrato após retorno confirmado;
- mostrar erros de autenticação, indisponibilidade e pagamento sem mascará-los;
- não exibir credenciais, tokens ou segredos;
- manter linguagem jurídica e comercial simples em português-BR.

A tela pode oferecer checkout somente se o backend correspondente estiver implementado e validado. Não manter botões que apenas alterem estado local como se tivessem efetuado uma recarga.

O cabeçalho deve ter apenas um acesso à conta/faturamento. Não duplicar `Créditos` no cabeçalho e no rodapé.

### 10. Administração mínima

Se necessário para operar o fluxo, criar endpoints ou funções internas para:

- consultar cobrança;
- consultar conta de faturamento;
- cancelar checkout ainda não pago;
- solicitar estorno com permissão adequada;
- reconciliar evento do provedor;
- consultar falhas de webhook;
- reprocessar evento de forma segura.

Não expor operações administrativas a usuários comuns.

## Compatibilidade com o restante do ForgeLex

Preserve e não descaracterize:

- casos, documentos, fatos, provas e linha do tempo;
- Draft Studio;
- revisão humana e aprovação;
- pesquisa jurisprudencial e proveniência;
- MCP e API documentada;
- auditoria;
- isolamento por tenant;
- contratos de domínio existentes;
- idempotência de operações já implementadas.

Não reintroduzir fixtures de jurisprudência, saldo, transações, aprovações ou conexões no fluxo de produção. Fixtures podem permanecer somente em testes ou em demonstrações explicitamente rotuladas.

## Banco de dados e migrações

Criar migrações incrementais, reversíveis quando a ferramenta permitir, para as novas entidades e índices.

Verificar:

- integridade referencial;
- unicidade por tenant;
- concorrência;
- transações envolvendo webhook e ledger;
- compatibilidade com banco usado nos testes;
- comportamento de banco vazio;
- execução repetida das migrações;
- ausência de migração destrutiva sem justificativa e autorização explícita.

Não apagar tabelas ou dados existentes para simplificar a implementação.

## Segurança e privacidade

Aplicar, no mínimo:

- validação de entrada com os schemas já usados pelo projeto;
- autenticação e autorização em toda rota protegida;
- isolamento por tenant em consultas e mutações;
- proteção contra replay;
- validação de assinatura de webhook;
- não exposição de segredo em resposta, log, erro ou auditoria;
- redaction de Authorization, tokens e chaves;
- limites de tamanho e taxa para webhook e checkout;
- tratamento seguro de dados pessoais;
- logs com correlação suficiente para auditoria, sem conteúdo sensível;
- mensagens de erro operacionais sem vazamento de detalhes internos.

## Testes obrigatórios

Criar ou atualizar testes unitários, de integração e de contrato para:

### Identidade

- cadastro válido;
- duplicidade;
- autenticação inválida;
- expiração e revogação;
- isolamento entre tenants;
- escopos insuficientes.

### Faturamento

- conta inexistente;
- conta criada corretamente;
- consulta de saldo vazio;
- extrato vazio;
- paginação;
- consulta de tenant alheio rejeitada.

### Pagamento

- criação de checkout válida;
- valor alterado pelo cliente rejeitado;
- idempotência da criação;
- credencial ausente;
- resposta de provedor indisponível;
- pagamento pendente;
- pagamento aprovado;
- pagamento recusado;
- cancelamento;
- estorno.

### Webhook

- assinatura válida;
- assinatura inválida;
- payload malformado;
- evento repetido;
- eventos fora de ordem;
- evento já processado;
- falha transacional com retry seguro;
- crédito somente após confirmação válida.

### Ledger

- lançamento único;
- replay sem duplicação;
- saldo correto;
- concorrência;
- estorno compensatório;
- impossibilidade de saldo negativo;
- vínculo com cobrança externa e webhook.

### Frontend

- estado sem conta;
- saldo indisponível;
- extrato vazio;
- checkout pendente;
- erro de API;
- confirmação somente após retorno real;
- ausência de valores mockados no DOM inicial;
- ausência de credenciais estáticas;
- acesso único a conta/faturamento.

## Critérios de aceite

A implementação somente estará concluída quando:

- houver um fluxo de identidade compatível com o modelo multi-tenant;
- o frontend não depender de saldo ou transação local fictícia;
- existir conta de faturamento persistida;
- houver endpoint autenticado de saldo e extrato;
- houver provedor de pagamento escolhido e encapsulado;
- checkout possuir idempotência;
- webhook validar assinatura e replay;
- pagamento confirmado produzir lançamento no ledger;
- estorno não apagar o histórico original;
- não houver crédito criado pelo frontend;
- a API retornar estados vazios honestos;
- a tela de créditos consumir dados do backend;
- API, ledger, auditoria e persistência permanecerem coerentes;
- testes de falha e repetição cobrirem o fluxo;
- nenhum segredo real estiver no código ou nos artefatos;
- a documentação registrar variáveis de ambiente, sandbox, produção, webhook e limitações;
- a navegação não duplicar conta, créditos ou pesquisa;
- `pnpm install --frozen-lockfile` passar;
- `pnpm typecheck` passar;
- `pnpm test` passar;
- `pnpm build` passar;
- `git diff --check` passar;
- o diff final conter somente o escopo autorizado.

## Gatilhos de parada

Pare e registre um bloqueio, sem simular o comportamento, se:

- não houver decisão sobre o provedor de pagamento;
- forem necessárias credenciais externas não disponíveis;
- o provedor exigir configuração comercial ou jurídica não fornecida;
- a implementação exigir alteração destrutiva de dados;
- o contrato do ledger não suportar a operação sem mudança incompatível;
- houver dúvida material sobre valor, moeda, estorno ou titularidade;
- não for possível validar webhook no sandbox;
- a autenticação atual não permitir determinar o tenant com segurança.

Nesses casos, implemente somente a infraestrutura segura e os contratos que puderem ser comprovados, deixando o restante explicitamente como pendência. Não criar fallback que pareça pagamento real.

## Entrega final

Relate de forma objetiva:

1. arquivos e pacotes alterados;
2. entidades, rotas e contratos criados;
3. provedor escolhido e justificativa;
4. fluxo de cadastro e autenticação;
5. fluxo de checkout;
6. fluxo de webhook e idempotência;
7. integração com o ledger;
8. estados vazios e erros expostos no frontend;
9. testes executados e resultados;
10. limitações, credenciais ou configurações ainda necessárias;
11. estado do Git e hash do commit, se o usuário tiver autorizado commit;
12. confirmação expressa de que não houve push.

Não declarar “pagamento implementado” se houver somente ledger, mock, checkout local ou resposta simulada. Diferencie sempre infraestrutura preparada, sandbox validado e produção comprovada.
