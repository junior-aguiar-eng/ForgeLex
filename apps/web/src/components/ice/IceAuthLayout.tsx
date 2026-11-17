import React from 'react';
import { Scale, Search, ShieldCheck, WalletCards } from 'lucide-react';
import { PRODUCT_DESCRIPTION } from '../../config/research-copy';
import { PILLARS } from '../../public/pages/PublicSections';

const ICONS = [Search, ShieldCheck, WalletCards] as const;

/**
 * Entrar no tema gelo (protótipo de 09/11): uma coluna de contexto, com a marca, o que o ForgeLex faz e três pontos, e
 * o formulário num cartão ao lado. Abaixo de `lg` a coluna de contexto some e fica só o formulário. O texto é o que o
 * site já tem; o texto novo é da V5A.
 */
export const IceAuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className="flex min-h-screen flex-wrap bg-canvas">
    <section
      aria-label="Sobre o ForgeLex"
      className="hidden min-w-0 flex-[1_1_420px] flex-col border-r border-line bg-surface px-12 pb-14 pt-12 lg:flex"
    >
      <a href="/" className="inline-flex items-center gap-2.5 text-ink" aria-label="ForgeLex, página inicial">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent text-surface">
          <Scale className="h-[17px] w-[17px]" aria-hidden="true" />
        </span>
        <span className="font-editorial text-xl font-semibold">ForgeLex</span>
      </a>
      <p className="mt-11 max-w-[420px] font-editorial text-4xl font-semibold leading-[1.18] text-ink">
        Fontes visíveis. Decisões sob controle humano.
      </p>
      <p className="mt-[18px] max-w-[440px] text-[15px] leading-[1.7] text-muted">{PRODUCT_DESCRIPTION}</p>
      <ul className="mt-9 flex flex-col gap-[18px]">
        {PILLARS.map(([title, body], index) => {
          const Icon = ICONS[index % ICONS.length]!;
          return (
            <li key={title} className="flex gap-3.5">
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-accent-tint text-accent">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{title}</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-subtle">{body}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
    <section className="flex min-w-0 flex-[999_1_460px] items-center justify-center px-4 py-10 sm:px-10 sm:py-14">
      <div className="surface w-full max-w-[420px] px-6 py-8 sm:px-8" aria-label="Acesso ao ForgeLex" role="region">
        {children}
      </div>
    </section>
  </main>
);
