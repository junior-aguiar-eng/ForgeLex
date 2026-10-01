import { useEffect } from 'react';
import type { PublicPage } from '../navigation/site-routes';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { applyPublicMetadata } from './public-metadata';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { HowPage } from './pages/HowPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { CreditsPage } from './pages/CreditsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { GuidePage } from './pages/GuidePage';
import { ApiDocsPage } from './pages/ApiDocsPage';

const pages = {
  home: HomePage,
  product: ProductPage,
  how: HowPage,
  integrations: IntegrationsPage,
  credits: CreditsPage,
  guide: GuidePage,
  api_docs: ApiDocsPage,
  not_found: NotFoundPage,
} satisfies Record<PublicPage, () => React.JSX.Element>;

export function PublicSite({ page }: { page: PublicPage }) {
  useEffect(() => {
    applyPublicMetadata(page);
    if (window.location.hash)
      requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView());
  }, [page]);

  const Page = pages[page];

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
        <Page />
      </main>
      <PublicFooter />
    </div>
  );
}
