# ForgeLex 3 — correção local das falhas de entrega

Registro da preparação local. A calibração real subsequente, autorizada por Boni,
foi [executada e encerrada](2026-11-02-forgelex-recalibration-v6-results.md):
uma entrega limitada, duas falhas no candidato e três perguntas na versão inicial.
Os números de zero chamadas abaixo pertencem exclusivamente à correção local.

Data: 02/11/2026. Checkout `C:/Users/Boni Jr/.codex/worktrees/forgelex-3-audit/SDK`,
branch `codex/forgelex-3-quality`, HEAD `025f6dd438ecfd78079b4688fd076e476da74ce9`.
Escopo autorizado: identificar e corrigir localmente, preservando mesa e limites,
sem novas chamadas pagas. Alterações anteriores do worktree foram preservadas.

## Evidência e correção

O SDK fazia outra chamada ao modelo depois de `task.submit` aceito. Um teste com
o SDK instalado e transporte SSE simulado reproduziu a perda dessa entrega quando
a reserva financeira seguinte era recusada. Novos pedidos (estado v6, política
1.7.0) encerram o papel após submissão aceita e validada de ferramenta L0/L1.
Submissão rejeitada, exceção ou resultado `success: false` não encerram com sucesso.
Os contratos anteriores continuam usando seu comportamento e perfis originais.

Respostas terminais incompletas agora geram códigos específicos, como
`COMMERCIAL_OUTPUT_LIMIT`, antes de o SDK executar argumentos parciais. O consumo
informado pela API é liquidado primeiro; uma resposta liquidada não vira custo
incerto pelo simples fato de ser incompleta. Ausência de uso válido continua
sujeita ao controle de incerteza. Não há retry automático ou aumento do teto.

Erros conservam uma lista fechada de códigos e tipos, incluindo causas aninhadas,
até o resultado de avaliação. Mensagens, stack traces e dados arbitrários não
entram nesse diagnóstico. O erro público continua compatível com o contrato atual.

O resultado real do analista de D04 continha uma matriz probatória extensa em uma
tarefa de minuta. O schema v6 permite `evidenceAnalysis` somente ao analista de
`analyze_evidence`. A regressão usa aquela saída registrada: o schema de minuta
rejeita a matriz, enquanto o schema probatório continua aceitando-a. Os demais
campos substantivos são preservados. Instruções pedem concisão dentro dos mesmos
2048 tokens, com questões, fontes e ressalvas; não declaram conclusão por omissão.

## Limite do diagnóstico histórico

A campanha v5 registrou três `OPENAI_AGENT_ERROR`, sem mensagem terminal ou SSE
bruto suficiente para reconstruir a causa exata de cada um. D01 terminou com
2048 tokens, compatível com truncamento, mas isso sozinho não comprova a causa.
Os testes demonstram os caminhos de falha corrigidos; não provam retrospectivamente
que todos os três erros pagos tiveram essas causas. A indisponibilidade de pesquisa
no corpus fechado continua explícita e não foi contornada.

## Validação local

- 300 testes em 23 arquivos: núcleo, provider, workflow, transporte comercial,
  pesquisa, entrega utilizável, apresentação e controles financeiros.
- 15 testes Node de preparação, campanha e orçamento.
- Seis simulações com SDK real e transporte falso: todas concluídas. Versão
  inicial v1; candidato v6. Nenhuma chamada paga e nenhuma nota jurídica.
- Build dos 11 pacotes selecionados/dependências, typecheck da API, lint dos
  arquivos TypeScript alterados e `git diff --check` aprovados.
- Compatibilidade de checkpoints v3/v4/v5 e demais contratos antigos coberta
  pelos testes; o v5 não recebe silenciosamente a opção de encerramento v6.

Campanha offline: `2026-11-02-delivery-failures-v6-validated`.
Snapshot candidato: `0e3a73f025f50bd3fac4df984ef6e8e2b28caa7f0c3ff5d3e28a1f32142c1aa4`.
As respostas das simulações são programadas: não medem qualidade semântica,
consumo futuro, sucesso com o modelo real ou experiência E2E no navegador.

## Integridade e continuidade

Hashes comparados ao início desta correção confirmam frontend/mesa, módulo
financeiro e artefatos anteriores intactos. Políticas de orçamento, modelo,
limite de saída, pesquisa e autorização não foram ampliadas. Custos históricos
permanecem US$ 0,508974 calculados; zero novas chamadas pagas nesta correção.
Sem alteração de dependências, migration, commit, push ou deploy.

[Recibo e hashes](evidence/2026-11-02-delivery-failure-fix/validation.json).
[Comparação simulada](evidence/2026-11-02-delivery-failure-fix/offline/comparison.json).

Na conclusão desta preparação, a medição real e a avaliação por Boni permaneciam
pendentes. A medição posterior está no registro acima; a avaliação jurídica e
os 54 lugares restantes não foram encerrados por esta validação.
