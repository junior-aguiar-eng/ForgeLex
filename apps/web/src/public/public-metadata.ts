import type { PublicPage } from '../navigation/site-routes';

export const CANONICAL_ORIGIN = 'https://nexojuris.ia.br';

const metadata: Record<PublicPage, { title: string; description: string; path: string | null }> = {
  home: {
    title: 'ForgeLex · Do caso à minuta',
    description:
      'Organize casos, pesquise jurisprudência do STJ e prepare rascunhos com fontes rastreáveis e revisão humana.',
    path: '/',
  },
  product: {
    title: 'Produto · ForgeLex',
    description:
      'Conheça as ferramentas para casos e evidências, pesquisa do STJ, estratégia, rascunhos e revisão jurídica.',
    path: '/produto',
  },
  how: {
    title: 'Como funciona · ForgeLex',
    description:
      'Estruture o caso, pesquise e confira fontes, construa a linha jurídica e revise a minuta em quatro movimentos.',
    path: '/como-funciona',
  },
  integrations: {
    title: 'Integrações · ForgeLex',
    description:
      'Use o espaço de trabalho ForgeLex ou conecte ferramentas jurídicas por MCP e API REST, com autorização.',
    path: '/integracoes',
  },
  credits: {
    title: 'Créditos · ForgeLex',
    description:
      'Entenda os créditos pré-pagos em reais, a pesquisa faturável do STJ e a separação dos custos do host de IA.',
    path: '/creditos',
  },
  guide: {
    title: 'Guia para advogados · ForgeLex',
    description:
      'Veja como começar no ForgeLex, conferir autoridades e usar um host compatível com MCP, respeitando privacidade e custos.',
    path: '/guia',
  },
  api_docs: {
    title: 'API para desenvolvedores · ForgeLex',
    description:
      'Integre operações jurídicas por API REST: autenticação, escopos, exemplos de pesquisa, idempotência e OpenAPI.',
    path: '/desenvolvedores/api',
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
