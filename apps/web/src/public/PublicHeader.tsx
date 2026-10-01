import { useEffect, useRef, useState } from 'react';
import { Menu, Scale, X } from 'lucide-react';

const navigation = [
  { label: 'Produto', href: '/produto' },
  { label: 'Como funciona', href: '/como-funciona' },
  { label: 'Pesquisa jurídica', href: '/produto#pesquisa' },
  { label: 'Integrações', href: '/integracoes' },
  { label: 'Desenvolvedores', href: '/desenvolvedores/api' },
] as const;

export function PublicHeader() {
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
      const items = [...menu.current.querySelectorAll<HTMLElement>('a,button:not([disabled])')].filter(
        (item) => item.getClientRects().length > 0,
      );
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
