# Correção da pesquisa, histórico e ano do julgamento

Plano aprovado por Boni em 02/10/2026. Evolução incremental, executável e
validável por uma pessoa, sem operações pagas em produção para testes.

## Requisitos

- Histórico e exemplos apenas preenchem filtros; somente Consultar inicia
  outra busca faturável. Agrupar termo armazenado, tribunal e ano, mantendo
  data da última operação e contagem integral. Preservar cada débito real.
- Ano opcional entre 1989 e o ano corrente UTC nas duas telas, REST POST,
  GET equivalente e MCP. Intervalo inclusivo na data de julgamento,
  aplicado antes do limite. Chamadas antigas continuam sem filtro.
- Bloqueio síncrono compartilhado, chave imutável por operação e repetição
  recuperável com a mesma chave. Novas consultas intencionais usam outra.
- Referência e ementa copiáveis sem cobrança, sucesso somente após concluir
  a cópia, erro visível. Identificar os filtros dos resultados preservados.
- Tarifa da API e avisos explícitos sobre cobrança e ausência de cópia dos
  resultados no histórico; controles e estilos existentes, teclado e mobile.
- Migration aditiva nullable `judgment_year`, histórico antigo sem ano e
  `GET /api/v2/research/history?grouped=true` compatível com listagem individual.
- Não criar armazenamento permanente de resultados nem estornar débitos.

## Sequência e validação

1. Testes de regressão do contrato e agrupamento; implementar persistência
   e propagação do ano, validação antes do ledger e OpenAPI.
2. Reproduzir o disparo cobrado por exemplos no navegador; substituir o
   comportamento, adicionar proteção compartilhada e repetição segura.
3. Validar cópia, filtros recuperados, cliques rápidos, consultas repetidas
   e perda da resposta com Auth, API, saldo e documentos fictícios locais.
4. Verificar PostgreSQL descartável, suíte geral, lint, build e typecheck;
   revisar o diff completo e registrar evidências em STATUS_VALIDACAO.md.
5. Na publicação, aplicar a migration antes da aplicação; rollback para a
   imagem anterior preserva a coluna nullable. Usar branch isolada de main
   e preservar o checkout P2.

## Registro de execução

- Base: `dd8ce234fece8b02dac4c1f2827af33935b7f17f`, branch
  `codex/research-history-year`, worktree document-io limpo no início.
- RED: quatro regressões de contrato/ano/agrupamento e duas da API falharam
  por ausência do filtro, validação e agrupamento. E2E falhou porque um
  exemplo disparava uma consulta. Coordenador ausente e resposta incompleta
  também demonstrados antes das implementações correspondentes.
- Decisão: coordenador mantém o bloqueio até atualizar o histórico; o mesmo
  caminho é usado na repetição. Fixtures aplicam datas antes do limite.
- Decisão: testes de histórico usam SQLite descartável próprio para evitar
  contaminação entre clientes no Windows. PostgreSQL é uma instância de teste
  separada, acessível somente em loopback, sem credenciais produtivas.
- Decisão: o GET compatível usa o mesmo executor do POST, incluindo histórico,
  em vez de manter outro caminho de faturamento. Respostas públicas preservadas.
- Evidências finais e revisão: documento operacional de validação desta frente.
- Revisão corrigida: estado e chave da operação conservados entre telas,
  falha de histórico recuperável sem outra cobrança e custo original do
  ledger preservado. Resultados da sessão descartados ao sair. Tarifa
  carregada apenas nas telas de pesquisa, sem afetar o teste gratuito MCP.
- Validação final: suíte geral 562 aprovados/quatro ignorados, sete E2E
  específicos, 29 de compatibilidade MCP/fluxo principal e 38 checks de
  acessibilidade aprovados. PostgreSQL descartável: nove checks específicos
  e 12 gerais. Build, lint, typecheck e auditoria de dependências aprovados.
