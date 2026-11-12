import { FilePlus2, FileSearch, Search } from 'lucide-react';

/**
 * Atalhos do estado vazio da Mesa (U2, atrás de `VITE_FORGELEX_DESK_SHELL`). Cada atalho só leva a algo que a Mesa já
 * faz: abrir a peça, preencher o pedido ou abrir a pesquisa. Nada aqui lista o catálogo de habilidades (DEC-10).
 */
export const reviewTextRequest = 'Preciso revisar este texto: ';

export function DeskShortcuts({
  onNewPiece,
  onReviewText,
  onResearch,
  disabled = false,
}: {
  onNewPiece: () => void;
  onReviewText: () => void;
  onResearch: () => void;
  disabled?: boolean;
}) {
  const items = [
    { label: 'Nova peça', hint: 'Abre a peça ao lado da conversa', icon: FilePlus2, run: onNewPiece },
    { label: 'Revisar um texto', hint: 'Começa o pedido de revisão', icon: FileSearch, run: onReviewText },
    { label: 'Pesquisar jurisprudência', hint: 'Abre a pesquisa e as fontes', icon: Search, run: onResearch },
  ];
  return (
    <section aria-label="Atalhos" className="grid gap-2 sm:grid-cols-3">
      {items.map(({ label, hint, icon: Icon, run }) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={run}
          className="flex min-h-11 flex-col items-start gap-1 rounded-xl border border-stone-200 bg-white p-3 text-left text-sm hover:bg-stone-50 disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-2 font-medium text-stone-800">
            <Icon size={16} aria-hidden="true" />
            {label}
          </span>
          <span className="text-xs text-stone-600">{hint}</span>
        </button>
      ))}
    </section>
  );
}
