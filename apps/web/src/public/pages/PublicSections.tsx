import { ArrowRight, BookOpen, FileCheck2, Search, ShieldCheck } from 'lucide-react';

const movements = [
  { number: '01', title: 'Crie seu acesso', body: 'Entre no ForgeLex e confira sua conta e os créditos para pesquisa.' },
  { number: '02', title: 'Conecte sua IA', body: 'Autorize o ForgeLex no ChatGPT ou Claude, conforme a disponibilidade do MCP no host e na sua conta.' },
  { number: '03', title: 'Pesquise decisões do STJ', body: 'Peça uma pesquisa no host ou use a pesquisa disponível no site. Cada nova pesquisa válida é faturável.' },
  { number: '04', title: 'Confira as fontes', body: 'Abra a autoridade e verifique a proveniência antes de utilizar o resultado. Essas operações são gratuitas.' },
] as const;

const capabilities = [
  { icon: Search, title: 'Pesquisa e autoridades', body: 'Consulte o índice próprio do STJ, abra decisões e confira os dados de origem e verificação.' },
  { icon: BookOpen, title: 'Conexão MCP', body: 'Use ferramentas de pesquisa no ChatGPT ou Claude com autorização da sua conta ForgeLex. O host fornece o modelo de IA.' },
  { icon: ShieldCheck, title: 'Conta e créditos', body: 'Confira saldo, atividade, segurança, chaves e aplicativos autorizados. Os custos do host são separados dos créditos ForgeLex.' },
  { icon: FileCheck2, title: 'API e consulta gratuita', body: 'Integre seu software pela API REST ou consulte dados processuais públicos do TJAL pelo DataJud sem créditos.' },
] as const;

const faq = [
  { question: 'O que é o ForgeLex?', answer: 'É um serviço de pesquisa jurisprudencial do STJ, com ferramentas MCP para ChatGPT ou Claude, API REST e pesquisa auxiliar no site.' },
  { question: 'Quais tribunais podem ser pesquisados?', answer: 'A pesquisa jurisprudencial comercial cobre o índice próprio do STJ. A consulta processual gratuita do TJAL pelo DataJud é um recurso separado.' },
  { question: 'Como funciona a cobrança?', answer: 'Os créditos são pré-pagos em reais. Uma pesquisa válida do STJ é faturável, inclusive sem resultados. Abrir uma autoridade e verificar sua proveniência são gratuitos no contrato vigente.' },
  { question: 'O que preciso para conectar minha IA?', answer: 'Uma conta ForgeLex e um host com suporte a MCP. A disponibilidade depende do ChatGPT ou Claude e da sua conta; consulte o guia e confirme a execução no próprio host.' },
  { question: 'O que é MCP?', answer: 'É um protocolo para um host compatível chamar ferramentas autorizadas. O host fornece o modelo e o contexto; o ForgeLex fornece pesquisa e decisões.' },
  { question: 'O ForgeLex acessa minhas conversas e arquivos?', answer: 'O ForgeLex recebe os argumentos enviados à ferramenta autenticada. A conexão não concede acesso automático ao histórico geral ou aos arquivos do host.' },
  { question: 'Posso integrar ao meu software?', answer: 'Sim. Consulte a API REST e o OpenAPI, com autenticação e os escopos necessários.' },
  { question: 'Como começo sem conectar um host?', answer: 'Crie seu acesso e use a pesquisa no site. A consulta processual pública é gratuita e dispensa cadastro. A conferência e o uso jurídico dos resultados continuam sob sua responsabilidade.' },
] as const;

export function SectionHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 font-editorial text-3xl font-bold leading-tight text-stone-900 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-base leading-7 text-stone-600">{text}</p>}
    </div>
  );
}

export function Hero() {
  return (
    <section className="page-container grid gap-10 py-16 sm:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
      <div className="min-w-0 break-words">
        <p className="eyebrow">Pesquisa jurídica por MCP</p>
        <h1 className="mt-5 max-w-3xl font-editorial text-4xl font-bold leading-[1.16] tracking-tight text-stone-950 sm:text-5xl xl:text-6xl">
          Jurisprudência do STJ no seu fluxo com IA.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
          Conecte o ForgeLex ao ChatGPT ou Claude para pesquisar decisões do STJ e conferir suas fontes.
          Gerencie sua conta e seus créditos aqui, com API e consulta processual gratuita disponíveis.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/cadastro" className="btn-primary">
            Criar acesso <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a href="/produto" className="btn-secondary">
            Conhecer o produto
          </a>
        </div>
        <p className="mt-8 text-sm text-stone-500">Índice próprio do STJ · fontes e proveniência · integração MCP</p>
      </div>
      <div className="surface min-w-0 break-words p-6 sm:p-8" aria-label="Percurso de trabalho">
        <p className="eyebrow">Da conexão à fonte</p>
        <ol className="mt-6 space-y-5">
          {movements.map((step) => (
            <li key={step.number} className="flex gap-4 border-b border-stone-100 pb-4 last:border-0 last:pb-0">
              <span className="font-editorial text-2xl text-cognac-700">{step.number}</span>
              <div className="min-w-0">
                <p className="font-semibold text-stone-900">{step.title}</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Problems() {
  return (
    <section className="border-y border-champagne-border bg-white/70 py-16 sm:py-20">
      <div className="page-container">
        <SectionHeader
          eyebrow="Por que o ForgeLex existe"
          title="O argumento precisa conservar o caminho até sua fonte."
          text="Use pesquisa com dados de origem no seu host de IA e confira as decisões retornadas antes de utilizá-las."
        />
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {[
            [
              'Pesquisa que dá para conferir',
              'Resultados e autoridades apresentam dados de origem e estado de verificação.',
            ],
            ['No seu host de IA', 'Pesquise pelo ChatGPT ou Claude com ferramentas MCP autorizadas.'],
            [
              'Custos visíveis',
              'A conta apresenta créditos e atividade; os custos do modelo pertencem ao host escolhido.',
            ],
          ].map(([title, body]) => (
            <article key={title} className="border-t border-champagne-border pt-5">
              <h3 className="font-editorial text-xl font-bold text-stone-900">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-stone-600">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Movements() {
  return (
    <section className="page-container py-16 sm:py-20">
      <SectionHeader eyebrow="Como funciona" title="Da conta à pesquisa com fontes." />
      <ol className="mt-9 grid gap-4 md:grid-cols-2">
        {movements.map((step, index) => (
          <li key={step.number} className="border-l-2 border-champagne-border py-2 pl-6">
            <span className="text-sm font-bold text-cognac-700">{step.number}</span>
            <h3 className="mt-3 font-editorial text-xl font-bold text-stone-900">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{step.body}</p>
            <a
              href={['/cadastro', '/integracoes', '/produto#pesquisa', '/guia'][index]}
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-cognac-800 hover:underline"
            >
              Ver ferramentas <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Capabilities() {
  return (
    <section className="border-y border-champagne-border bg-white/70 py-16 sm:py-20">
      <div className="page-container">
        <div className="scroll-mt-24" id="casos"><span id="rascunhos" /><span id="revisao" /><p className="mb-6 text-sm text-stone-600">O fluxo de casos, rascunhos e revisão está suspenso na interface. Veja abaixo os recursos de pesquisa e integração disponíveis.</p></div>
        <SectionHeader eyebrow="Ferramentas do produto" title="Pesquisa, conexão e conta em um só lugar." />
        <div className="mt-9 grid gap-5 md:grid-cols-2">
          {capabilities.map(({ icon: Icon, title, body }, index) => (
            <article
              id={['pesquisa', 'integracao', 'conta', 'api'][index]}
              key={title}
              className="surface scroll-mt-24 p-6"
            >
              <Icon className="h-6 w-6 text-cognac-700" aria-hidden="true" />
              <h3 className="mt-4 font-editorial text-xl font-bold text-stone-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{body}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-6 text-stone-600">
          Confira as autoridades retornadas e sua proveniência. A decisão jurídica e o uso dos resultados permanecem
          sob responsabilidade humana.
        </p>
      </div>
    </section>
  );
}

export function WaysToUse() {
  return (
    <section className="page-container py-16 sm:py-20">
      <SectionHeader
        eyebrow="Use do seu jeito"
        title="Escolha onde o trabalho acontece."
        text="Conecte sua IA por MCP, pesquise no site ou integre seu software por API REST."
      />
      <div className="mt-9 grid gap-4 lg:grid-cols-3">
        {[
          [
            'Pesquisa no site',
            'Pesquise decisões do STJ e gerencie sua conta e seus créditos no ForgeLex.',
            '/cadastro',
            'Criar acesso',
          ],
          [
            'ChatGPT ou Claude',
            'Use ferramentas ForgeLex por MCP quando o host e a sua conta oferecerem essa opção.',
            '/guia',
            'Ler o guia',
          ],
          [
            'API REST',
            'Integre pesquisa e metadados a software próprio com autenticação e contratos documentados.',
            '/desenvolvedores/api',
            'Ver a API',
          ],
        ].map(([title, body, href, action]) => (
          <article key={title} className="surface flex flex-col p-6">
            <h3 className="font-editorial text-xl font-bold text-stone-900">{title}</h3>
            <p className="mt-3 flex-1 text-sm leading-6 text-stone-600">{body}</p>
            <a
              href={href}
              className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-cognac-800 hover:underline"
            >
              {action} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CreditsInfo() {
  return (
    <section className="border-y border-champagne-border bg-white/70 py-16 sm:py-20">
      <div className="page-container grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        <SectionHeader
          eyebrow="Cobrança transparente"
          title="Créditos para as operações jurídicas do ForgeLex."
          text="Você adiciona créditos pré-pagos em reais, sem mensalidade ForgeLex. A pesquisa jurisprudencial válida do STJ é faturável, inclusive quando não retorna resultados. Abrir e verificar uma autoridade não têm cobrança própria no contrato vigente."
        />
        <div className="surface p-6">
          <p className="text-sm font-semibold text-stone-900">O que a cobrança cobre</p>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            O ForgeLex cobra suas operações jurídicas. Assinatura, modelo e tokens do ChatGPT, Claude ou outro host
            pertencem ao serviço escolhido pelo usuário.
          </p>
          <a
            href="/creditos"
            className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-cognac-800 hover:underline"
          >
            Ver como funcionam os créditos <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

export function Safeguards() {
  return (
    <section className="page-container py-16 sm:py-20">
      <SectionHeader eyebrow="Como protegemos o trabalho" title="Fontes visíveis. Decisões sob controle humano." />
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {[
          [
            'Contexto isolado',
            'As ferramentas recebem chamadas autenticadas e os argumentos enviados pelo host. Consulte e revogue aplicativos autorizados na página de conexão.',
          ],
          [
            'Credenciais e auditoria',
            'A identidade vem da credencial autenticada; chaves são guardadas por hash e segredos são saneados nos registros de auditoria.',
          ],
          [
            'Conferência das fontes',
            'Abra a autoridade e confira sua proveniência antes do uso jurídico. Resultados de pesquisa não substituem a conferência profissional.',
          ],
        ].map(([title, body]) => (
          <article key={title} className="border-t border-champagne-border pt-5">
            <ShieldCheck className="h-5 w-5 text-cognac-700" aria-hidden="true" />
            <h3 className="mt-4 font-editorial text-xl font-bold text-stone-900">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-stone-600">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function FAQ() {
  return (
    <section id="perguntas" className="scroll-mt-24 border-t border-champagne-border bg-white/70 py-16 sm:py-20">
      <div className="page-container">
        <SectionHeader eyebrow="Perguntas frequentes" title="Respostas antes de criar acesso." />
        <div className="mt-8 max-w-4xl divide-y divide-champagne-border border-y border-champagne-border">
          {faq.map((item) => (
            <details key={item.question} className="group py-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-left font-semibold text-stone-900 marker:hidden">
                {item.question}
                <span className="text-xl font-normal text-cognac-700 group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="max-w-3xl pb-2 pr-8 text-sm leading-6 text-stone-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="page-container py-14 sm:py-20">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-4 max-w-4xl font-editorial text-4xl font-bold leading-tight text-stone-950 sm:text-5xl">
        {title}
      </h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-stone-600">{text}</p>
    </div>
  );
}
