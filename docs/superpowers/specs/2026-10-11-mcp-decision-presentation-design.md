# ForgeLex — apresentação de decisões no MCP

11/10/2026. Desenho solicitado por Boni para avaliação visual antes de implementar.
Base local: `codex/case-flow-simplification`, `101ee331`, com alterações anteriores
preservadas. Sem implementação, commit, push, instalação, pesquisa cobrada ou deploy.

## Resultado pretendido

O cliente lê a análise do modelo host e confere a decisão em um leitor do ForgeLex,
sem pedir novamente a ementa, copiar resultados entre telas ou coordenar tools.
O ForgeLex fornece dados e apresentação; a síntese do ChatGPT/Claude continua do
modelo externo. Não atribuir raciocínio jurídico próprio ao componente visual.

## Experiência

- Uma decisão aberta por vez. Cabeçalho: identificação e tribunal; relatoria,
  órgão julgador e datas de julgamento/publicação com rótulos distintos.
- Ementa disponível exposta para leitura, com parágrafos preservados. Não cortar
  silenciosamente itens nem trocar texto por síntese. Se houver apenas trecho,
  indicá-lo; ausência do texto é diferente de ausência de resultado de pesquisa.
- Para várias decisões selecionadas: anterior/próxima e posição na seleção.
  Navegar na seleção não pesquisa novamente, não cobra e não duplica widgets.
- Cópia da citação e origem/fonte são as ações iniciais. Metadados de proveniência
  sob demanda; usar o estado real, sem selo universal de fonte verificada.
- Inteiro teor abre link oficial existente. Sem relatório/votos recuperados,
  não apresentar esses conteúdos como disponíveis. Não extrair automaticamente
  um dispositivo de campo genérico nem classificá-lo sem proveniência própria.
- Salvar no caso usa o fluxo do site já existente, quando o usuário o solicitar;
  primeiro incremento MCP visual permanece de leitura e sem nova tool de escrita.
- Leitura embutida e painel/expansão quando suportados. O host controla a posição
  e os modos; não prometer painel lateral idêntico em todo cliente MCP.
- No mobile, empilhar conversa/leitor; sem colunas espremidas ou barra repetida.
  Teclado, foco, texto selecionável e temas claro/escuro são obrigatórios.

## Opções e direção proposta

1. **Leitor compartilhado + adapter MCP Apps (recomendado):** extrair núcleo de
   apresentação passiva reutilizado pelo site e por um bundle leve do MCP.
2. **Somente instruções de formatação ao host:** barato, mas deixa reprodução e
   apresentação da fonte dependentes da redação do modelo; não atende ao objetivo.
3. **Iframe do site completo:** reaproveitamento aparente com acoplamento a sessão,
   navegação e rotas de casos; desnecessário para leitura de decisões.

## Reaproveitamento demonstrado

| Existe | Uso proposto | Adaptação necessária |
| --- | --- | --- |
| `CaseLawSchema`, `SearchResultItem` e proveniência | Identificação, ementa, datas e fonte | DTO mínimo do leitor, sem inventar campos |
| `ResearchService` e corpus persistido | Mesmo material da pesquisa | Leitura por recordId/versionId, não processo isolado |
| `ResearchDeskScreen` | Estilo e apresentação dos resultados | Abrir núcleo comum sem recriar serviço de pesquisa |
| `DocumentReaderDialog` | Comportamentos de foco, leitura e erro | Separar apresentação de API autenticada do caso |
| `CopyCitationButton` | Formatação/cópia e tratamento de falha | Núcleo sem dependência do contexto de conta |
| `SaveAuthorityToCase` | Salvamento autorizado no site | Preservar serviço; fora do bundle MCP inicial |
| `McpHandler`, catálogo externo, OAuth e ledger | Distribuição e controles existentes | Recursos UI e render tool aditivos, atrás de flag |

## Contrato e responsabilidade da fonte

Proposta: `research.present_decisions({ items: [{ recordId, versionId }], idempotencyKey? })`, com
1–20 referências distintas. O modelo escolhe referências, não envia ementa,
relatoria, datas ou URL para o componente. Servidor lê registros publicados e
autorizados por identidade/versão e rejeita entrada com conteúdo adicional.

O domínio atual possui id/dedupeKey, mas a resposta de pesquisa não fixa versionId.
Antes do reader real, adicionar projeção aditiva dessa identidade e lookup exato.
Não usar `getByProcessNumber(...).limit(1)` para decidir qual acórdão exibir.
A divergência afetação/mérito relatada na conversa é hipótese a reproduzir; o novo
contrato deve testar expressamente duas decisões do mesmo processo.

DTO `DecisionPresentation`: `schemaVersion: 1`, referências resolvidas, itens,
itens indisponíveis e limites. Cada item contém identidade/versão, metadados,
texto da ementa como retornado, estado de completude (`AS_RETURNED`, `TRUNCATED`,
`UNAVAILABLE`), URL oficial opcional e proveniência disponível. `AS_RETURNED`
não certifica integralidade da decisão; não criar selo de atualidade/cabimento.
Estado não conhecido não pode ser convertido em `VERIFIED_OFFICIAL`.

Tool exclusivamente de leitura com política `FREE` explícita. Recuperação local e
navegação não executam pesquisa faturável, ingestão ou nova consulta ao tribunal.
Sem alteração do preço/comportamento das tools atuais ou envio privado ao host.
Histórico indisponível deve aparecer como indisponível, sem trocar pela versão atual.

## UI, compatibilidade e segurança

MCP Apps: recurso versionado `ui://forgelex/decisions/v1`, MIME
`text/html;profile=mcp-app` e vínculo `_meta.ui.resourceUri` somente na tool de
apresentação. Adapter de compatibilidade ChatGPT quando necessário, sem vincular
pesquisas intermediárias a novos componentes. A flag proposta
`FORGELEX_MCP_DECISION_UI_ENABLED` começa desligada.

Manter conteúdo textual útil mesmo quando o host não apresenta UI; o modo textual
também identifica trechos/truncamento. A visualização não deve retirar dados das
tools que os hosts já usam. Capabilities/resources são aditivos; testar os métodos
de recursos no handler existente, sem trocar todo o transporte ou protocolVersion
por conveniência. Recurso visual estático não contém credenciais nem decisões.

Texto/URLs/metadados são dados não confiáveis: renderizar texto escapado, links
validar protocolo/domínio da fonte. Bridge valida origem/esquema; CSP mínima e
bundle autocontido, sem importar o app autenticado, tokens, storage ou analytics.
Nenhuma permissão nova é consequência de abrir o componente. Comportamento de
reabertura histórica deve ser homologado no host; estado vazio não fabrica fonte.

## Critérios para aprovar implementação

1. Boni consegue conferir ementa sem solicitar nova resposta do modelo.
2. Troca entre decisões mantém número, datas, texto e versão correspondentes.
3. Citação copia a decisão selecionada; falha de clipboard oferece texto selecionável.
4. Fonte não verificada, texto parcial e inteiro teor ausente são distinguíveis.
5. Uma seleção gera um leitor; sem excesso de ações ou painel de agentes.
6. UI indisponível mantém pesquisa/leitura textual; nove tools atuais preservadas
   com flag desligada, OAuth e cobrança de pesquisa sem regressão.

## Prévia e referências

`forgelex-mcp-decisions-preview.html`, no diretório de visualizações da conversa.
Dois arranjos: **Painel ao lado da conversa** e **Leitor na conversa**. Primeiro
registro transcrito da imagem enviada por Boni; segundo contém somente cabeçalho
de ementa disponível na conversa compartilhada, identificado como trecho. Sem
consulta ao corpus, certificação de fonte ou recuperação do inteiro teor.
A fala ilustrativa do host não é saída de um agente do ForgeLex.

A aba **Resultado do julgamento** ilustra uma seção expressamente rotulada na
imagem enviada, não um campo já disponível em `CaseLaw`. No primeiro incremento
real só será exibida se houver conteúdo próprio identificado na fonte/contrato;
ementa e link atuais não autorizam inventar ou extrair esse campo automaticamente.

Referências técnicas oficiais consultadas em 11/10/2026:
[MCP Apps](https://apps.extensions.modelcontextprotocol.io/api/documents/Overview.html)
e [UI no MCP da OpenAI](https://developers.openai.com/plugins/build/chatgpt-ui).
Essas referências fundamentam recursos/bridge e compatibilidade; não homologam
o servidor ForgeLex nem garantem um modo visual em todo host.
# Adendo de escopo — 11/10/2026

A implementação atual segue o plano `2026-10-11-saved-research-mcp-reader.md`.
As restrições históricas de leitura abaixo são substituídas exclusivamente para
salvar e excluir pesquisas completas na coleção de seis vagas. A apresentação
usa também a mesma coleção no site, com autorização específica por conexão.
Os casos, a orquestração agêntica, novos fornecedores e análise própria de IA
continuam fora deste incremento.

