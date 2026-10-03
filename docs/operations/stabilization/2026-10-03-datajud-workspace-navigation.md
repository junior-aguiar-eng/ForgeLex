# Consulta processual dentro do espaço de trabalho

O menu lateral autenticado usava um link para `/consulta-processual`,
rota pública que renderiza o site externo. Esse caminho trocava o layout
e recarregava o documento, sem executar uma ação de logout.

O menu passa a selecionar a aba interna `datajud` em
`/app/consulta-processual`, pelo mesmo mecanismo das demais telas.
O formulário existente é reutilizado dentro do shell autenticado,
preservando o menu, a identificação da conta e a navegação do navegador.
No celular, a seleção fecha o menu lateral e devolve o foco ao botão.
A URL interna exige autenticação; `/consulta-processual` permanece
pública, gratuita e acessível sem cadastro. Nenhuma mudança de backend,
banco, contrato DataJud ou cobrança.

## Validação local

Quatro asserções de rota falharam antes da correção e passaram depois.
55 testes unitários de rotas, entrada e cliente DataJud aprovados.
16 E2E públicos/internos aprovados com autenticação, conta, saldo e
processo fictícios. Incluem seleção por teclado sem recarregar o
documento, sessão preservada após reload, voltar/avançar, título e item
ativo, layout desktop/mobile, menu mobile fechado e rota interna
protegida. A consulta interna envia uma chamada DataJud sem credencial
ou chave faturável; nenhuma operação paga ou logout nos testes.
As verificações de acessibilidade WCAG e largura passaram.
Build completo, lint e typecheck aprovados. Build web final aprovado
com importação compartilhada do formulário, sem duplicação de módulo.

## Publicação

Integração e implantação serão registradas aqui com SHA, imagem,
revisão, tráfego e rollback após os gates exigidos pelo repositório.
O checkout original com as alterações P2 permanece separado.
