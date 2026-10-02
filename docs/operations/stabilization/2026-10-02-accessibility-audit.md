# Auditoria de acessibilidade — 02/10/2026

Referência: WCAG 2.1, níveis A/AA, https://www.w3.org/TR/WCAG21/.
Checkout SDK; matriz automática inicial executada no main c722b382; runtime inicial observado
forgelex-api-prod-guide-c722b382, digest 6868ee5844f68f355f02e97c5e4da50ddd3232c51a361b096bae171f77057a76.

## Evidência e escopo

- Chromium/axe: 38 cenários aprovados, desktop 1366 e largura 320; público,
  autenticação, pesquisa, casos, rascunhos, revisão, conta, conexão e segurança.
- Encerramento: quatro cenários aprovados, incluindo análise axe nos estados
  de confirmação e conclusão em 1366 e 320, somente contas locais descartáveis.
- Edge produtivo: guia, pesquisa, casos, rascunhos, revisão, conexão e conta
  inspecionados; títulos e landmarks observados; navegação por Enter, plataforma
  por Space, Tab do campo de consulta ao tribunal e foco com outline solid.
- Espaçamento temporário: line-height 1.5, letter-spacing .12em, word-spacing
  .16em e margem inferior dos parágrafos 2em. Revisão, conexão, conta, pesquisa,
  casos e rascunhos conservaram heading e não apresentaram overflow horizontal.
  Nenhum corte identificado na inspeção da revisão. CSS temporário removido.
- Leitor e zoom: declaração de Boni de funcionamento esperado aceita em
  02/10/2026. Software, percentual e páginas não informados; não inventados.

## Critérios: cobertura e limites

V = verificação observada no escopo acima; C = inspeção do código/estrutura;
D = declaração do responsável; L = limitação de cobertura; NA = conteúdo
não identificado no escopo. V não representa aprovação universal do critério.

| Critérios   | Evidência / resultado                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1.1       | V: axe e nomes acessíveis; imagens decorativas ocultas.                                                                                                      |
| 1.2.1–1.2.5 | NA: mídia temporal não identificada no escopo de telas.                                                                                                      |
| 1.3.1       | V: main único, labels e headings na matriz.                                                                                                                  |
| 1.3.2       | V parcial: ordem DOM e foco nas rotas observadas.                                                                                                            |
| 1.3.3       | C: instruções nomeiam controles; não dependem apenas de posição/cor.                                                                                         |
| 1.3.4       | C/V parcial: layout 320/1366 sem bloqueio de orientação identificado.                                                                                        |
| 1.3.5       | C: autocomplete name/email/current-password/new-password em AuthScreen.                                                                                      |
| 1.4.1       | C/V: textos e ícones acompanham estados, saldo e erros.                                                                                                      |
| 1.4.2       | NA: áudio automático não identificado.                                                                                                                       |
| 1.4.3       | V: análise axe sem violações nas matrizes, respeitando seus limites.                                                                                         |
| 1.4.4       | D: zoom validado por Boni; percentual não informado.                                                                                                         |
| 1.4.5       | C: conteúdo textual HTML; marca gráfica permanece exceção de logotipo.                                                                                       |
| 1.4.10      | V: matriz de largura 320 sem overflow horizontal nas páginas testadas.                                                                                       |
| 1.4.11      | C/V parcial: foco sólido observado; contraste de todos os componentes não medido manualmente.                                                                |
| 1.4.12      | V: override nos 38 cenários e estados de encerramento; screenshots revisadas no recorte indicado abaixo. Não implica todos os estados possíveis.             |
| 1.4.13      | C parcial: title nativo no menu; tooltip customizado não identificado. Estados de hover/foco não enumerados integralmente.                                   |
| 2.1.1       | V parcial: navegação, seleção de plataforma e modal automatizado; todas as ações de edição não exercitadas manualmente.                                      |
| 2.1.2       | V: modal com Tab/Shift+Tab, Escape e retorno de foco na matriz.                                                                                              |
| 2.1.4       | C: handlers locais usam teclas de navegação/ativação; atalho global de caractere não identificado.                                                           |
| 2.2.1       | L: expiração de sessão e continuidade de edição longa não ensaiadas nesta frente.                                                                            |
| 2.2.2       | C parcial: polling de status não equivale a carrossel/mídia; todos os mecanismos automáticos não enumerados manualmente.                                     |
| 2.3.1       | C: flashes não identificados; nenhum ensaio instrumental de luminância.                                                                                      |
| 2.4.1       | V parcial: main/navegações nomeados; atalho explícito de pular blocos não observado no workspace.                                                            |
| 2.4.2       | V: títulos de guia, pesquisa, casos, rascunhos e revisão observados.                                                                                         |
| 2.4.3       | V parcial: ordem do campo de consulta/tribunal e foco dos modais.                                                                                            |
| 2.4.4       | V: links com propósito acessível na matriz e no guia.                                                                                                        |
| 2.4.5       | V: menu principal, sidebar, guia e links internos oferecem acesso às rotas.                                                                                  |
| 2.4.6       | V: h1 único e labels verificadas.                                                                                                                            |
| 2.4.7       | V/C: outline solid observado, regra global focus-visible 3px.                                                                                                |
| 2.5.1       | C: ações não exigem gesto multiponto ou trajetória.                                                                                                          |
| 2.5.2       | C: ações principais por click, sem execução financeira por pointer-down identificada.                                                                        |
| 2.5.3       | V: nomes acessíveis dos controles cobertos por axe e inspeção.                                                                                               |
| 2.5.4       | NA: atuação por movimento do dispositivo não identificada.                                                                                                   |
| 3.1.1       | V: lang pt-BR no documento.                                                                                                                                  |
| 3.1.2       | L: trechos estrangeiros/documentos jurídicos não enumerados integralmente.                                                                                   |
| 3.2.1       | V parcial: Tab manteve contexto; navegação depende de ativação.                                                                                              |
| 3.2.2       | C/V: pesquisa depende de submit/Consultar; escolha de plataforma troca roteiro explicitamente.                                                               |
| 3.2.3       | V: navegação consistente nas telas observadas.                                                                                                               |
| 3.2.4       | V: controles compartilhados preservam nomes/funções.                                                                                                         |
| 3.3.1       | C/V: AuthScreen e APIs usam role alert; todos os erros externos não disparados.                                                                              |
| 3.3.2       | V: labels/instruções na matriz.                                                                                                                              |
| 3.3.3       | C parcial: orientação de recuperação e erros; todas as rejeições externas não ensaiadas.                                                                     |
| 3.3.4       | V parcial: confirmação de encerramento em fixture; Pix real pago como convidado por Boni, conciliado e refletido na UI. Checkout externo fora da matriz axe. |
| 4.1.1       | L: axe 4.13 não inclui as regras obsoletas de parsing nas tags selecionadas; não afirmar aprovação integral de 4.1.1.                                        |
| 4.1.2       | V: nomes, roles, valores; seleção do roteiro por aria-pressed.                                                                                               |
| 4.1.3       | C/V parcial: status/alert em conexão, autenticação e API; alcance de leitura por AT não instrumentado pelo agente.                                           |

Não foi emitida declaração de conformidade integral AA. A auditoria tem
cobertura explícita das superfícies e critérios, mas conserva as limitações
acima; não transforma teste automático em certificação.

## Incidente de publicação

Uma aba com bundle da revisão anterior tentou importar ResearchDeskScreen-Dd1OeBpz.js
após a promoção e ficou sem conteúdo. Console confirmou falha de importação
às 14:59:34Z. Recarregar recuperou Pesquisa com trilha de proveniência e controles.
Tratamento de aba antiga durante deploy é pendência de resiliência, responsável
engenharia ForgeLex/Boni; não atribuir a acessibilidade nem alegar correção automática.

## Ampliação focal e defeitos demonstrados

Em 02/10, o override de espaçamento foi aplicado também à matriz automática:
line-height 1.5, letter-spacing .12em, word-spacing .16em, parágrafos 2em.
A página inicial em 320 px falhou (largura do Hero 345,83 px); os itens grid/flex
preservavam min-content de palavras longas. min-w-0 e break-words corrigiram a
contração e quebra. Nova execução: 38/38 aprovados. O recibo de encerramento
em 320 px também falhou sob espaçamento; quebra de palavras foi aplicada ao
conteúdo do acompanhamento. Nova execução de encerramento: 4/4 aprovados, incluindo 320/1366 e bloqueio/retomada. Correções publicadas e verificadas em produção conforme registro final abaixo.

A verificação automática mede overflow e regras axe; não prova ausência de
corte vertical, sobreposição e perda de função em todos os estados. A inspeção
visual focal e a declaração de leitor/zoom de Boni mantêm escopos distintos.
O gate exige zero defeito crítico e claims restritas à cobertura demonstrada;
não se está emitindo certificação integral AA.

Pendência P2 de publicação em aba antiga: responsável engenharia ForgeLex/Boni,
revisão até 09/10/2026; recuperação observada por reload, sem alegar correção.

Inspeção visual do recibo 320 px sob override: referência, estado, datas,
instruções e botão de exportar íntegros, com quebra e sem corte identificado.
Capturas locais sintéticas preservadas em test-results; não são conta produtiva.

Amostra adicional após correção: 4/4 testes focais em 320 px; capturas de
Home, rascunho com seções/caso carregados e modal de revisão inspecionadas,
sem corte ou sobreposição identificados no conteúdo e controles apresentados.
Não extrapolar essa inspeção para estados/documentos não ensaiados.

## Publicação e conclusão da auditoria

Runtime b6c893c48ed99bca12216db9df1578cd57d344a9, revisão
forgelex-api-prod-a11y-b6c893c4 a 100% após promoção concluída em 17:03:40Z.
Origem da correção PR #27; CI branch/main aprovados. Home produtiva em 320 px com
override: scrollWidth 346 antes, 320 depois, Hero min-w-0/break-words observado.
Acompanhamento produtivo sem recibo: scrollWidth 320, container break-words;
nenhum encerramento real executado. Capturas visuais inspecionadas; overrides
CSS e viewport retirados. Recibo e demais estados permanecem validação local.

Auditoria encerrada no escopo e limites enumerados. Zero defeito crítico
identificado nesse recorte, regressões focalmente corrigidas e publicadas.
A declaração de leitor/zoom de Boni é preservada com a precisão disponível.
Não foi emitida declaração integral de conformidade AA.
