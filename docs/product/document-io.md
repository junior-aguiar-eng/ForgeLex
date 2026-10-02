# PDF textual e exportação DOCX

## Escopo implementado

Em Casos, selecionar um PDF extrai o texto localmente com PDF.js e preenche
o formulário de documentos existente. O usuário confere e pode editar a prévia
antes de salvar. A gravação continua usando `POST /api/v2/matters/:id/documents`,
com `text/plain` e nome derivado `arquivo.pdf.txt`. O binário original não é
enviado nem armazenado. Os marcadores `Página N` fazem parte do texto; as
âncoras persistidas continuam sendo de parágrafo, sem alteração de schema.

A extração aceita até 15 MB, 300 páginas e 500.000 bytes de texto, com limite
de 30 segundos. Arquivos inválidos, protegidos ou inteiramente sem texto
extraível geram aviso e preservam a prévia anterior. Páginas vazias de um PDF
misto são identificadas. Trocar de caso cancela a extração em andamento.
O salvamento fica desabilitado durante a extração.

Em Rascunhos, `Baixar DOCX da versão salva` gera um arquivo local com título,
estado e número da versão, seções em ordem, referências e registro da versão.
O arquivo usa o conteúdo carregado da versão persistida, não as edições ainda
não salvas do formulário. Estados diferentes de `APPROVED` recebem aviso de
revisão pendente. Baixar não exige aprovação, não modifica o estado jurídico
da minuta nem executa uma ação externa. A conferência jurídica pode ser feita
pelo próprio autor; não se exige outro revisor para concluir esta entrega.

Os casos passam a carregar automaticamente ao abrir Rascunhos. PDF.js e docx
são carregados sob demanda. Não foram alterados banco, migrations, billing,
pesquisa STJ, providers, geração por IA ou ferramentas MCP.

## Validação executável por uma pessoa

Com Node 24, pnpm e Chromium do Playwright disponíveis, executar na raiz:

```powershell
pnpm install --frozen-lockfile
# Necessário somente se o Chromium do Playwright ainda não estiver instalado:
pnpm exec playwright install chromium
pnpm test
pnpm lint
pnpm -r run typecheck
pnpm test:e2e:documents
pnpm audit --prod --audit-level moderate
```

`pnpm test` compila todo o monorepo antes da suíte. O E2E usa essa API
compilada, Vite, SQLite em memória e Auth simulado no próprio computador:
portas 3300, 3301 e 15531. A configuração sobrescreve as duas variáveis de
URL do banco para evitar alcançar um banco configurado fora do teste.
Não requer Docker, Postgres, conta de nuvem, documento de cliente, LLM,
pagamento, advogado convidado ou janela de observação.

Os testes verificam importação e edição de texto com acentos, persistência
após recarregar, ausência de gravação automática ao extrair, rejeição de
arquivos inválidos/sem texto, limites de tamanho/páginas e PDF misto. O DOCX
baixado no navegador é aberto como ZIP e seu XML confere conteúdo salvo,
exclusão de edição não salva e aviso de revisão. Testes adicionais verificam
ordem, escape XML e estado das citações. Capturas de tela ficam em
`test-results/`, incluindo o importador em largura de 390 px.

A revisão de integração acrescenta scans Axe nas áreas de documentos e
rascunho carregado, abertura do seletor de PDF e download DOCX por teclado,
alvo de 44 px no seletor e verificação de overflow em largura de celular.
O seletor usa `btn-secondary` com rótulo em português e foco visível.

Critério de fechamento desta entrega: build, suíte, lint, typecheck e os
quatro fluxos E2E locais aprovados, com conferência das capturas. Publicação
é uma etapa separada. Homologação com outras pessoas e instalação do Word
não são requisitos de fechamento.

## Limites conhecidos

Não há OCR, preservação de diagramação nem extração de tabelas/colunas como
estrutura. A ordem e separação do texto dependem dos dados internos do PDF;
a prévia permite conferir isso antes da gravação. O DOCX é texto estruturado,
sem modelo forense, imagens ou notas de rodapé; o acervo de referências
preserva o estado registrado de conferência, sem reverificar fontes.

Os testes comprovam OOXML e download no Chromium local. Não comprovam
fidelidade visual em todas as versões do Word nem operação dessa mudança em
produção. Esses limites não exigem testes externos para fechar o escopo.
