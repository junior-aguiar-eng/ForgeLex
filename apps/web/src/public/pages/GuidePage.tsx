import { PageIntro } from './PublicSections';

export function GuidePage({ model = false }: { model?: boolean }) {
  return (
    <>
      <PageIntro
        eyebrow="Guia para advogados"
        title={
          model
            ? 'Trabalhe a peça na Mesa e pesquise com a fonte à vista.'
            : 'Pesquise pelo ChatGPT ou Claude com o ForgeLex.'
        }
        text={
          model
            ? 'Confira se sua conta no ChatGPT ou Claude oferece MCP, crie seu acesso ForgeLex e autorize a conexão. A Mesa de trabalho serve para elaborar e revisar a peça, e a pesquisa também pode ser feita no site.'
            : 'Confira se sua conta no ChatGPT ou Claude oferece MCP, crie seu acesso ForgeLex e autorize a conexão. A pesquisa também pode ser feita no site.'
        }
      />
      <section className="page-container grid gap-5 pb-16 md:grid-cols-2">
        <article className="surface p-6">
          <h2 className="font-editorial text-xl font-bold">Primeiro acesso</h2>
          <ol className="mt-4 list-inside list-decimal space-y-2 text-sm leading-6 text-stone-600">
            <li>Crie seu acesso e entre no espaço de trabalho.</li>
            <li>Abra Conectar IA ou pesquise jurisprudência dos tribunais superiores.</li>
            <li>Abra a autoridade e confira a proveniência antes de usá-la.</li>
            <li>Confira créditos e atividade na conta.</li>
            {model && <li>Para elaborar e revisar uma peça, abra a Mesa de trabalho.</li>}
          </ol>
          <a className="btn-primary mt-6" href="/cadastro">
            Criar acesso
          </a>
        </article>
        <article className="surface p-6">
          <h2 className="font-editorial text-xl font-bold">Uso por MCP</h2>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            A interface e a elegibilidade variam conforme o aplicativo conectado e a conta. A configuração por si só não
            comprova execução pelo aplicativo conectado: o teste no ForgeLex verifica o serviço e a sessão; confirme uma
            ferramenta dentro do aplicativo conectado. O aplicativo conectado fornece o modelo e pode ter seus próprios
            custos.
          </p>
          <a className="btn-secondary mt-6" href="/entrar?next=%2Fapp%2Fconectar">
            Entrar para conectar
          </a>
        </article>
        {model && (
          <article className="surface p-6 md:col-span-2">
            <h2 className="font-editorial text-xl font-bold">Mesa de trabalho</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              A Mesa orienta, elabora e revisa a peça com as fontes à vista. A orientação é do ForgeLex; a decisão
              jurídica e a conferência do resultado continuam sob sua responsabilidade.
            </p>
            <ol className="mt-4 list-inside list-decimal space-y-2 text-sm leading-6 text-stone-600">
              <li>
                Entre na Mesa, escolha o caso e descreva o que precisa. Se não souber por onde começar, peça ajuda.
              </li>
              <li>Responda o que a Mesa perguntar, ou diga “não sei” e corrija o resumo antes de enviar.</li>
              <li>
                Anexe PDF, texto ou Markdown, se quiser: o arquivo não é enviado nem guardado, só o texto extraído.
              </li>
              <li>
                Revise a entrega, peça a alteração de um trecho e salve a versão. Os trabalhos da Mesa usam créditos.
              </li>
            </ol>
            <a className="btn-secondary mt-5" href="/entrar?next=%2Fapp%2Ftrabalho">
              Entrar na Mesa
            </a>
          </article>
        )}
        <article className="surface p-6 md:col-span-2">
          <h2 className="font-editorial text-xl font-bold">Privacidade e custos</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            O ForgeLex recebe a chamada autenticada e os argumentos enviados à ferramenta, sem acesso automático ao
            histórico geral do aplicativo conectado. A pesquisa jurisprudencial é a operação faturável do ForgeLex;
            abrir e verificar uma autoridade são gratuitos no contrato vigente. Confira o custo exibido na conta antes
            de pesquisar.
          </p>
        </article>
      </section>
    </>
  );
}
