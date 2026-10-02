import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { SearchResultItem } from '../operations/contracts';

export function CopyCitationButton({ item }: { item: SearchResultItem }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  const copy = async () => {
    clearTimeout(timer.current);
    setCopied(false);
    setError(null);
    setBusy(true);
    try {
      await navigator.clipboard.writeText(`${item.court}. ${item.processNumber}, Rel. ${item.relator}, j. ${item.judgmentDate}.\n\nEmenta:\n${item.ementa}`);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch { setError('Não foi possível copiar. Selecione e copie o texto manualmente.'); }
    finally { setBusy(false); }
  };
  return <div>
    <button type="button" onClick={() => void copy()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copiado!' : 'Copiar Citação'}
    </button>
    {error && <p role="alert" className="mt-1 text-xs text-amber-800">{error}</p>}
  </div>;
}
