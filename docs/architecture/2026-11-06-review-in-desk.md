# Revisão na própria mesa — 06/11/2026

Diretriz expressa de Boni: conversa e peça na mesma mesa, interface limpa,
sem encadear janelas de conferência, proposta editorial e decisão.

A revisão é apresentada dentro da folha editável. Um apontamento por vez,
com acesso ao trecho e pedido de ajuste pela conversa existente. Não há
importação de JSON, seleção de decisão ou formulário de fundamento nesse
fluxo. Fontes e limites ficam recolhidos. Histórico e conferências do caso
são consultados na mesa, sem sobreposição de diálogos editoriais.

O botão da revisão informa o teto em reais e explicita a cobrança da revisão
concluída. A execução atualiza seu andamento por consultas de estado, sem
repetir o comando pago. O recibo fica recolhido. Uma revisão concluída pode
ser repetida somente por novo clique explícito, com nova chave de comando.

“Aplicar esta sugestão” autoriza apenas o ajuste mostrado. Internamente,
reutiliza os contratos de decisão e aplicação, preservando versão original,
hashes, controle de concorrência e recuperação idempotente. Apontamentos
substantivos não têm aplicação automática; o usuário pode editar a peça ou
pedir mudanças na conversa. Edição não salva bloqueia cobrança e aplicação.

Os testes de navegador da interface antiga foram substituídos por cenários
do fluxo integrado. As verificações de contratos, isolamento, integridade e
concorrência no backend permanecem nas respectivas suítes.

Validação local: 9 testes de navegador da revisão e 5 testes gerais da mesa
aprovados. Build web, TypeScript e ESLint dos componentes alterados passaram.
As chamadas comerciais desses testes são simuladas, sem inferência paga.
