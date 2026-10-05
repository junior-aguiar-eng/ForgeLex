# Publicação e homologação do contexto do caso — 05/10/2026

## Publicação confirmada das frentes 1 e 2

A PR #46 foi integrada em main após os seis jobs da CI aprovarem. PostgreSQL 16 aplicou as migrations 0025/0026, aprovou as 14 verificações do smoke, incluindo revisão e concorrência leitura/revogação de permissões, e as regressões de pesquisa. A CI de main também aprovou os seis jobs, 681 testes unitários (17 ignorados) e 113 testes de navegador.

Runtime inicial: SHA 7a216a8b0266a005e2438862140a106eac99ae23; revisão forgelex-api-prod-case-ai-7a216a8; Cloud Build 939c7821-3e19-4a98-8130-5bbb298e18eb. Imagem e digest constam no recibo JSON. Backup Cloud SQL 1791227152566 concluído antes das migrations aditivas; execução forgelex-case-ai-migrate-6lhfr concluída. AUTO_MIGRATE permanece desativado.

Candidata inicialmente sem tráfego; dez rotas verificadas pelo domínio com roteamento temporário e identidade corroborada em logs. Regra de rota, backend e NEG temporários removidos. Promoção 5%, 25%, 100%, com mais de 120 segundos por estágio e sondas readyz aprovadas. Rollback inicial: forgelex-api-prod-datajud-dbaf5cd. Rollback de tráfego não desfaz migrations aditivas.

## Aplicativos reais

Endpoint https://nexojuris.ia.br/mcp. Conexões OAuth existentes reutilizadas; listas de ferramentas atualizadas nos dois aplicativos sem nova concessão. Somente caso sintético, documento longo, documento excluído e um fato fictício. As marcações e o valor final não foram informados aos modelos antes da leitura.

ChatGPT: conexão gratuita confirmada às 19:05:28.749Z; lista sem permissão vazia e consulta direta negada. Com permissão explícita, manifesto de duas páginas e documento de nove páginas lidos até o fim, fato recebido e documento excluído recusado. Após revogação no site, lista vazia e novas leituras, inclusive cursores anteriores, recusadas. As nove leituras documentais foram corroboradas em auditoria de metadados.

Claude (Sonnet 5.5 Médio): conexão gratuita confirmada às 19:04:03.848Z. Lista inicial vazia e consulta direta recusada. Com sua própria permissão, manifesto de duas páginas, documento de nove páginas, marcações inicial/final, valor R$ 321,00 e fato recebidos. Documento excluído recusado. Após revogação no site, lista vazia e manifesto/leitura, com e sem os cursores antigos, recusados. A versão inicial apresentou um erro genérico do host na recusa; PR #47 corrige o envelope para resultado MCP isError=true, sem dados privados e com orientação explícita.

Auditoria de produção concluída às 19:57:15.404Z: 18 leituras bem-sucedidas do documento sintético (nove por aplicativo), ambas as permissões REVOKED na revisão 2 e zero operações financeiras desde 19:00Z. Consulta exata ao caso sintético em transação PostgreSQL READ ONLY; não foram executados fixtures, pesquisa faturável ou geração de documentos em produção.

## Correção integrada, publicada e ensaiada

A PR #47 contém a correção de recusa MCP (16b6c94) e a adaptação do E2E ao novo contrato (a60e0f5). Build, lint, 19 testes direcionados e três E2E locais passaram; a revisão independente não encontrou achados. Na CI 37367070410, validate, security, e2e-public e e2e-account-closure passaram. PostgreSQL e produto não conseguiram runner em três tentativas e foram cancelados antes de executar. As anotações confirmam "The job was not acquired by Runner of type hosted even after multiple attempts". Não confundir esse cancelamento com PostgreSQL aprovado para a correção: o gate verde da publicação inicial pertence ao SHA 7a216a8.

A reexecução da CI 37372822624 no head 3f0f808 aprovou os seis jobs e superou o bloqueio por runners. A PR #47 foi integrada no SHA def36afd551f57937893634b39eae28731f556ed, cuja CI de main 37380834265 também aprovou os seis jobs. Cloud Build aea2107e-98d1-4ce6-a5ef-f4b729fffaab concluído; imagem por digest registrada no recibo. Candidata sem tráfego, dez rotas com identidade exclusiva nos logs e promoção 5/25/100 concluídas. Runtime atual: forgelex-api-prod-case-ai-def36af, com 100% do tráfego; rollback: forgelex-api-prod-case-ai-7a216a8. Nenhuma nova migration. Rota/backend/NEG e tag temporários removidos; nenhum erro de servidor encontrado na janela final consultada.

Novas chamadas reais no ChatGPT e Claude confirmaram lista vazia, recusa do manifesto com cursor antigo e recusa documental com e sem cursor antigo. As três recusas por aplicativo receberam CASE_CONTEXT_NOT_AUTHORIZED e a orientação para conferir "Usar este caso na IA", sem conteúdo do caso. No Claude, os cartões reais das ferramentas mostraram os parâmetros e o corpo explicativo, substituindo o erro genérico anterior. Os hosts continuam identificando essas chamadas como erros de ferramenta, corretamente, porque o acesso permanece revogado; a correção torna o motivo legível. Não houve reautorização OAuth, pesquisa ou geração faturável neste reteste.

Jobs temporários de migration e inspeção, roteamento/backends/NEG temporários e tag da candidata foram removidos. O caso sintético foi preservado com as duas permissões revogadas; conteúdo recebido pelos hosts não é apagado pela revogação. O recibo JSON contém identidade da imagem, stages, checks e limites, sem segredos ou material de contas reais.

Limite: esta rodada não reinstala conectores nem refaz a concessão OAuth nativa. A proteção contra reaproveitamento de concessão antiga foi validada em testes automatizados. Retorno de produção ao Draft Studio permanece uma terceira frente separada.
