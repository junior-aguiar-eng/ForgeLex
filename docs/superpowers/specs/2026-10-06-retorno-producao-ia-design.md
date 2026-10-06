# Terceira frente: receber a produção da IA no editor

## Resultado para o cliente

O cliente trabalha no ChatGPT ou Claude com seu próprio aplicativo e pede
“Salve este texto no ForgeLex”. O texto chega ao editor como uma versão
recebida, com origem, referências e o aviso **Aguardando revisão**.
Receber o texto é gratuito. Não exige chave de API nem geração no servidor.

Em um rascunho existente, a versão recebida fica disponível para conferir:
não troca a versão de trabalho nem modifica um formulário aberto.
O cliente abre **Ver texto recebido** e escolhe **Usar esta versão** quando
quiser adotá-la. Versões anteriores e suas revisões são preservadas.
Se o destino for um novo rascunho, ele nasce com a versão recebida e sem
conferência ou aprovação concluída.

## Base verificada e motivo da extensão

Checkout: `C:/Users/Boni Jr/.codex/worktrees/draft-review/SDK`.
Base confirmada em 06/10/2026: `origin/main` e HEAD
`9e74b7f29ccc2be04d0a702c541149ea0d789875`; remoto ForgeLex existente.
Nenhuma alteração do checkout original SDK é transportada para esta frente.

`DraftRepository.createVersion` preserva o histórico, mas atualiza título,
status e `currentVersionId` automaticamente. A numeração também é calculada
antes da transação. O recebimento externo exige uma operação própria,
transacional, que serialize escritores e mantenha a versão atual.

As três ferramentas `case.*` são de leitura. A autorização existente não
permite escrita. O caminho de execução registra `readOnly:true` e revalida
a permissão antes de responder; ele não deve ser reutilizado como se uma
mutação fosse observação. O núcleo possui vínculos de fatos/provas/fontes/
teses e revisões por versão; a terceira frente estende esses contratos.

## Permissão simples e destino explícito

No painel **Usar este caso na IA**, acrescentar a opção
**Permitir que esta IA envie textos ao editor**, desmarcada por padrão.
Quando marcada, mostrar somente a escolha do destino: **Novo rascunho**
ou um rascunho existente daquele caso, escolhido pelo cliente.
O aplicativo não pode escolher outro destino nem autorizar a si próprio.

A permissão segue tenant, usuário, caso, cliente OAuth, `granted_at` e
revisão já usados pela segunda frente. A seleção de materiais continua
controlando quais IDs podem ser declarados como referências.
Permissões atuais migram com recebimento desabilitado. Revogar acesso,
desabilitar recebimento ou trocar a concessão OAuth impede novos envios e
replays; não apaga textos já recebidos. Alterações em outra aba exigem
atualização e reaplicação explícita, preservando as escolhas locais.

Não instalar ou reautorizar conectores durante a implementação local.
Uma concessão OAuth real nova ou materialmente ampliada deve ser tratada no
momento da homologação, com confirmação pontual quando aplicável.

## Contrato externo

Adicionar a ferramenta `draft.save_from_ai`, mutação interna gratuita,
com `readOnlyHint:false`, `destructiveHint:false`, `idempotentHint:true`
e `openWorldHint:false`. Não expor as ferramentas internas de drafting.
Preservar o comportamento e as anotações das três ferramentas de leitura.

O manifesto do caso pode informar a capacidade de envio e o destino
autorizado, apenas com metadados; não expõe textos de rascunhos existentes.
As instruções copiadas do painel explicam a ferramenta, o destino e que o
modelo deve reutilizar a mesma chave quando repetir o mesmo envio.

Entrada: `matterId`, `idempotencyKey`, título, seções ordenadas com conteúdo,
referências por seção e revisão da permissão observada no manifesto.
O destino vem da permissão, nunca de um `draftId` livre fornecido pelo host.
Não aceitar identidade, aprovação ou `verified:true` nos argumentos.

Limites iniciais: título e títulos de seção até 200 caracteres; 1 a 100
seções com ordinais únicos; até 500 referências; notas opcionais até 2.000
caracteres; corpo completo até 512 KiB em UTF-8; chave entre 16 e 128
caracteres. Rejeitar texto vazio, ordinais repetidos, propriedades extras e
conteúdo excedente, sem truncar nem receber parcialmente.

As referências usam apenas IDs existentes na seleção autorizada do caso.
Documentos incluem a versão selecionada e, quando informado, uma âncora
dessa versão. Fatos, provas, teses e fontes usam os contratos do núcleo.
Vínculo inválido ou fora da seleção recusa todo o envio, sem revelar título
ou conteúdo do item recusado. Referências ausentes não são inventadas:
um texto sem referências pode ser recebido, mas permanece sem conferência.

Resposta pequena, até 24 KiB: identificação do rascunho e versão, origem,
estado de recebimento, se é repetição e caminho para abrir no site.
Não devolver o texto integral nem saldo. Cobrança zero sem acessar carteira
ou o replay privado do ledger. Erros de ferramenta usam `isError:true` e
orientação legível, como na correção homologada da segunda frente.

## Persistência, concorrência e referências

Migration aditiva cria recibos de envio vinculados à versão, com chave,
hash canônico do payload, identidade/concessão/revisão de autorização,
destino, data e referências documentais na versão correta. Inclui campos
de permissão de recebimento e destino; dados existentes não ganham escrita.
O encerramento de conta remove esses registros junto com o rascunho.

Uma transação cria recibo, rascunho novo quando necessário, versão, seções
e vínculos. Falha em qualquer etapa desfaz tudo. Uma restrição única para
tenant/usuário/cliente/concessão/caso/chave impede duplicação concorrente.
Mesmo envio e chave retornam o recibo anterior, somente com permissão ainda
ativa e compatível; mesma chave com payload diferente retorna conflito.
Não deduplicar textos deliberadamente reenviados com outra chave.

Serializar a numeração por rascunho, também diante de edição humana
simultânea. A escrita externa não altera título, status, versão atual ou
aprovações de um rascunho existente. O recibo marca a versão recebida;
o estado de domínio permanece `DRAFT`, sem run completo nem aprovação.

Revalidar a concessão OAuth antes da operação e a revisão/permissão no
commit, sob a mesma disciplina de lock usada pela revogação. Revogação
confirmada antes do commit impede a escrita. Commit concluído antes da
revogação permanece no histórico. Não prometer atomicidade entre o banco
local e o provedor OAuth remoto: confirmação persistida tem precedência
sobre um erro de rede na entrega da resposta, recuperável pela mesma chave.

Fatos/provas/fontes recebem vínculos nativos; todas as citações recebidas
permanecem não verificadas. Referências diretas a documentos e versões
ficam no recibo versionado, aparecem na conferência e entram no contexto
de revisão. Não converter uma referência documental em prova de fato nem
substituir a versão selecionada pela versão documental mais recente.

Auditoria registra somente metadados: IDs, resultado, revisão, hash e
replay. Não registrar payload, notas, texto, chave bruta ou credenciais.
Uma falha de resposta/auditoria posterior ao commit não dispara uma segunda
escrita; o cliente recupera o recibo com a mesma chave após revalidação.

## Editor e adoção humana

O editor mostra um aviso discreto **Texto recebido da IA — Aguardando revisão**
e **Ver texto recebido**, com origem/data nas versões. Abrir o texto é uma
visualização; não descarta edição local nem troca automaticamente o caso.
Não usar polling que substitua o formulário. A consulta de novas versões
atualiza metadados, preserva o buffer e ignora respostas de outro caso.

**Usar esta versão** exige sessão web e comparação com a versão atual
observada. Se houver edição local não salva, o usuário salva ou descarta
explicitamente antes de trocar. Se outra aba alterou a versão atual, mostrar
conflito e atualizar o estado; não adotar silenciosamente. A adoção não
significa aprovação, não altera versões anteriores e exige conferência da
versão/contexto antes de aprovação para uso externo.

Reusar histórico, edição, conferência e exportação DOCX/PDF existentes.
Sem nova tela principal, termos técnicos nos controles, fluxo de publicação
externa, alteração de faturamento de pesquisa ou aprovação pela IA.

## Evidência necessária para concluir

- Testes negativos de tenant/usuário/cliente/concessão/caso/destino,
  escrita desabilitada, revogação e referências excluídas/versionadas.
- PostgreSQL isolado: migrations idempotentes, replay simultâneo, conflito
  de chave, numeração com escrita humana simultânea, rollback sem órfãos e
  disputa envio/revogação. SQLite local não substitui essa validação.
- MCP: ferramenta de escrita corretamente anotada, envelope explicativo,
  cobrança zero, saída limitada e ausência de conteúdo privado em erros.
- Navegador: escolha explícita de destino, recebimento sem substituir o
  formulário, visualização, conflito de adoção, revisão pendente, histórico,
  referências e DOCX/PDF. Continuar usando testes existentes onde adequado.
- Build, lint, typecheck e regressões proporcionais; revisão independente
  da alteração antes de integração, conforme workflow aplicado à execução.
- Integração/publicação e homologação de escrita reais são etapas distintas:
  caso sintético, ChatGPT e Claude separadamente, envio, replay, conferência
  no editor e recusa após revogação. Não declarar esses ensaios como feitos
  com base em CI ou simulação local.

## Situação desta especificação

Especificação e execução local aprovadas por Boni em 06/10/2026.
Implementação, migration em banco de testes e revisão independente concluídas
na branch `codex/retorno-producao-ia`; registro em
`docs/product/draft-ai-receiving-validation.md`. O nome específico do aplicativo
no editor permanece como ponto menor adiado. Integração, migration de produção,
publicação e homologação real desta escrita concluídas pela PR #49 em 06/10/2026;
evidências em `docs/operations/stabilization/2026-10-06-draft-ai-publication.md`.
