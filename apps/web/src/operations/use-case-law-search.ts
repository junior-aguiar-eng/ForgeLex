import { useRef, useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { createSearchIntent, type SearchIntent } from './contracts';

export function useCaseLawSearch(query: string, court: string, year: string) {
  const { performSearch, retrySearch, searchBusy, searchExecution, searchFailure } = useApp();
  const lock = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const run = async (retry?: SearchIntent) => {
    if (lock.current || searchBusy) return;
    if (!retry && (query.trim().length < 2 || court !== 'STJ')) {
      setLocalError('Informe ao menos 2 caracteres e um tribunal habilitado.');
      return;
    }
    lock.current = true;
    setLocalError(null);
    const intent = retry ?? createSearchIntent(query, court as 'STJ', 20, year ? Number(year) : undefined);
    try { await (retry ? retrySearch(intent) : performSearch(intent)); }
    catch { /* Provider retains the failed intent across screen navigation. */ }
    finally { lock.current = false; }
  };
  return {
    execution: searchExecution, results: searchExecution?.results ?? [], error: localError ?? searchFailure?.message ?? null,
    hasSearched: Boolean(searchExecution || searchFailure || searchBusy), busy: searchBusy,
    search: (event?: FormEvent) => { event?.preventDefault(); return run(); },
    retry: () => searchFailure?.retryable ? run(searchFailure.intent) : Promise.resolve(),
    canRetry: Boolean(searchFailure?.retryable),
  };
}
