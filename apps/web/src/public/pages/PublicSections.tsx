import { MODEL_SUBTITLE, MODEL_TITLE } from '../../config/public-model-copy';
import {
  ArrowRight,
  BookOpen,
  FileCheck2,
  FileText,
  History,
  ListChecks,
  MessageSquare,
  Paperclip,
  PenLine,
  Search,
  ShieldCheck,
} from 'lucide-react';

const movements = [
  {
    number: '01',
    title: 'Crie seu acesso',
    body: 'Entre no ForgeLex e confira sua conta e os créditos para pesquisa.',
  },
  {
    number: '02',
    title: 'Conecte sua IA',
    body: 'Autorize o ForgeLex no ChatGPT ou Claude, conforme a disponibilidade do MCP no aplicativo conectado e na sua conta.',
  },
  {
    number: '03',
    title: 'Pesquise decisões dos tribunais disponíveis',
    body: 'Peça uma pesquisa no aplicativo conectado ou use a pesquisa disponível no site. Cada nova pesquisa válida é faturável.',
  },
  {
    number: '04',
    title: 'Confira as fontes',
    body: 'Abra a autoridade e verifique a proveniência antes de utilizar o resultado. Essas operações são gratuitas.',
  },
] as const;

const capabilities = [
  {
    icon: Search,
    title: 'Pesquisa e autoridades',
    body: 'Pesquise decisões dos tribunais disponíveis e confira a origem e a fonte.',
  },
  {
    icon: BookOpen,
    title: 'Conexão MCP',
    body: 'Use ferramentas de pesquisa no ChatGPT ou Claude com autorização da sua conta ForgeLex. O aplicativo conectado fornece o modelo de IA.',
  },
  {
    icon: ShieldCheck,
    title: 'Conta e créditos',
    body: 'Confira saldo, atividade, segurança, chaves e aplicativos autorizados. Os custos do aplicativo conectado são separados dos créditos ForgeLex.',
  },
  {
    icon: FileCheck2,
    title: 'API e consulta gratuita',
    body: 'Integre seu software pela API REST ou consulte dados processuais públicos do TJAL pelo DataJud sem créditos.',
  },
] as const;

const faq = [
  {
    question: 'O que é o ForgeLex?',
    answer:
      'É um serviço de pesquisa jurisprudencial dos tribunais superiores, com ferramentas MCP para ChatGPT ou Claude, API REST e pesquisa auxiliar no site.',
  },
  {
    question: 'Quais tribunais podem ser pesquisados?',
    answer:
      'A cobertura disponível atualmente para pesquisa jurisprudencial é o STJ. A consulta processual gratuita do TJAL pelo DataJud é um recurso separado.',
  },
  {
    question: 'Como funciona a cobrança?',
    answer:
      'Os créditos são pré-pagos em reais. Uma nova pesquisa válida é faturável, inclusive sem resultados. Abrir uma autoridade e verificar sua proveniência são gratuitos no contrato vigente.',
  },
  {
    question: 'O que preciso para conectar minha IA?',
    answer:
      'Uma conta ForgeLex e um aplicativo com suporte a MCP. A disponibilidade depende do ChatGPT ou Claude e da sua conta; consulte o guia e confirme a execução no próprio aplicativo conectado.',
  },
  {
    question: 'O que é MCP?',
    answer:
      'É um protocolo para um aplicativo compatível chamar ferramentas autorizadas. O aplicativo conectado fornece o modelo e o contexto; o ForgeLex fornece pesquisa e decisões.',
  },
  {
    question: 'O ForgeLex acessa minhas conversas e arquivos?',
    answer:
      'O ForgeLex recebe os argumentos enviados à ferramenta autenticada. A conexão não concede acesso automático ao histórico geral ou aos arquivos do aplicativo conectado.',
  },
  {
    question: 'Posso integrar ao meu software?',
    answer: 'Sim. Consulte a API REST e o OpenAPI, com autenticação e os escopos necessários.',
  },
  {
    question: 'Como começo sem conectar um aplicativo?',
    answer:
      'Crie seu acesso e use a pesquisa no site. A consulta processual pública é gratuita e dispensa cadastro. A conferência e o uso jurídico dos resultados continuam sob sua responsabilidade.',
  },
] as const;

export { MODEL_TITLE, MODEL_SUBTITLE };

const modelMovements = [
  movements[0],
  movements[1],
  {
    number: '03',
    title: 'Pesquise com a fonte à vista',
    body: 'Peça a pesquisa no aplicativo conectado. Cada resultado mostra a fonte e o estado de verificação, e cada nova pesquisa válida é faturável.',
  },
  {
    number: '04',
    title: 'Confira e trabalhe a peça',
    body: 'Abra a autoridade e confira antes de usar; essas operações são gratuitas. Para elaborar e revisar a peça, use a Mesa de trabalho.',
  },
] as const;

const modelCapabilities = [
  {
    id: 'mesa',
    icon: FileText,
    title: 'Mesa de trabalho',
    body: 'Descreva o que precisa e a Mesa orienta, elabora e revisa a peça com as fontes à vista, a partir do seu pedido e de anexos em PDF, texto ou Markdown. Cada versão fica guardada, e a decisão jurídica e o uso do resultado continuam sob responsabilidade humana.',
  },
  ...capabilities.map((item, index) => ({ ...item, id: ['pesquisa', 'integracao', 'conta', 'api'][index] })),
] as const;

/** A Mesa de trabalho em detalhe. Cada frase corresponde a uma função publicada (orientação guiada, peça, revisão, edição delimitada, versões, pesquisa na Mesa, anexos, casos). */
const mesaFeatures = [
  {
    icon: MessageSquare,
    title: 'Ela pergunta o que falta',
    body: 'Descreva o pedido em uma frase ou peça ajuda para começar. Se faltar algo que muda o resultado, a Mesa pergunta; você pode responder “não sei” e corrigir o resumo antes de enviar.',
  },
  {
    icon: PenLine,
    title: 'Elabora, revisa e edita um trecho',
    body: 'Elabora uma peça nova ou revisa a que você já tem, sem gerar versão nova a cada pedido. Para mexer em uma parte, selecione o trecho e peça a alteração só ali.',
  },
  {
    icon: History,
    title: 'Cada versão fica guardada',
    body: 'O que você salva vira uma versão, com histórico. Se a resposta se perder no caminho, nada é duplicado nem se perde. A revisão aponta pontos e você decide o que aplicar.',
  },
  {
    icon: BookOpen,
    title: 'Fontes dentro da peça',
    body: 'Pesquise jurisprudência sem sair da Mesa. Cada decisão traz a origem e o estado de verificação, e uma pesquisa salva reabre sem nova busca, com a mesma proveniência.',
  },
  {
    icon: Paperclip,
    title: 'Seu material e seu caso',
    body: 'Anexe PDF, texto ou Markdown: o arquivo não é enviado nem guardado, só o texto extraído acompanha o pedido. Organize peças e pesquisas por caso.',
  },
  {
    icon: ListChecks,
    title: 'Você acompanha e decide',
    body: 'O andamento do trabalho fica à vista, do pedido à entrega. A conferência das fontes e o uso jurídico do resultado continuam sob sua responsabilidade.',
  },
] as const;

const mesaSteps = [
  {
    number: '01',
    title: 'Descreva o que precisa',
    body: 'Escreva o pedido em uma frase, escolha o caso e, se quiser, anexe PDF, texto ou Markdown. Se não souber por onde começar, peça ajuda.',
  },
  {
    number: '02',
    title: 'Responda só o que falta',
    body: 'A Mesa faz as perguntas que mudam o resultado. Responda, diga “não sei” ou corrija o resumo antes de enviar.',
  },
  {
    number: '03',
    title: 'Acompanhe o trabalho',
    body: 'A peça fica aberta ao lado da conversa, com as fontes à vista. Os trabalhos da Mesa usam créditos da conta.',
  },
  {
    number: '04',
    title: 'Revise, decida e salve a versão',
    body: 'Confira as fontes, aplique o que valer, peça a alteração de um trecho e salve. Cada versão fica no histórico.',
  },
] as const;

const modelFaq = [
  {
    question: 'O que é o ForgeLex?',
    answer:
      'É um serviço para elaborar e revisar peças e para pesquisar jurisprudência com fonte: a Mesa de trabalho, ferramentas MCP para a sua IA (ChatGPT ou Claude), pesquisa com estado de verificação, API REST e consulta processual gratuita.',
  },
  {
    question: 'O que é a Mesa de trabalho?',
    answer:
      'É o espaço do ForgeLex para elaborar e revisar peças. Você descreve o que precisa; ela pergunta o que falta, elabora ou revisa a peça com as fontes à vista, altera só o trecho que você selecionar e guarda cada versão. Aceita anexos em PDF, texto ou Markdown e organiza o trabalho por caso. A conferência e o uso jurídico do resultado continuam sob sua responsabilidade.',
  },
  {
    question: 'O que a Mesa faz com meus anexos?',
    answer:
      'Aceita PDF, texto e Markdown. O arquivo não é enviado nem guardado: só o texto extraído acompanha o pedido, somado ao contexto que você escrever.',
  },
  {
    question: 'A Mesa usa créditos?',
    answer:
      'Sim. Os trabalhos da Mesa usam créditos da sua conta, sem mensalidade ForgeLex, e o saldo e o consumo ficam à vista na conta. O aplicativo de IA conectado por MCP tem custos próprios, separados dos créditos ForgeLex.',
  },
  faq[1],
  {
    question: 'Como funciona a cobrança?',
    answer:
      'Os créditos são pré-pagos em reais. Uma nova pesquisa válida é faturável, inclusive sem resultados, e os trabalhos da Mesa também usam créditos. Abrir uma autoridade e verificar sua proveniência são gratuitos no contrato vigente.',
  },
  ...faq.slice(3),
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

export function Hero({ model = false }: { model?: boolean }) {
  const steps = model ? modelMovements : movements;
  return (
    <section className="page-container grid gap-10 py-16 sm:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
      <div className="min-w-0 break-words">
        <p className="eyebrow">{model ? 'Mesa de trabalho e pesquisa por MCP' : 'Pesquisa jurídica por MCP'}</p>
        <h1 className="mt-5 max-w-3xl font-editorial text-4xl font-bold leading-[1.16] tracking-tight text-stone-950 sm:text-5xl xl:text-6xl">
          {model ? MODEL_TITLE : 'Jurisprudência dos tribunais superiores e consulta processual.'}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
          {model
            ? MODEL_SUBTITLE
            : 'Pesquise decisões, confira as fontes e consulte processos. Use o site ou conecte o ForgeLex ao ChatGPT ou Claude.'}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/cadastro" className="btn-primary">
            Criar acesso <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a href={model ? '/produto#mesa-de-trabalho' : '/produto'} className="btn-secondary">
            {model ? 'Conhecer a Mesa de trabalho' : 'Conhecer o produto'}
          </a>
        </div>
        <p className="mt-8 text-sm text-stone-500">
          {model
            ? 'Peças elaboradas e revisadas na Mesa, com as fontes à vista'
            : 'Decisões, fontes e consulta processual'}
        </p>
      </div>
      <div className="surface min-w-0 break-words p-6 sm:p-8" aria-label="Percurso de trabalho">
        <p className="eyebrow">Da conexão à fonte</p>
        <ol className="mt-6 space-y-5">
          {steps.map((step) => (
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

/** A Mesa de trabalho em destaque (texto do modelo novo): o que ela faz, em seis frentes e com a regra de cobrança. */
export function MesaSection() {
  return (
    <section id="mesa-de-trabalho" className="scroll-mt-24 border-y border-champagne-border bg-white/70 py-16 sm:py-20">
      <div className="page-container">
        <SectionHeader
          eyebrow="Mesa de trabalho"
          title="Da pergunta à peça, com a IA trabalhando e você decidindo."
          text="A Mesa é o espaço do ForgeLex para elaborar e revisar peças. Você descreve o que precisa; ela pergunta o que falta, trabalha com as fontes à vista e entrega uma versão que você confere antes de usar."
        />
        <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {mesaFeatures.map(({ icon: Icon, title, body }) => (
            <article key={title} className="surface p-6">
              <Icon className="h-6 w-6 text-cognac-700" aria-hidden="true" />
              <h3 className="mt-4 font-editorial text-xl font-bold text-stone-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{body}</p>
            </article>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a href="/cadastro" className="btn-primary">
            Criar acesso <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a
            href="/como-funciona"
            className="inline-flex items-center gap-1 text-sm font-semibold text-cognac-800 hover:underline"
          >
            Ver como funciona <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <p className="text-sm text-stone-600">
            Os trabalhos da Mesa usam créditos da conta, sem mensalidade ForgeLex.
          </p>
        </div>
      </div>
    </section>
  );
}

/** Os quatro passos da Mesa (texto do modelo novo), irmãos dos passos da pesquisa por MCP. */
export function MesaMovements() {
  return (
    <section className="page-container py-16 sm:py-20">
      <SectionHeader eyebrow="Na Mesa de trabalho" title="Da pergunta à peça." />
      <ol className="mt-9 grid gap-4 md:grid-cols-2">
        {mesaSteps.map((step) => (
          <li key={step.number} className="border-l-2 border-champagne-border py-2 pl-6">
            <span className="text-sm font-bold text-cognac-700">{step.number}</span>
            <h3 className="mt-3 font-editorial text-xl font-bold text-stone-900">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Os três pontos de "Por que o ForgeLex existe"; a tela de entrada do tema gelo os repete. */
export const PILLARS: ReadonlyArray<readonly [string, string]> = [
  ['Pesquisa que dá para conferir', 'Resultados e autoridades apresentam dados de origem e estado de verificação.'],
  ['No seu aplicativo de IA', 'Pesquise pelo ChatGPT ou Claude com ferramentas MCP autorizadas.'],
  [
    'Custos visíveis',
    'A conta apresenta créditos e atividade; os custos do modelo pertencem ao aplicativo conectado escolhido.',
  ],
];

export function Problems() {
  return (
    <section className="border-y border-champagne-border bg-white/70 py-16 sm:py-20">
      <div className="page-container">
        <SectionHeader
          eyebrow="Por que o ForgeLex existe"
          title="O argumento precisa conservar o caminho até sua fonte."
          text="Use pesquisa com dados de origem no seu aplicativo de IA e confira as decisões retornadas antes de utilizá-las."
        />
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {PILLARS.map(([title, body]) => (
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

export function Movements({ model = false }: { model?: boolean }) {
  const steps = model ? modelMovements : movements;
  return (
    <section className="page-container py-16 sm:py-20">
      <SectionHeader eyebrow="Como funciona" title="Da conta à pesquisa com fontes." />
      <ol className="mt-9 grid gap-4 md:grid-cols-2">
        {steps.map((step, index) => (
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

export function Capabilities({ model = false }: { model?: boolean }) {
  const items = model
    ? modelCapabilities
    : capabilities.map((item, index) => ({ ...item, id: ['pesquisa', 'integracao', 'conta', 'api'][index] }));
  return (
    <section className="border-y border-champagne-border bg-white/70 py-16 sm:py-20">
      <div className="page-container">
        <div className="scroll-mt-24" id="casos">
          <span id="rascunhos" />
          <span id="revisao" />
          {!model && (
            <p className="mb-6 text-sm text-stone-600">
              O fluxo de casos, rascunhos e revisão está suspenso na interface. Veja abaixo os recursos de pesquisa e
              integração disponíveis.
            </p>
          )}
        </div>
        <SectionHeader
          eyebrow="Ferramentas do produto"
          title={
            model ? 'Mesa, pesquisa, conexão e conta em um só lugar.' : 'Pesquisa, conexão e conta em um só lugar.'
          }
        />
        <div className="mt-9 grid gap-5 md:grid-cols-2">
          {items.map(({ icon: Icon, title, body, id }) => (
            <article id={id} key={title} className={`surface scroll-mt-24 p-6 ${id === 'mesa' ? 'md:col-span-2' : ''}`}>
              <Icon className="h-6 w-6 text-cognac-700" aria-hidden="true" />
              <h3 className="mt-4 font-editorial text-xl font-bold text-stone-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{body}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-6 text-stone-600">
          Confira as autoridades retornadas e sua proveniência. A decisão jurídica e o uso dos resultados permanecem sob
          responsabilidade humana.
        </p>
      </div>
    </section>
  );
}

export function WaysToUse({ model = false }: { model?: boolean }) {
  const mesa = [
    'Mesa de trabalho',
    'Descreva o que precisa e a Mesa orienta, elabora e revisa a peça no próprio site, com anexos em PDF, texto ou Markdown.',
    '/cadastro',
    'Criar acesso',
  ];
  return (
    <section className="page-container py-16 sm:py-20">
      <SectionHeader
        eyebrow="Use do seu jeito"
        title="Escolha onde o trabalho acontece."
        text={
          model
            ? 'Trabalhe a peça na Mesa, conecte sua IA por MCP, pesquise no site ou integre seu software por API REST.'
            : 'Conecte sua IA por MCP, pesquise no site ou integre seu software por API REST.'
        }
      />
      <div className={`mt-9 grid gap-4 ${model ? 'md:grid-cols-2 lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {[
          ...(model ? [mesa] : []),
          [
            'Pesquisa no site',
            'Pesquise decisões dos tribunais disponíveis e gerencie sua conta e seus créditos no ForgeLex.',
            '/cadastro',
            'Criar acesso',
          ],
          [
            'ChatGPT ou Claude',
            'Use ferramentas ForgeLex por MCP quando o aplicativo conectado e a sua conta oferecerem essa opção.',
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
          text="Você adiciona créditos pré-pagos em reais, sem mensalidade ForgeLex. A pesquisa jurisprudencial válida é faturável, inclusive quando não retorna resultados. Abrir e verificar uma autoridade não têm cobrança própria no contrato vigente."
        />
        <div className="surface p-6">
          <p className="text-sm font-semibold text-stone-900">O que a cobrança cobre</p>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            O ForgeLex cobra suas operações jurídicas. Assinatura, modelo e tokens do ChatGPT, Claude ou outro
            aplicativo conectado pertencem ao serviço escolhido pelo usuário.
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
            'As ferramentas recebem chamadas autenticadas e os argumentos enviados pelo aplicativo conectado. Consulte e revogue aplicativos autorizados na página de conexão.',
          ],
          [
            'Credenciais e auditoria',
            'O acesso identifica sua conta. As chaves recebem proteção no armazenamento e informações secretas são removidas dos registros de atividade.',
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

export function FAQ({ model = false }: { model?: boolean }) {
  const items = model ? modelFaq : faq;
  return (
    <section id="perguntas" className="scroll-mt-24 border-t border-champagne-border bg-white/70 py-16 sm:py-20">
      <div className="page-container">
        <SectionHeader eyebrow="Perguntas frequentes" title="Respostas antes de criar acesso." />
        <div className="mt-8 max-w-4xl divide-y divide-champagne-border border-y border-champagne-border">
          {items.map((item) => (
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
      <h1 className="mt-4 max-w-4xl break-words font-editorial text-4xl font-bold leading-tight text-stone-950 sm:text-5xl">
        {title}
      </h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-stone-600">{text}</p>
    </div>
  );
}
