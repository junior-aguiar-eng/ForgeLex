import type { PublicPage } from '../navigation/site-routes';
import { DEFAULT_PUBLIC_ORIGIN, metadata, modelMetadata } from './public-metadata-data';

/** Origem pública. `VITE_PUBLIC_ORIGIN` (D3, virada de domínio) a troca no build; sem ela vale o domínio atual. */
export const CANONICAL_ORIGIN = (import.meta.env.VITE_PUBLIC_ORIGIN?.trim() || DEFAULT_PUBLIC_ORIGIN).replace(
  /\/$/,
  '',
);

export function metadataFor(page: PublicPage, model = false) {
  return (model && modelMetadata[page]) || metadata[page];
}

export function applyPublicMetadata(page: PublicPage, model = false): void {
  const current = metadataFor(page, model);
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
