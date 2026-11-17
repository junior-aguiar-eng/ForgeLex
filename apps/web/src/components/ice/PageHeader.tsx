import React from 'react';

/**
 * Cabeçalho da página no tema gelo (protótipo de 09/11): barra translúcida com título, subtítulo e, se houver, as
 * seções da tela. A marca e a navegação ficam na lateral.
 */
export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children?: React.ReactNode;
}> = ({ title, subtitle, eyebrow, children }) => (
  <header className="border-b border-line bg-surface-muted/90 px-6 py-5 backdrop-blur-md sm:px-8">
    {eyebrow && <span className="block text-xs text-subtle">{eyebrow}</span>}
    <h1 className="font-editorial text-[26px] font-semibold leading-tight text-ink">{title}</h1>
    {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
    {children}
  </header>
);

/** Seções da tela, em botões: a tela atual leva `aria-current`. */
export const SectionTabs: React.FC<{
  label: string;
  items: Array<{ key: string; label: string; active: boolean; onSelect: () => void }>;
}> = ({ label, items }) => (
  <nav aria-label={label} className="mt-3.5 flex flex-wrap gap-1">
    {items.map((item) => (
      <button
        key={item.key}
        type="button"
        onClick={item.onSelect}
        aria-current={item.active ? 'page' : undefined}
        className={`inline-flex min-h-11 items-center rounded-[9px] px-3.5 text-[13px] transition-colors ${
          item.active
            ? 'bg-accent-tint font-semibold text-accent-strong'
            : 'font-medium text-muted hover:bg-canvas-deep hover:text-ink'
        }`}
      >
        {item.label}
      </button>
    ))}
  </nav>
);
