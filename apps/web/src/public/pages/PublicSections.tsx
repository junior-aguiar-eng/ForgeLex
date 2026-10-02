import { ArrowRight, BookOpen, FileCheck2, FolderOpen, Search, ShieldCheck } from 'lucide-react';

const movements = [
  {
    number: '01',
    title: 'Estruture o caso',
    body: 'Reúna documentos, fatos candidatos, provas, eventos e questões jurídicas no mesmo contexto.',
  },
  {
    number: '02',
    title: 'Pesquise e confira',
    body: 'Consulte a jurisprudência do STJ, abra a autoridade e confira a proveniência antes de utilizá-la.',
  },
  {
    number: '03',
    title: 'Construa a linha jurídica',
    body: 'Organize questões, autoridades e teses com um memorando de pesquisa sujeito à revisão.',
  },
  {
    number: '04',
    title: 'Redija e revise',
    body: 'Prepare versões de rascunho, confira citações e suporte factual e registre a decisão humana.',
  },
] as const;

const capabilities = [
  {
    icon: FolderOpen,
    title: 'Casos e evidências',
    body: 'Documentos com âncoras, fatos candidatos, provas vinculadas, linha do tempo, questões jurídicas e cobertura factual explícita.',
  },
  {
    icon: Search,
    title: 'Pesquisa e autoridades',
    body: 'Pesquisa jurisprudencial no STJ, recuperação e verificação de autoridade, proveniência e vínculo com o caso.',
  },
  {
    icon: BookOpen,
    title: 'Estratégia e documentos',
    body: 'Memorando de pesquisa, mapa de teses, estrutura da peça e versões de rascunho ligadas ao material do caso.',
  },
  {
    icon: FileCheck2,
    title: 'Revisão e governança',
    body: 'Conferência de citações, suporte factual, revisão adversarial, pendências e aprovação humana registrada.',
  },
] as const;

const faq = [
  {
    question: 'O que é o ForgeLex?',
    answer:
      'É um espaço de trabalho jurídico para organizar casos, pesquisar jurisprudência do STJ, relacionar fontes e preparar documentos sujeitos à revisão humana.',
  },
  {
    question: 'O ForgeLex escreve petições sozinho?',
    answer:
      'Não. O produto ajuda a preparar e revisar rascunhos. A decisão jurídica, a conferência final e qualquer efeito externo continuam sob responsabilidade humana.',
  },
  {
    question: 'Quais tribunais podem ser pesquisados?',
    answer:
      'A pesquisa comercial disponível neste momento cobre o índice próprio do STJ. Outros tribunais não são apresentados como pesquisáveis.',
  },
  {
    question: 'Como funciona a cobrança?',
    answer:
      'O ForgeLex usa créditos pré-pagos em reais. A pesquisa jurisprudencial válida do STJ é a operação faturável; consultar e verificar uma autoridade não têm cobrança própria no contrato vigente.',
  },
  {
    question: 'Preciso usar ChatGPT ou Claude?',
    answer:
      'Não. O espaço de trabalho ForgeLex pode ser usado diretamente. A integração por MCP é um caminho opcional, sujeito à disponibilidade no host escolhido.',
  },
  {
    question: 'O que é MCP?',
    answer:
      'É um protocolo pelo qual um host compatível pode chamar ferramentas do ForgeLex com autorização. O host fornece o modelo de IA; o ForgeLex fornece as operações jurídicas.',
  },
  {
    question: 'O ForgeLex acessa minhas conversas e arquivos?',
    answer:
      'A chamada MCP entrega ao ForgeLex os argumentos autorizados da ferramenta. Ela não concede acesso automático ao histórico geral da conversa nem a arquivos que o host não envie nessa chamada.',
  },
  {
    question: 'Posso integrar ao meu software?',
    answer:
      'Sim. A API REST e a documentação OpenAPI permitem integrar as operações disponíveis mediante autenticação e os escopos necessários.',
  },
  {
    question: 'Como a revisão humana funciona?',
    answer:
      'O trabalho registra pendências e decisões de revisão. Autoridades, fatos, provas e rascunhos devem ser conferidos pelo profissional antes do uso.',
  },
  {
    question: 'Uma aprovação no ForgeLex protocola o documento?',
    answer:
      'Não. A aprovação registra uma decisão no fluxo interno; ela não protocola nem envia automaticamente uma peça a terceiros.',
  },
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
        <p className="eyebrow">Pesquisa, estratégia e preparação jurídica</p>
        <h1 className="mt-5 max-w-3xl font-editorial text-4xl font-bold leading-[1.16] tracking-tight text-stone-950 sm:text-5xl xl:text-6xl">
          Do caso à minuta, conecte fatos, provas e jurisprudência.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
          Organize o contexto do caso, pesquise a jurisprudência do STJ com fontes rastreáveis e prepare rascunhos
          sujeitos à revisão humana em um único espaço de trabalho.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/cadastro" className="btn-primary">
            Criar acesso <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a href="/produto" className="btn-secondary">
            Conhecer o produto
          </a>
        </div>
        <p className="mt-8 text-sm text-stone-500">Índice próprio do STJ · fontes e proveniência · revisão humana</p>
      </div>
      <div className="surface min-w-0 break-words p-6 sm:p-8" aria-label="Percurso de trabalho">
        <p className="eyebrow">Um percurso com contexto</p>
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
          text="Pesquisa fragmentada, contexto espalhado e minutas sem vínculos explícitos tornam a conferência mais difícil. O ForgeLex organiza essas etapas no mesmo espaço de trabalho."
        />
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {[
            [
              'Pesquisa que dá para conferir',
              'Resultados e autoridades apresentam dados de origem e estado de verificação.',
            ],
            ['Contexto reunido', 'Documentos, fatos, provas e questões permanecem associados ao caso.'],
            [
              'Minuta com lastro visível',
              'Rascunhos podem ligar seções a fatos, provas, autoridades e teses para revisão.',
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
      <SectionHeader eyebrow="Como funciona" title="Quatro movimentos, um contexto jurídico." />
      <ol className="mt-9 grid gap-4 md:grid-cols-2">
        {movements.map((step, index) => (
          <li key={step.number} className="border-l-2 border-champagne-border py-2 pl-6">
            <span className="text-sm font-bold text-cognac-700">{step.number}</span>
            <h3 className="mt-3 font-editorial text-xl font-bold text-stone-900">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{step.body}</p>
            <a
              href={['/produto#casos', '/produto#pesquisa', '/produto#rascunhos', '/produto#revisao'][index]}
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
        <SectionHeader eyebrow="Ferramentas do produto" title="O trabalho jurídico permanece ligado ao caso." />
        <div className="mt-9 grid gap-5 md:grid-cols-2">
          {capabilities.map(({ icon: Icon, title, body }, index) => (
            <article
              id={['casos', 'pesquisa', 'rascunhos', 'revisao'][index]}
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
          O ForgeLex organiza e ajuda a verificar o trabalho. A decisão jurídica e qualquer efeito externo permanecem
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
        text="O espaço de trabalho, o MCP e a API REST são caminhos para as capacidades do ForgeLex. Você não precisa conectar outro serviço para começar."
      />
      <div className="mt-9 grid gap-4 lg:grid-cols-3">
        {[
          [
            'Espaço de trabalho',
            'Organize casos, pesquisa, rascunhos e revisão diretamente no ForgeLex.',
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
            'Os dados do trabalho pertencem ao espaço autorizado da conta. O corpus jurisprudencial é compartilhado como fonte de pesquisa, sem misturar dados privados de casos.',
          ],
          [
            'Credenciais e auditoria',
            'A identidade vem da credencial autenticada; chaves são guardadas por hash e segredos são saneados nos registros de auditoria.',
          ],
          [
            'Revisão antes de agir',
            'Uma aprovação no fluxo interno não protocola documentos nem produz automaticamente efeitos externos.',
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
