import { PageIntro } from './PublicSections';

export function GuidePage() {
  return (
    <>
      <PageIntro
        eyebrow="Guia para advogados"
        title="Use o ForgeLex no seu trabalho ou em um host compatível."
        text="O espaço de trabalho funciona diretamente no ForgeLex. Se preferir consultar as ferramentas em ChatGPT ou Claude, verifique primeiro se a sua conta no host permite conectores MCP."
      />
      <section className="page-container grid gap-5 pb-16 md:grid-cols-2">
        <article className="surface p-6">
          <h2 className="font-editorial text-xl font-bold">Primeiro acesso</h2>
          <ol className="mt-4 list-inside list-decimal space-y-2 text-sm leading-6 text-stone-600">
            <li>Crie seu acesso e entre no espaço de trabalho.</li>
            <li>Abra um caso ou pesquise a jurisprudência do STJ.</li>
            <li>Abra a autoridade e confira a proveniência antes de usá-la.</li>
            <li>Confira créditos e atividade na conta.</li>
          </ol>
          <a className="btn-primary mt-6" href="/cadastro">
            Criar acesso
          </a>
        </article>
        <article className="surface p-6">
          <h2 className="font-editorial text-xl font-bold">Uso por MCP</h2>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            A interface e a elegibilidade variam conforme o host e a conta. A configuração por si só não comprova
            conexão: confirme o acesso pelo teste autenticado disponível no ForgeLex. O host fornece o modelo e pode ter
            seus próprios custos.
          </p>
          <a className="btn-secondary mt-6" href="/entrar?next=%2Fapp%2Fconectar">
            Entrar para conectar
          </a>
        </article>
        <article className="surface p-6 md:col-span-2">
          <h2 className="font-editorial text-xl font-bold">Privacidade e custos</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            O ForgeLex recebe a chamada autenticada e os argumentos enviados à ferramenta, sem acesso automático ao
            histórico geral do host. A pesquisa jurisprudencial é a operação faturável do ForgeLex; abrir e verificar
            uma autoridade são gratuitos no contrato vigente. Confira o custo exibido na conta antes de pesquisar.
          </p>
        </article>
      </section>
    </>
  );
}
