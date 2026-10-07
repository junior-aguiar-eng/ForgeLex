# Julgados da pesquisa no caso

Em Pesquisa e na consulta da visão geral, cada resultado oferece **Salvar no
caso**. A pessoa escolhe explicitamente um caso ativo. O backend valida e guarda
o registro original, com ementa e proveniência; o frontend não fabrica hash ou
completa metadados ausentes. Duplicação retorna o registro já salvo. Gravar,
consultar o acervo e copiar uma citação não executam outra pesquisa faturável.

Em Casos, **Julgados do caso** permite ler a ementa, abrir a fonte retornada e
copiar a citação. Os julgados entram nos seletores já existentes de teses e
referências em Rascunhos e no contexto autorizado da IA. O vínculo é documental;
a pertinência jurídica exige análise e conferência humana.

O backend continua controlando tenant, permissões e lifecycle. Se o caso for
arquivado ou movido para a lixeira depois da seleção, salvar falha e conserva
o caso escolhido e a pesquisa. O acervo se vincula à identidade e ao caso da
resposta; uma troca não mostra o material da seleção anterior. A ação fecha com
Escape ou Fechar e devolve o foco. Não há mudança de schema, MCP ou preço.

Validação local em 07/10: teste de preservação da fonte RED/GREEN; E2E da ação
ausente RED, seguido de salvamento/deduplicação/arquivamento GREEN; suíte de
pesquisa 10/10. Cenário adicional em 390px: zero violações Axe no diálogo,
sem rolagem horizontal, cópia gratuita e julgado disponível no seletor da tese.
Imagem do ensaio sintético: [diálogo mobile](../operations/stabilization/assets/2026-10-07-save-case-mobile.png).
Dados e selo de verificação dessa imagem pertencem ao fixture; não comprovam
validação jurídica de um julgado real.

Integrado pela PR #58 e publicado em `forgelex-api-prod-audit-5aca51e`.
CI de main com seis jobs aprovados, incluindo os dez E2E de pesquisa. Rotas,
arquivos servidos, revisão/digest e tráfego foram verificados em produção.
Não houve novo ensaio autenticado de salvamento em produção nem pesquisa paga
nesta publicação; o comportamento autenticado está comprovado pelos E2E.
[Registro operacional](../operations/stabilization/2026-10-07-audit-remediation-publication.md).
