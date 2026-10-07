# Identificar conexões de IA no caso

Incremento de 07/10/2026, versionado na branch `codex/case-ai-connection-identity`, base
`94395245b5bb44444c1f081121a106b1665d9124`. Ainda não integrado ou publicado.

## Comportamento

Em **Usar este caso na IA**, a escolha do aplicativo mostra o nome e a data/hora
da autorização, com as autorizações mais recentes primeiro. Nenhuma conexão
é escolhida automaticamente. Data recente não comprova qual conexão está em
uso no aplicativo nem a disponibilidade do conector.

Se nome e data exibida coincidirem, um identificador distingue as opções.
O identificador completo fica em **Detalhes da conexão**. A conexão escolhida
mostra se está sem acesso ao caso, permitida, revogada, renovada ou indisponível.
A lista de permissões e a confirmação da revogação mostram a data da autorização
a que a permissão pertence.

**Reconectou sua IA?** explica como atualizar as permissões, escolher a conexão
pela data e conferir o material e a prévia. A página de conexão abre em outra
aba, mantendo o caso. As permissões não são transferidas entre conexões.

Quando **Atualizar permissões** identifica renovação ou remoção da conexão
escolhida, invalida a prévia e mantém a seleção de material para conferência.
Uma conexão indisponível não permite prévia nem concessão. A permissão antiga
continua identificada e pode ser revogada. Não se altera o contrato de OAuth,
API, MCP, cobrança ou persistência.

## Validação e limites

Build, lint e typecheck concluídos; 155 testes do frontend aprovados em 29
arquivos. Três novas E2E cobrem nome/data idênticos, nenhuma escolha ou concessão
automática, renovação/remoção com prévia invalidada e seleção conservada, e
revogação explícita da permissão antiga. Axe sem violações no painel móvel;
screenshots de celular/desktop. Revisão independente sem achados P0–P2.

Os dois cenários iniciais falharam antes da implementação e passaram depois.
A renovação OAuth é simulada apenas na resposta do diretório ao navegador.
Permissões e recusas MCP usam API, banco e identidades locais sintéticas reais;
isso não demonstra renovação nativa de OAuth em ChatGPT/Claude.

A suíte completa final `pnpm test:e2e:case-ai` passou nos oito testes, sem
instrumentação adicional, com um arquivo SQLite exclusivo por execução.
A comparação anterior com arquivo exclusivo também passou nos oito testes.
Execuções com SQLite em memória tiveram falhas intermitentes de consultas:
uma após conflito de adoção e outra já no bootstrap. Adoção passou isoladamente;
instrumentar temporariamente as consultas também permitiu uma execução verde.
A causa dessas falhas não foi determinada nem corrigida no produto. O harness
agora isola o banco em arquivo; não se extrapola essa evidência para PostgreSQL
ou renovação OAuth em produção.

A limpeza do banco sintético ocorre na saída do processo, depois da parada dos
servidores do Playwright. O caminho exclusivo é conferido contra a pasta
temporária antes da remoção. Nova execução: oito E2E aprovados e nenhum novo
diretório de banco remanescente. Não há exclusão de dados de produção.

## Relação entre casos e jurisprudência hoje

A busca geral permite abrir a fonte e copiar a citação; ainda não oferece uma
ação para salvar o resultado diretamente em um caso. O **Research memo** do
caso pesquisa pelo recorte informado e salva julgados e verificações naquele
caso. Em **Rascunhos**, julgados salvos podem ser ligados a teses, seções e
citações. Podem também ser selecionados em **Usar este caso na IA**.

Esses vínculos permitem reutilizar e rastrear fontes. Não demonstram, por si,
pertinência jurídica, identidade fática ou aplicabilidade do precedente; o memo
atual compila resultados e questões em um fluxo definido, sem geração por um
modelo hospedado no site. A ponte direta **Pesquisa → Salvar julgado no caso**
é uma lacuna de interface separada deste incremento.
