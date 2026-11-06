# Consistência aritmética na revisão editorial — 06/11/2026

Estado: correção local, ainda não publicada. Nenhuma nova revisão paga executada.

## Evidência e causa

A revisão sintética `f9f6eaf7-dffa-407c-80df-8460ccee9dc1`, com perfil
`1.0.0`, recebeu três parcelas de R$ 100,00 e total declarado de R$ 200,00.
O resultado preservou os valores “sem validação”, sem apontar que o produto
é R$ 300,00. O contrato vedava alterações de valores, mas não exigia
explicitamente a conferência aritmética; o fluxo validava formato, hashes e
âncoras, sem uma checagem local dessa relação. Isso demonstra uma lacuna do
fluxo, não o raciocínio interno do modelo.

## Correção

O perfil `1.1.0` exige apontar conflitos aritméticos concretos nas sugestões
substantivas, sem patch de valores. A preparação do contexto de peças da mesa
(`DESK_VERSION`) também calcula localmente relações explícitas e adjacentes
entre quantidade de parcelas, valor unitário e total. Usa centavos inteiros;
o exemplo gera alerta de 3 × R$ 100,00 = R$ 300,00 versus R$ 200,00.

O alerta integra os findings exibidos pela revisão, mesmo se a proposta da IA
não mencionar a divergência. Não altera o documento, não aplica sugestões,
não reescreve recibos e não faz chamadas adicionais ao provedor. Recalcula a
partir da versão salva; não reconstrói auditorias de entregas históricas.

## Limites

A checagem local reconhece uma família delimitada de expressões de parcelas
em português e valores em reais. Não é um verificador universal de contas,
tabelas, descontos, juros ou linguagem livre. Não combina parágrafos ou
seções distintos. A ausência de alerta não prova consistência financeira.
O alerta é condicional a não haver acréscimos ou abatimentos e não valida
fatos nem o valor juridicamente devido. Acima de 50 divergências, informa
explicitamente que há pontos adicionais não detalhados.

Os novos findings alteram o contexto de revisão de versões afetadas; após
uma eventual publicação, revisões em andamento podem exigir atualização.
A proposta e o recibo do ensaio anterior continuam como evidência histórica.

## Validação local

Testes determinísticos cobrem o exemplo, centavos, valores agrupados,
quantidades por extenso, totais corretos, fronteiras de parágrafos/seções,
expressões fora do escopo e limite de alertas. Um teste com FakeAgentProvider
omite deliberadamente a inconsistência e verifica que o preview ainda contém
o alerta, preservando o snapshot e sem gravações ou aplicação.

Resultado: 142 testes aprovados em seis arquivos (editor, contratos, rotas e
fluxo comercial com provedores simulados). Build e typecheck de legal-agents
e legal-workflows aprovados; ESLint dos arquivos alterados sem erros.
