import type { PublicPage } from '../navigation/site-routes';

export const CANONICAL_ORIGIN = 'https://nexojuris.ia.br';

const metadata: Record<PublicPage, { title: string; description: string; path: string | null }> = {
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
    description: 'Consulte gratuitamente dados públicos e movimentações dos tribunais disponíveis pelo CNJ / DataJud, sem cadastro ou créditos.',
    path: '/consulta-processual',
  },
  not_found: {
    title: 'Página não encontrada · ForgeLex',
    description: 'Este endereço não está disponível. Confira a URL ou volte ao início do ForgeLex.',
    path: null,
  },
};

export function applyPublicMetadata(page: PublicPage): void {
  const current = metadata[page];
  document.title = current.title;
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', current.description);
  document
    .querySelector<HTMLMetaElement>('meta[name="robots"]')
    ?.setAttribute('content', current.path ? 'index,follow' : 'noindex,follow');
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (current.path) {
    const link = canonical ?? document.createElement('link');
    link.rel = 'canonical';
    link.href = `${CANONICAL_ORIGIN}${current.path}`;
    if (!canonical) document.head.append(link);
  } else canonical?.remove();
}
