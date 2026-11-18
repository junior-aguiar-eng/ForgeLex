import type { PublicPage } from '../navigation/site-routes';

/**
 * Tabelas de título e descrição das páginas públicas. Ficam num módulo sem `import.meta.env` para que o Vite (em
 * `vite.config.ts`) as leia ao montar o `index.html` do build, sem repetir o texto.
 */
/** Domínio público atual; `VITE_PUBLIC_ORIGIN` o troca no build (D3). */
export const DEFAULT_PUBLIC_ORIGIN = 'https://nexojuris.ia.br';

export interface PageMetadata {
  title: string;
  description: string;
  path: string | null;
}

export const metadata: Record<PublicPage, PageMetadata> = {
  home: {
    title: 'ForgeLex · Jurisprudência e consulta processual',
    description:
      'Pesquise decisões dos tribunais disponíveis com fontes e proveniência pelo ChatGPT ou Claude via MCP. Conta, créditos, API e consulta processual gratuita.',
    path: '/',
  },
  product: {
    title: 'Produto · ForgeLex',
    description:
      'Conheça a pesquisa de jurisprudência dos tribunais superiores, conexão MCP, conta e créditos, API e consulta processual gratuita.',
    path: '/produto',
  },
  how: {
    title: 'Como funciona · ForgeLex',
    description:
      'Crie seu acesso, conecte sua IA, pesquise decisões dos tribunais disponíveis e confira autoridades e proveniência.',
    path: '/como-funciona',
  },
  integrations: {
    title: 'Integrações · ForgeLex',
    description:
      'Conecte pesquisa jurídica ao ChatGPT ou Claude por MCP ou integre seu software pela API REST, com autorização.',
    path: '/integracoes',
  },
  credits: {
    title: 'Créditos · ForgeLex',
    description:
      'Entenda os créditos pré-pagos em reais, a pesquisa jurisprudencial faturável e a separação dos custos do aplicativo de IA.',
    path: '/creditos',
  },
  guide: {
    title: 'Guia para advogados · ForgeLex',
    description:
      'Veja como começar no ForgeLex, conferir autoridades e usar um aplicativo compatível com MCP, respeitando privacidade e custos.',
    path: '/guia',
  },
  api_docs: {
    title: 'API para desenvolvedores · ForgeLex',
    description:
      'Integre operações jurídicas por API REST: autenticação, escopos, exemplos de pesquisa, idempotência e OpenAPI.',
    path: '/desenvolvedores/api',
  },
  datajud: {
    title: 'Consulta processual gratuita · ForgeLex',
    description:
      'Consulte gratuitamente dados públicos e movimentações dos tribunais disponíveis pelo CNJ / DataJud, sem cadastro ou créditos.',
    path: '/consulta-processual',
  },
  not_found: {
    title: 'Página não encontrada · ForgeLex',
    description: 'Este endereço não está disponível. Confira a URL ou volte ao início do ForgeLex.',
    path: null,
  },
};

/**
 * Metadados no modelo novo (V5A). Mudam junto com o texto de cada página; a consulta processual gratuita (DataJud) e a
 * página não encontrada seguem como são.
 */
export const modelMetadata: Partial<Record<PublicPage, PageMetadata>> = {
  home: {
    title: 'ForgeLex · Sua IA, com jurisprudência que dá para conferir',
    description:
      'Conecte o ForgeLex ao ChatGPT ou ao Claude por MCP e pesquise decisões com a fonte e o estado de verificação de cada resultado, e elabore e revise peças na Mesa de trabalho. Pagamento só pelo uso e consulta processual gratuita.',
    path: '/',
  },
  product: {
    title: 'Produto · ForgeLex',
    description:
      'Mesa de trabalho que orienta, elabora e revisa peças com as fontes à vista, pesquisa com estado de verificação, conexão com o ChatGPT ou o Claude por MCP, conta com créditos, API e consulta processual gratuita.',
    path: '/produto',
  },
  how: {
    title: 'Como funciona · ForgeLex',
    description:
      'Descreva o que precisa na Mesa de trabalho, responda o que faltar e revise a peça com as fontes à vista; ou conecte o ChatGPT ou o Claude por MCP e pesquise com a fonte à vista.',
    path: '/como-funciona',
  },
  integrations: {
    title: 'Integrações · ForgeLex',
    description:
      'Conecte o ForgeLex ao ChatGPT ou ao Claude por MCP, trabalhe na Mesa de trabalho ou integre seu software pela API REST, com autorização.',
    path: '/integracoes',
  },
  credits: {
    title: 'Créditos · ForgeLex',
    description:
      'Você paga só pelo uso: créditos pré-pagos em reais para a pesquisa jurisprudencial válida e os trabalhos da Mesa, e custos do aplicativo de IA separados.',
    path: '/creditos',
  },
  guide: {
    title: 'Guia para advogados · ForgeLex',
    description:
      'Use a Mesa de trabalho para elaborar e revisar peças, conecte o ChatGPT ou o Claude ao ForgeLex por MCP e pesquise com a fonte à vista, respeitando privacidade e custos.',
    path: '/guia',
  },
  api_docs: {
    title: 'API para desenvolvedores · ForgeLex',
    description:
      'Integre a pesquisa do ForgeLex ao seu software por API REST: autenticação, escopos, exemplos, idempotência e OpenAPI.',
    path: '/desenvolvedores/api',
  },
};
