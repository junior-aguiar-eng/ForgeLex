import React, { useEffect, useRef, useState } from 'react';
import type { PdfTextResult } from '../documents/pdf-text';

export function PdfTextImport({ disabled, onExtract, onLoadingChange }: { disabled: boolean; onExtract: (result: PdfTextResult, title: string) => void; onLoadingChange: (loading: boolean) => void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); onLoadingChange(false); }, [onLoadingChange]);

  const selectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setLoading(true);
    onLoadingChange(true);
    setError('');
    setMessage('Extraindo texto do PDF…');
    try {
      const { extractPdfText } = await import('../documents/pdf-text');
      const result = await extractPdfText(file, active.signal);
      if (active.signal.aborted) return;
      onExtract(result, file.name.replace(/\.pdf$/i, ''));
      setMessage(`${result.pageCount} página(s) extraída(s). Confira o texto antes de salvar.${result.emptyPages.length ? ` Páginas sem texto: ${result.emptyPages.join(', ')}.` : ''}`);
    } catch (cause) {
      if (!active.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível extrair texto do PDF.');
        setMessage('');
      }
    } finally { if (!active.signal.aborted) { setLoading(false); onLoadingChange(false); } }
  };

  return <div className="space-y-2 rounded-xl border border-champagne-border bg-[#FDFBF7] p-4" aria-busy={loading}>
    <label htmlFor="pdf-text-import" className={`btn-secondary relative focus-within:outline focus-within:outline-[3px] focus-within:outline-cognac-700 focus-within:outline-offset-2 ${disabled || loading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      Selecionar PDF textual
      <input id="pdf-text-import" aria-describedby="pdf-text-help" type="file" accept=".pdf,application/pdf" disabled={disabled || loading} onChange={(event) => void selectFile(event)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
    </label>
    <p id="pdf-text-help" className="text-xs text-stone-500">Até 15 MB e 300 páginas. A extração ocorre neste navegador. Ao salvar, somente o texto é armazenado; o PDF original e sua diagramação não são preservados.</p>
    {message && <p role="status" className="text-xs text-stone-700">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
