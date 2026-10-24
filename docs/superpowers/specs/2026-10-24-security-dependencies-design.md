# Correção de dependências e migração compatível do Zod

## Escopo autorizado

Boni autorizou em 24/10 corrigir os alertas atuais, inclusive migrar Zod 3 para
Zod 4 com preservação dos contratos e regressões, e publicar somente após os
gates. O checkout original e seus 47 arquivos permanecem separados. Nenhuma
migration de banco faz parte desta entrega.

## Decisões de implementação

Adotar Zod 4 corrigido em todos os pacotes; usar o conversor JSON Schema nativo
na abstração compartilhada de ferramentas. Preservar obrigatoriedade,
opcionalidade, defaults, nulabilidade, descrições, limites explícitos e política
de propriedades extras. Preservar o formato de identificadores aceito por Zod 3
com o validador GUID do Zod 4, sem enfraquecer campos que já tinham validação v4.
Records terão chave string explícita; eventos com unknown cuja ausência era
admitida receberão optional explícito. Adaptar tipos ao Zod 4, sem casts para
disfarçar schemas incompatíveis.

Alternativas descartadas: conservar imports zod/v3 sob pacote de versão 4
apenas para satisfazer o audit; converter schemas v4 pela biblioteca de v3;
afrouxar o audit ou eliminar testes. Elas não demonstram migração efetiva nem
compatibilidade. A seleção do conversor nativo é decisão técnica do Codex;
a autorização humana cobre o resultado e os gates acima.

Aplicar correções compatíveis de Vitest/mocker, Fastify, fast-uri, ip-address e
body-parser, preservando os majors de Vite 6/7. Manter patch e testes de braces;
a retirada do advisory upstream não será tratada como release corrigido.

## Evidência e publicação

Antes da migração, registrar testes de contratos existentes e uma regressão que
demonstre a conversão incorreta de schemas v4. Depois, exigir audit de produção
e completo, regressões de schemas/MCP/adapters, suíte integral, build, lint,
tipos e CI com PostgreSQL/E2E. Integrar por PR com cabeça conferida. Construir
imagem de main limpo; validar candidata sem tráfego, revisão comercial e worker
privado antes da promoção, sem DDL. Registrar digest, traces, configuração,
limpeza e preservação local.
