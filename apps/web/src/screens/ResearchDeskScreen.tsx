import React, { useState } from 'react';
import { AlertCircle, ExternalLink, FileCheck2, Search, ShieldCheck } from 'lucide-react';
import { AuthorityVerification, SearchResultItem, useApp } from '../context/AppContext';

const statusLabel: Record<AuthorityVerification['status'], string> = {
  VERIFIED_OFFICIAL: 'Verificado na fonte oficial',
  VERIFIED_PROVIDER: 'Verificado pelo provedor',
  UNVERIFIED: 'Não verificado',
  CONFLICTING_METADATA: 'Metadados conflitantes',
  NOT_FOUND: 'Não localizado',
};

export const ResearchDeskScreen: React.FC = () => {
  const { performSearch, verifyAuthority } = useApp();
  const [query, setQuery] = useState('');
  const [court, setCourt] = useState('TODOS');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [processNumber, setProcessNumber] = useState('');
  const [judgmentDate, setJudgmentDate] = useState('');
  const [verification, setVerification] = useState<AuthorityVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    setHasSearched(true);
    setBusy(true);
    setError(null);
    try {
      setResults(await performSearch(query, court));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Não foi possível concluir a pesquisa.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setVerification(await verifyAuthority(court, processNumber, judgmentDate || undefined));
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : 'Não foi possível verificar a autoridade.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-8 md:py-12">
      <div className="page-container space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="space-y-3">
            <div className="eyebrow inline-flex items-center gap-2 rounded-full bg-cognac-100 px-3 py-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Pesquisa jurídica
            </div>
            <h1 className="font-editorial text-4xl font-bold text-stone-950">Pesquisa com trilha de proveniência</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-stone-600">
              Consulte resultados reconciliados por tribunal, confira a autoridade pelo número do processo e mantenha visível a fonte que sustenta cada resultado.
            </p>
          </div>
          <div className="text-right text-xs text-stone-500">Resultados e cobrança dependem da API autenticada.</div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
          <section className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-2 text-stone-900">
              <Search className="w-5 h-5 text-cognac-700" />
              <h2 className="font-editorial text-xl font-bold">Consulta jurisprudencial</h2>
            </div>
            <form onSubmit={search} className="space-y-3">
              <div className="flex flex-col md:flex-row gap-3">
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="flex-1 px-4 py-3 rounded-xl border border-champagne-border bg-[#FDFBF7] text-sm focus:outline-none focus:ring-2 focus:ring-cognac-500/20" placeholder="Tema, tese ou número do processo" />
                <select value={court} onChange={(event) => setCourt(event.target.value)} className="md:w-40 px-3 py-3 rounded-xl border border-champagne-border bg-[#FDFBF7] text-sm">
                  <option value="TODOS">Todos (STJ nesta fase)</option>
                  <option>STJ</option>
                </select>
                <button disabled={busy} className="px-5 py-3 rounded-xl bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white text-sm font-semibold">{busy ? 'Consultando...' : 'Consultar'}</button>
              </div>
              <p className="text-[11px] text-stone-500">Cada resultado mantém a fonte e o estado de verificação para conferência.</p>
            </form>

            {results.length > 0 && (
              <div className="space-y-3 pt-2">
                {results.map((item) => (
                  <article key={item.id} className="rounded-xl border border-champagne-border bg-[#FDFBF7] p-4 space-y-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded-md bg-cognac-100 text-cognac-800 text-xs font-bold">{item.court}</span>
                        <span className="text-sm font-bold text-stone-900">{item.processNumber}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><ShieldCheck className="w-3.5 h-3.5" />{statusLabel[item.verificationStatus]}</span>
                    </div>
                    <p className="text-xs text-stone-700 leading-relaxed">{item.ementa}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
                      <span>Relatoria: {item.relator} · {item.chamber ? `${item.chamber} · ` : ''}Julgamento: {item.judgmentDate}</span>
                      {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-cognac-700 hover:underline">Ver fonte retornada<ExternalLink className="h-3 w-3" /></a> : <span>Fonte não informada</span>}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {hasSearched && !busy && results.length === 0 && !error && <div className="surface-subtle p-6 text-center text-sm text-stone-500">Nenhum resultado retornado pela API para esta consulta.</div>}
          </section>

          <section className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-2 text-stone-900">
              <FileCheck2 className="w-5 h-5 text-cognac-700" />
              <h2 className="font-editorial text-xl font-bold">Verificar autoridade</h2>
            </div>
            <form onSubmit={verify} className="space-y-3">
              <label className="block text-xs font-semibold text-stone-600">Tribunal
                <select value={court === 'TODOS' ? 'STJ' : court} onChange={(event) => setCourt(event.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm"><option>STJ</option></select>
              </label>
              <label className="block text-xs font-semibold text-stone-600">Número do processo
                <input value={processNumber} onChange={(event) => setProcessNumber(event.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
              </label>
              <label className="block text-xs font-semibold text-stone-600">Data do julgamento (opcional)
                <input value={judgmentDate} onChange={(event) => setJudgmentDate(event.target.value)} placeholder="DD/MM/AAAA" className="mt-1 w-full px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
              </label>
              <button disabled={busy} className="w-full px-4 py-3 rounded-xl border border-cognac-300 bg-cognac-50 hover:bg-cognac-100 disabled:bg-stone-100 text-cognac-800 text-sm font-semibold">Verificar por R$ 0,20</button>
            </form>

            {verification && (
              <div className={`rounded-xl p-4 border ${verification.status === 'VERIFIED_OFFICIAL' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'} space-y-2`}>
                <p className="text-sm font-bold text-stone-900">{statusLabel[verification.status]}</p>
                {verification.authority && <p className="text-xs text-stone-700">{verification.authority.court} · {verification.authority.processNumber} · {verification.authority.relator}</p>}
                {verification.reason && <p className="text-xs text-amber-800">{verification.reason}</p>}
                <p className="text-[10px] text-stone-500">Conferido em {new Date(verification.checkedAt).toLocaleString('pt-BR')}</p>
              </div>
            )}
          </section>
        </div>

        {error && <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-3 text-sm"><AlertCircle className="w-5 h-5 flex-shrink-0" />{error}</div>}
      </div>
    </div>
  );
};
