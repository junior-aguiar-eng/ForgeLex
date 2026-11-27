# Textos legais no modelo novo: lacunas e proposta (V5A) — 18/11/2026

**Não altera nenhum documento legal.** Os quatro textos de `apps/web/public/legal/` ficam como estão; a aprovação do que muda é de
Boni. Este documento só levanta o que os textos dizem hoje, o que o modelo novo (MCP e Mesa) acrescenta de fato e uma redação
proposta para Boni aprovar, ajustar ou recusar. Regra: descrever apenas o que acontece.

## O que os textos dizem hoje

| Documento | Fala de |
| --------- | ------- |
| Termos de uso | O host ou provedor de IA fornece o modelo do usuário e cobra à parte; pesquisa faturável; consulta processual gratuita sem histórico. |
| Privacidade | Dados de conta e cobrança, eventos operacionais e de segurança; a IA do usuário e o que o ForgeLex recebe por chamada; casos e itens que o usuário seleciona. |
| Retenção pós-encerramento | "Conteúdo jurídico privado, inclusive documentos, pesquisas, mensagens, rascunhos e histórico": exclusão do conteúdo. |
| Encerramento de conta | Procedimento e prazos; nada específico de Mesa. |

Nenhum menciona a **Mesa de trabalho**, os **anexos** nem o fato de que, na Mesa, a orientação é produzida por um modelo contratado
pelo ForgeLex (e não pela IA do usuário).

## Fatos do modelo novo que os textos precisam refletir

| Fato | Fonte |
| ---- | ----- |
| Na Mesa, o arquivo anexado (PDF, TXT, MD) **não é enviado nem guardado**; só o texto extraído segue com o pedido, somado ao contexto escrito, com teto de 80.000 caracteres nos anexos e 100.000 no pedido. | DEC-12; registro de execução, seção dos anexos. |
| A extração do texto do PDF acontece no navegador. | Registro de execução, seção dos anexos. |
| A orientação da Mesa roda em modelo do **ForgeLex no servidor**, não na IA do usuário. O código do piloto fechado usa OpenAI (`real-provider.ts`, `PILOT_POLICY`). | `apps/api/src/agentic-workspace/closed-pilot.ts`. |
| Conversas, peças e versões ficam na conta, sob a retenção já descrita. | Retenção pós-encerramento. |
| OCR no navegador e Word **não** estão no ar para clientes; não entram nos textos. | Regra da V5A. |

## Lacunas

1. **Terceiro que processa o texto.** A política de privacidade não diz que, na Mesa, o texto do pedido e dos anexos é enviado a um
   provedor de modelo contratado pelo ForgeLex. É a lacuna principal.
2. **Natureza do anexo.** Falta dizer que o arquivo não é guardado e que o texto extraído é.
3. **Termos.** Falta definir a Mesa como orientação, sem substituir a decisão jurídica e a conferência do usuário, e dizer como ela é
   cobrada (depende da tarifa da Mesa, ainda sem valor publicado).
4. **Retenção.** Conferir se "documentos, mensagens, rascunhos e histórico" cobre o texto extraído dos anexos e as versões das peças.

## Redação proposta (para Boni decidir)

**Termos de uso, nova cláusula "Mesa de trabalho":**
> A Mesa de trabalho do ForgeLex orienta a elaboração e a revisão de peças a partir do texto que você escreve e dos anexos que
> você escolhe (PDF, texto ou Markdown). A orientação é auxílio: a decisão jurídica, a conferência das fontes e o uso do
> resultado são de sua responsabilidade. [Tarifa da Mesa: inserir só quando houver valor publicado.]

**Política de privacidade, nova seção "Mesa de trabalho e anexos":**
> Ao enviar um pedido na Mesa, o ForgeLex trata o texto do pedido e o texto extraído dos anexos que você escolheu. O arquivo
> anexado não é enviado nem guardado; só o texto extraído acompanha o pedido. Para produzir a orientação, esse texto é enviado a
> um provedor de modelo de IA contratado pelo ForgeLex, [nome do provedor e condições: Boni confirma]. A conversa, as peças e
> as versões ficam na sua conta e seguem a retenção descrita neste documento.

**Retenção pós-encerramento:** nenhuma mudança se Boni confirmar que o texto extraído dos anexos fica na categoria "documentos".

## O que depende de Boni

1. Aprovar, ajustar ou recusar cada redação acima.
2. Confirmar o **nome do provedor** do modelo da Mesa e se o contrato dele proíbe treino com os dados e fixa prazo de retenção.
3. Confirmar **onde** o texto extraído do anexo fica guardado no ForgeLex e por quanto tempo, para decidir se a retenção cobre.
4. Dizer se a Mesa terá tarifa própria e qual (A24), para a cláusula de cobrança.

Os textos só devem mudar na mesma publicação em que o texto do site no modelo novo for ligado.

## Aplicação (27/11/2026)

Aprovado por Boni em 27/11/2026 e aplicado em `termos-de-uso.html` e `privacidade.html`, versão `2026-11-27.v1`. Na
aplicação apareceu que os dois textos **já** descreviam o envio à OpenAI no “trabalho nativo”, com armazenamento de
resposta desligado, registros de abuso por até 30 dias e sem compartilhamento voluntário para treinamento; a lacuna
principal de 18/11 estava superestimada. O que mudou: o nome “Mesa de trabalho”, a reserva de R$ 11,50 (estava R$ 5,00;
`COMMERCIAL_POLICY.reserveCents = 1150`), os anexos como texto extraído (até 100.000 caracteres) e a leitura dos casos
ativos pela IA conectada (decisão de 26/11). Retenção e encerramento sem mudança.
