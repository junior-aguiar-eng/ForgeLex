# Correção do onboarding MCP e da documentação de integração

Pedido: entregar a experiência completa e profissional já especificada no
prompt mestre, corrigindo o fluxo inacessível e os guias genéricos apontados
por Boni em 02/10/2026. Executar no produto existente, preservando a identidade.

## Entrega e verificação

1. Corrigir descoberta: domínio público real, servidor OAuth existente,
   desafio WWW-Authenticate e escopos compatíveis. OAuth desativado deve ser
   identificado explicitamente; nenhuma promessa de instalação funcional.
2. Implementar consentimento com login ForgeLex, identidade do aplicativo,
   permissões, custo, aprovação/recusa e retorno validado. Listar e revogar
   autorizações. Credenciais OAuth devem receber somente pesquisa/MCP,
   com validação da identidade e da autorização vigente a cada requisição.
3. Unificar guia e conexão: passos por plataforma, URL copiável, entrada
   direta nas configurações oficiais, primeira operação e solução de erros.
   Preservar distinção entre instruções, autorização e uso efetivo.
4. Documentação técnica: contrato concreto de cada operação, exemplos
   completos, resposta visível sem painel vazio, leitura ao vivo somente
   em endpoints gratuitos, erros, OpenAPI e orientações de idempotência.
5. Verificar testes de autenticação, APIs, UI, teclado e responsividade;
   revisão independente; commit/push/CI; build por SHA; publicação e teste
   real no host. Configuração de acesso no navegador segue confirmação
   obrigatória da ferramenta no momento da ação.

## Decisões e limites

- Reutilizar Supabase Auth OAuth 2.1 para identidade e consentimento, com gateway
  ForgeLex restrito ao MCP. Clientes nativos são confidenciais; segredo, acesso
  e refresh nativos ficam cifrados no servidor. O host recebe somente envelopes
  vinculados ao recurso. PKCE externo e interno são independentes; o callback
  preserva state e vincula o código ao cliente, retorno e challenge externos.
  Registro dinâmico direto no Supabase fica desativado; o gateway registra
  clientes pelo endpoint administrativo, sob limite de frequência.
  A implementação hospedada deve ser verificada, inclusive audience/resource,
  PKCE, refresh e revogação; documentação ou código upstream não comprovam
  essas características no ambiente produtivo.
- MCP externo permanece limitado à pesquisa jurídica. Não conceder acesso
  administrativo, encerramento de conta, chaves ou escrita em casos.
- Não inventar capturas das plataformas nem declarar Claude validado sem
  execução real. Separar referência oficial de evidência no navegador.
- Não executar compra real ou pesquisa paga sem autorização específica.
- Falha em gate deve permanecer documentada; não mascarar com NoAuth,
  credencial na URL ou demonstração apresentada como resposta real.
