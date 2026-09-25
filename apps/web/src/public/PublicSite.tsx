import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Code2, FileCheck2, FolderOpen, Menu, Scale, Search, ShieldCheck, X } from 'lucide-react';
import { resolveApiOrigin } from '../api-client';
import type { PublicPage } from '../navigation/site-routes';

const navigation = [
  { label: 'Produto', href: '/produto' },
  { label: 'Como funciona', href: '/como-funciona' },
  { label: 'Pesquisa jurídica', href: '/produto#pesquisa' },
  { label: 'Integrações', href: '/integracoes' },
  { label: 'Desenvolvedores', href: '/desenvolvedores/api' },
] as const;

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

const pageTitles: Record<PublicPage, string> = {
  home: 'ForgeLex · Do caso à minuta',
  product: 'Produto · ForgeLex',
  how: 'Como funciona · ForgeLex',
  integrations: 'Integrações · ForgeLex',
  credits: 'Créditos · ForgeLex',
  guide: 'Guia para advogados · ForgeLex',
  api_docs: 'API para desenvolvedores · ForgeLex',
  not_found: 'Página não encontrada · ForgeLex',
};

function PublicHeader() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('a')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
      if (event.key !== 'Tab' || !menu.current) return;
      const items = [...menu.current.querySelectorAll<HTMLElement>('a,button:not([disabled])')];
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-champagne-border bg-[#FBF9F5]/95 backdrop-blur-md">
      <div className="page-container flex min-h-16 items-center gap-4">
        <a
          href="/"
          className="inline-flex shrink-0 items-center gap-2.5 rounded-lg text-stone-900"
          aria-label="ForgeLex, página inicial"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cognac-700 text-white">
            <Scale className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-editorial text-xl font-bold">ForgeLex</span>
        </a>
        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Navegação pública">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-white hover:text-stone-900"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 sm:flex lg:ml-3">
          <a href="/entrar" className="btn-quiet">
            Entrar
          </a>
          <a href="/cadastro" className="btn-primary">
            Criar acesso
          </a>
        </div>
        <button
          ref={toggle}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          aria-controls="public-menu"
          className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-champagne-border lg:hidden sm:ml-0"
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <div id="public-menu" ref={menu} className="page-container border-t border-champagne-border py-3 lg:hidden">
          <nav aria-label="Navegação pública mobile" className="flex flex-col">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-3 text-sm font-medium text-stone-700 hover:bg-white"
              >
                {item.label}
              </a>
            ))}
            <a href="/entrar" className="rounded-lg px-3 py-3 text-sm font-medium text-stone-700 sm:hidden">
              Entrar
            </a>
            <a href="/cadastro" className="rounded-lg px-3 py-3 text-sm font-semibold text-cognac-800 sm:hidden">
              Criar acesso
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function PublicFooter() {
  const groups = [
    {
      title: 'Produto',
      links: [
        ['Visão geral', '/'],
        ['Casos e evidências', '/produto#casos'],
        ['Pesquisa jurídica', '/produto#pesquisa'],
        ['Rascunhos e revisão', '/produto#rascunhos'],
        ['Créditos', '/creditos'],
      ],
    },
    {
      title: 'Integrações',
      links: [
        ['Usar no ChatGPT ou Claude', '/integracoes'],
        ['API para desenvolvedores', '/desenvolvedores/api'],
        ['OpenAPI', `${resolveApiOrigin()}/openapi.json`],
      ],
    },
    {
      title: 'Recursos',
      links: [
        ['Guia para advogados', '/guia'],
        ['Como funciona', '/como-funciona'],
        ['Perguntas frequentes', '/#perguntas'],
      ],
    },
    {
      title: 'Legal',
      links: [
        ['Termos de encerramento', '/legal/encerramento-de-conta.html'],
        ['Política de destinação', '/legal/retencao-pos-encerramento.html'],
      ],
    },
  ] as const;
  return (
    <footer className="border-t border-champagne-border bg-white/65">
      <div className="page-container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <a href="/" className="font-editorial text-xl font-bold text-stone-900">
            ForgeLex
          </a>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            Pesquisa, estratégia e preparação jurídica com fontes rastreáveis e revisão humana.
          </p>
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="text-sm font-bold text-stone-900">{group.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {group.links.map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="text-sm text-stone-600 hover:text-cognac-800 hover:underline">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-champagne-border">
        <div className="page-container py-5 text-xs text-stone-500">
          © {new Date().getFullYear()} ForgeLex · informação institucional
        </div>
      </div>
    </footer>
  );
}

function SectionHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 font-editorial text-3xl font-bold leading-tight text-stone-900 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-base leading-7 text-stone-600">{text}</p>}
    </div>
  );
}

function Hero() {
  return (
    <section className="page-container grid gap-10 py-16 sm:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
      <div>
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
      <div className="surface p-6 sm:p-8" aria-label="Percurso de trabalho">
        <p className="eyebrow">Um percurso com contexto</p>
        <ol className="mt-6 space-y-5">
          {movements.map((step) => (
            <li key={step.number} className="flex gap-4 border-b border-stone-100 pb-4 last:border-0 last:pb-0">
              <span className="font-editorial text-2xl text-cognac-700">{step.number}</span>
              <div>
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

function Problems() {
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

function Movements() {
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

function Capabilities() {
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

function WaysToUse() {
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

function CreditsInfo() {
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

function Safeguards() {
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

function FAQ() {
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

function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
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

function Guide() {
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

function ApiDocs() {
  const apiUrl = resolveApiOrigin();
  const curl = `curl -G '${apiUrl}/api/v2/jurisprudencias' \\\n  --data-urlencode 'q=<CONSULTA>' --data-urlencode 'court=STJ' \\\n  -H 'Authorization: Bearer <SUA_CHAVE>' \\\n  -H 'Idempotency-Key: <CHAVE_UNICA>'`;
  const node = `const url = new URL('${apiUrl}/api/v2/jurisprudencias');
url.search = new URLSearchParams({ q: '<CONSULTA>', court: 'STJ' }).toString();
const response = await fetch(url, { headers: {
  Authorization: 'Bearer <SUA_CHAVE>',
  'Idempotency-Key': '<CHAVE_UNICA>'
}});`;
  const python = `import httpx
response = httpx.get('${apiUrl}/api/v2/jurisprudencias',
    params={'q': '<CONSULTA>', 'court': 'STJ'},
    headers={'Authorization': 'Bearer <SUA_CHAVE>',
             'Idempotency-Key': '<CHAVE_UNICA>'})`;
  return (
    <>
      <PageIntro
        eyebrow="Desenvolvedores"
        title="Integre as operações jurídicas do ForgeLex."
        text="A API REST e o MCP expõem a mesma infraestrutura jurídica. A autenticação, os escopos, os erros e a cobrança pertencem a cada operação; o ForgeLex não fornece modelo de IA."
      />
      <section className="page-container space-y-8 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [
              'Autenticação',
              'Crie uma API key no app autenticado. O segredo é exibido uma vez e deve ser enviado como Bearer token.',
            ],
            [
              'Fluxo jurídico',
              'Liste tribunais, pesquise no STJ, abra a autoridade e verifique os dados de origem antes de utilizar o resultado.',
            ],
            [
              'Custos e erros',
              'A busca jurisprudencial válida é faturável. Trate explicitamente 401, 402, 403, 409, 422, 429 e 503 e use Idempotency-Key nas operações que a exigem.',
            ],
          ].map(([title, body]) => (
            <article key={title} className="surface p-6">
              <h2 className="font-editorial text-xl font-bold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">{body}</p>
            </article>
          ))}
        </div>
        <div className="surface p-6">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-cognac-700" aria-hidden="true" />
            <h2 className="font-editorial text-xl font-bold">Exemplo de pesquisa</h2>
          </div>
          <p className="mt-3 text-sm text-stone-600">
            Substitua os valores entre sinais de menor e maior. Os trechos mostram requisições, não resultados ao vivo.
          </p>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {[
              ['cURL', curl],
              ['Node.js', node],
              ['Python', python],
            ].map(([label, code]) => (
              <div key={label} className="min-w-0">
                <h3 className="text-sm font-semibold text-stone-800">{label}</h3>
                <pre className="mt-2 overflow-x-auto rounded-xl bg-stone-900 p-4 text-xs leading-5 text-stone-100">
                  <code>{code}</code>
                </pre>
              </div>
            ))}
          </div>
        </div>
        <div className="surface p-6">
          <h2 className="font-editorial text-xl font-bold">Contratos e referência</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Consulte o documento OpenAPI para endpoints, parâmetros, respostas e escopos vigentes. A criação e revogação
            de chaves exigem conta autenticada.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a className="btn-primary" href={`${apiUrl}/openapi.json`}>
              Abrir OpenAPI
            </a>
            <a className="btn-secondary" href="/entrar?next=%2Fapp%2Fconta%2Fchaves">
              Gerenciar API keys
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

export function PublicSite({ page }: { page: PublicPage }) {
  useEffect(() => {
    document.title = pageTitles[page];
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description)
      description.content =
        'ForgeLex: casos, pesquisa jurídica do STJ e preparação de rascunhos com fontes rastreáveis e revisão humana.';
    if (window.location.hash)
      requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView());
  }, [page]);

  return (
    <div className="min-h-screen bg-[#FBF9F5]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3"
      >
        Pular para o conteúdo
      </a>
      <PublicHeader />
      <main id="conteudo">
        {page === 'home' && (
          <>
            <Hero />
            <Problems />
            <Movements />
            <Capabilities />
            <WaysToUse />
            <CreditsInfo />
            <Safeguards />
            <FAQ />
          </>
        )}
        {page === 'product' && (
          <>
            <PageIntro
              eyebrow="Produto"
              title="Um espaço para reunir o caso, as fontes e a minuta."
              text="Organize documentos, fatos, provas e questões. Pesquise jurisprudência do STJ, confira autoridades e prepare rascunhos com revisão humana."
            />
            <Capabilities />
            <Movements />
          </>
        )}
        {page === 'how' && (
          <>
            <PageIntro
              eyebrow="Como funciona"
              title="Cada etapa conserva o contexto da anterior."
              text="O ForgeLex relaciona o material do caso à pesquisa e aos rascunhos, permitindo conferir a origem de informações antes de usar o resultado."
            />
            <Movements />
            <Safeguards />
          </>
        )}
        {page === 'integrations' && (
          <>
            <PageIntro
              eyebrow="Integrações"
              title="Trabalhe no ForgeLex ou conecte suas ferramentas."
              text="O espaço de trabalho é o caminho direto. MCP e API REST são alternativas para usar as operações jurídicas em outros ambientes."
            />
            <WaysToUse />
            <Safeguards />
          </>
        )}
        {page === 'credits' && (
          <>
            <PageIntro
              eyebrow="Créditos"
              title="Pague pelas operações jurídicas que utilizar."
              text="Os créditos são pré-pagos em reais, sem mensalidade ForgeLex. A pesquisa jurisprudencial válida do STJ é a operação faturável no contrato atual."
            />
            <CreditsInfo />
          </>
        )}
        {page === 'guide' && <Guide />}
        {page === 'api_docs' && <ApiDocs />}
        {page === 'not_found' && (
          <PageIntro
            eyebrow="Página não encontrada"
            title="Este endereço não está disponível."
            text="Confira o endereço ou volte à página inicial do ForgeLex."
          />
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
