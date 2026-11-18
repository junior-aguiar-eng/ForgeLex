import { resolveApiOrigin } from '../api-client';

/** Frase de apresentação do rodapé. No modelo novo (V5A) segue o que o site afirma: fonte, MCP, Mesa e API. */
export const FOOTER_TAGLINE =
  'Jurisprudência dos tribunais superiores e consulta processual por MCP e API, com fontes e proveniência.';
export const FOOTER_TAGLINE_MODEL =
  'Jurisprudência com fonte e estado de verificação para a sua IA, por MCP, com Mesa de trabalho e API.';

export function PublicFooter({ model = false }: { model?: boolean }) {
  const groups = [
    {
      title: 'Produto',
      links: [
        ['Visão geral', '/'],
        ['Conectar IA', '/entrar?next=%2Fapp%2Fconectar'],
        ['Pesquisa jurídica', '/produto#pesquisa'],

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
        ['Consulta processual gratuita', '/consulta-processual'],
        ['Guia para advogados', '/guia'],
        ['Como funciona', '/como-funciona'],
        ['Perguntas frequentes', '/#perguntas'],
      ],
    },
    {
      title: 'Legal',
      links: [
        ['Termos de uso', '/legal/termos-de-uso.html'],
        ['Política de Privacidade', '/legal/privacidade.html'],
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
          <p className="mt-4 text-sm leading-6 text-stone-600">{model ? FOOTER_TAGLINE_MODEL : FOOTER_TAGLINE}</p>
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
