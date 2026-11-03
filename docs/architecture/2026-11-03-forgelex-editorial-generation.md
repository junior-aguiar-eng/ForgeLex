# Geração simulada de propostas do editor final — 03/11/2026

Checkout: `C:/Users/Boni Jr/.codex/worktrees/forgelex-3-audit/SDK`, branch
`codex/forgelex-3-quality`, HEAD `5ba4ca87f3d4602db878ce8935552354c2743ee2`.

## Implementação

O perfil editorial standalone e `FinalEditorGenerator` consomem o contexto
autorizado de `FinalEditorService`. O gerador calcula hashes das seções, entrega
uma cópia do contexto ao provedor simulado e disponibiliza somente
`editorial.submit`. A submissão deve satisfazer o contrato editorial existente;
texto livre e eventos de conclusão não substituem uma proposta válida.

A rota `POST /api/agentic/deliveries/:id/editorial-proposals/generate` recebe
somente `{draftId, versionId}`, com as mesmas exigências de sessão, escopos,
proprietário e runtime. Antes de devolver a proposta, o serviço recarrega a
autorização e compara integralmente o contexto usado. Revogação ou alteração de
versão, texto, fontes, requisitos ou suporte invalidam a saída.

A resposta contém `{mode: 'SIMULATED', profileVersion: '1.0.0', proposal}`.
Não persiste propostas, altera minutas nem emite eventos no grafo v8.

## Limites e decisões

- Factory ausente por padrão e injetada somente nos testes desta etapa. IDs de
  provedores diferentes de `fake` são recusados antes de `run`. A factory é
  código confiável do servidor, não um sandbox contra código arbitrário.
- Uma tentativa, um turno, até 16 eventos, 300.000 ms e 128.000 bytes UTF-8
  somando prompt e instruções. Cancelamento/timeout encerram a chamada mesmo
  quando o provedor ignora o sinal; submissões tardias são recusadas.
- O perfil conserva o teto de 2.048 tokens para futura integração real e impõe
  adicionalmente 2.048 bytes UTF-8 ao JSON da proposta simulada. Esse limite
  pode recusar propostas maiores; bytes não medem tokens. Não há truncamento,
  retry, fallback ou ferramenta de pesquisa/escrita.
- A revisão compara as mudanças desta etapa ao baseline local anterior,
  porque contrato e ligação à minuta já estavam presentes sem commit.

Mesa, catálogo, fluxo v8, carteira e limites financeiros permanecem preservados.
Nenhuma chamada paga, novo commit, push, deploy, migração remota ou execução dos
outros 54 cenários foi realizada.

## Validação

Testes focados: 105 aprovados, zero falhas, em seis arquivos. Incluem 21 testes
do gerador, 26 da API editorial, contrato puro e regressões de contexto/fluxo.
Lint e formatação dos sete arquivos desta etapa aprovados; builds de
`legal-agents`/`legal-workflows` e verificação de tipos da API aprovados.

Revisão independente read-only por `gpt-6-astra`: dois achados P2 corrigidos
com reprodução RED e confirmação GREEN. A contagem agora ocorre antes da
validação estrutural, impedindo sucesso após segunda submissão inválida com
erro suprimido pelo provedor. A API instala listeners antes de consultar a
entrega e verifica requisição/resposta já encerrada, impedindo início tardio
após desconexão. O registro compartilhado de ferramentas não foi alterado.

O primeiro teste de desconexão também acionou a rejeição esperada do transporte
simulado (`LIGHT_ECONNRESET`). O teste foi corrigido para esperar essa rejeição
e examinar o resultado interno pelo hook `onSend`; sem a correção do código,
os dois casos de desconexão falharam, e passaram após restaurá-la.

`pnpm test`: build completo aprovado; 1.699 testes aprovados, zero falhas e 17
condicionais ignorados, em 234 arquivos aprovados e três ignorados. A execução
usou chaves OpenAI/Anthropic vazias, aprovações pagas vazias e URLs de bancos
opcionais ausentes. Isso não substitui testes PostgreSQL remotos ou E2E de UI.

[Recibo, logs e hashes](evidence/2026-11-03-editorial-generation/validation.json).
Hashes do contrato puro, serviço de contexto, persistência e evidências anteriores
conferidos sem divergência. O diff das áreas protegidas ficou vazio; exports e
rotas desta etapa têm novos hashes no recibo, sem reescrever os recibos anteriores.

## Limites da evidência e próximos passos

A simulação valida o encadeamento e as recusas do software. Não mede consumo
de um modelo real, qualidade editorial/jurídica, equivalência semântica ou
resistência semântica a prompt injection. O contrato exige revisão humana e
mantém `legalAssessment: NOT_EVALUATED`.

Geração real permanece desabilitada. Integração de modelo com contabilização,
interface para revisar propostas e aplicação humana versionada são etapas
posteriores. Aplicação automática e deploy permanecem fora deste escopo.
