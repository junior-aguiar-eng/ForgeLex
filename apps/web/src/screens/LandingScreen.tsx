import React, { useEffect, useState } from 'react';
import { useApp, SearchResultItem } from '../context/AppContext';
import { createSearchIntent } from '../operations/contracts';
import { 
  Search, Scale, Shield, FolderOpen,
  ExternalLink, Copy, Check, Sparkles, AlertCircle, BookmarkCheck
} from 'lucide-react';

export const LandingScreen: React.FC = () => {
  const { performSearch, recentSearches, setActiveTab, tribunals } = useApp();
  const [query, setQuery] = useState('');
  const [court, setCourt] = useState('STJ');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<SearchResultItem | null>(null);
  const searchableCourts = tribunals.data.filter((item) => item.searchable);

  useEffect(() => {
    if (!searchableCourts.some((item) => item.code === court) && searchableCourts[0]) {
      setCourt(searchableCourts[0].code);
    }
  }, [court, searchableCourts]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const execution = await performSearch(createSearchIntent(query, court as 'STJ'));
      setResults(execution.results);
    } catch (err: any) {
      setSearchError(err.message || 'Erro ao consultar jurisprudência.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleQuickTrigger = (text: string) => {
    setQuery(text);
    if (!searchableCourts.some((item) => item.code === court)) return;
    performSearch(createSearchIntent(text, court as 'STJ')).then((execution) => setResults(execution.results)).catch(() => {});
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="py-8 md:py-12">
      <div className="page-container space-y-12">
        
        {/* HERO EDITORIAL */}
        <div className="text-center max-w-4xl mx-auto space-y-6">
          <div className="eyebrow inline-flex items-center gap-2 rounded-full bg-cognac-100/70 px-3 py-1">
            <Sparkles className="w-3.5 h-3.5 text-cognac-600" />
            <span>Pesquisa e preparação jurídica</span>
          </div>

          <h1 className="font-editorial text-4xl font-bold tracking-tight text-stone-950 leading-[1.15] sm:text-5xl">
            A inteligência jurídica que <br className="hidden sm:inline" />
            <span className="text-cognac-700 italic">pensa</span> antes de peticionar.
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-stone-600 max-w-2xl mx-auto font-normal leading-relaxed">
            Pesquise jurisprudência, organize o contexto do caso e prepare peças com fontes visíveis e revisão humana no momento certo.
          </p>

          {/* Quick Stats Banner */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm text-stone-500 font-medium">
            <div className="flex items-center space-x-1.5">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span>Revisão humana antes de efeitos externos</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <BookmarkCheck className="w-4 h-4 text-cognac-600" />
              <span>Fontes e fatos rastreáveis</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Scale className="w-4 h-4 text-amber-600" />
              <span>Pesquisa com cobrança transparente</span>
            </div>
          </div>
        </div>

        <div className="surface-subtle mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-stone-800">Comece pelo trabalho do caso</p><p className="text-xs text-stone-500">Abra um caso ou pesquise uma fonte jurídica para iniciar.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setActiveTab('matter')} className="btn-secondary inline-flex items-center gap-2"><FolderOpen className="h-4 w-4" aria-hidden="true" />Abrir caso</button></div></div>

        {/* SEARCH BAR (Inspirada em ForgeLex_01_Landing.png) */}
        <div className="champagne-card mx-auto max-w-4xl space-y-4 rounded-xl bg-white p-4 sm:p-5">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            
            {/* Input */}
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="pesquisa-principal"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Consulte acórdãos, súmulas, número CNJ ou teses jurídicas..."
                className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-champagne-border bg-[#FDFBF7] text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-cognac-500/20 focus:border-cognac-600 transition-all"
              />
            </div>

            {/* Court Dropdown */}
            <div className="w-full md:w-44">
              <select
                value={court}
                onChange={(e) => setCourt(e.target.value)}
                className="w-full px-3 py-3.5 rounded-xl border border-champagne-border bg-[#FDFBF7] text-sm font-medium text-stone-700 focus:outline-none focus:border-cognac-600"
              >
                {searchableCourts.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}
              </select>
            </div>

            {/* Search Button */}
            <button
              type="submit"
              disabled={isSearching || searchableCourts.length === 0}
              className="px-6 py-3.5 rounded-xl bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white font-medium text-sm shadow-md shadow-cognac-900/10 flex items-center justify-center space-x-2 transition-all active:scale-95"
            >
              {isSearching ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Pesquisando...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Consultar</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Queries & Info */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-stone-500 border-t border-stone-100">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="font-semibold text-stone-700">Exemplos de temas:</span>
              <button 
                type="button" 
                onClick={() => handleQuickTrigger('capitalização diária de juros')}
                className="hover:text-cognac-700 hover:underline"
              >
                Capitalização CCB
              </button>
              <span>•</span>
              <button 
                type="button" 
                onClick={() => handleQuickTrigger('compartilhamento de dados IBGE')}
                className="hover:text-cognac-700 hover:underline"
              >
                Proteção de Dados MP 954
              </button>
              <span>•</span>
              <button 
                type="button" 
                onClick={() => handleQuickTrigger('lucros cessantes atraso imóvel')}
                className="hover:text-cognac-700 hover:underline"
              >
                Tema 996 STJ
              </button>
            </div>

            <div className="text-right font-medium text-stone-500">
              A tarifa e o saldo serão informados pela API autenticada.
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {searchError && (
          <div className="max-w-4xl mx-auto p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center space-x-3 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <span>{searchError}</span>
            <button 
              onClick={() => setActiveTab('credits')}
              className="ml-auto underline font-semibold hover:text-amber-900"
            >
              Recarregar créditos
            </button>
          </div>
        )}

        {/* SEARCH RESULTS FEED */}
        {results.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-2xl font-bold text-stone-900">
                Resultados da pesquisa ({results.length})
              </h2>
              <span className="text-xs font-medium text-stone-500">
                Ordenados por relevância e verificação
              </span>
            </div>

            <div className="space-y-4">
              {results.map((item) => (
                <div 
                  key={item.id} 
                  className="champagne-card p-6 rounded-2xl bg-white shadow-card space-y-4 hover:border-cognac-400 transition-colors"
                >
                  {/* Top Row: Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                        item.court === 'STF' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                        item.court === 'STJ' ? 'bg-cognac-100 text-cognac-800 border border-cognac-200' :
                        'bg-stone-100 text-stone-700 border border-stone-200'
                      }`}>
                        {item.court}
                      </span>
                      <span className="text-sm font-bold text-stone-900">
                        {item.processNumber}
                      </span>
                      {item.isBinding && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                          Precedente Vinculante
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-stone-500 font-medium">
                      Julgamento: {item.judgmentDate}
                    </span>
                  </div>

                  {/* Relator */}
                  <div className="text-xs font-medium text-stone-600">
                    <span className="text-stone-400">Relatoria:</span> {item.relator}
                  </div>

                  {/* Ementa */}
                  <p className="text-xs sm:text-sm text-stone-700 leading-relaxed font-sans bg-[#FDFBF7] p-4 rounded-xl border border-champagne-border">
                    {item.ementa}
                  </p>

                  {/* Bottom Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
                    <div className="text-[11px] text-stone-400">Proveniência retornada pela API</div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(item.id, `${item.court}. ${item.processNumber}, Rel. ${item.relator}, j. ${item.judgmentDate}.\n\nEmenta:\n${item.ementa}`)}
                        className="px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 font-medium flex items-center space-x-1.5 transition-colors"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-stone-500" />
                            <span>Copiar Citação</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedDoc(item)}
                        className="px-3 py-1.5 rounded-lg bg-cognac-50 border border-cognac-200 hover:bg-cognac-100 text-cognac-800 font-medium flex items-center space-x-1.5 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-cognac-600" />
                        <span>Ver Detalhes</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODAL DETALHES JURÍDICOS */}
        {selectedDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm animate-fadeIn">
            <div className="champagne-card bg-white w-full max-w-2xl rounded-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-md bg-cognac-100 text-cognac-800 text-xs font-bold">
                      {selectedDoc.court}
                    </span>
                    <h3 className="font-editorial text-xl font-bold text-stone-900">
                      {selectedDoc.processNumber}
                    </h3>
                  </div>
                  <p className="text-xs text-stone-500">
                    Relatoria de {selectedDoc.relator} • Data: {selectedDoc.judgmentDate}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs uppercase font-bold tracking-wider text-stone-500">Ementa completa</h4>
                <div className="p-4 rounded-xl bg-[#FDFBF7] border border-champagne-border text-xs sm:text-sm text-stone-800 leading-relaxed">
                  {selectedDoc.ementa}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                  <span className="text-stone-400 block mb-0.5">Precedente Vinculante:</span>
                  <span className="font-bold text-stone-800">{selectedDoc.isBinding ? 'Sim (Súmula / Tema)' : 'Jurisprudência Persuasiva'}</span>
                </div>
                <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                  <span className="text-stone-400 block mb-0.5">Proveniência:</span>
                  {selectedDoc.sourceUrl ? <a href={selectedDoc.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-cognac-700 hover:underline flex items-center">Acessar fonte retornada <ExternalLink className="w-3 h-3 ml-1" /></a> : <span className="font-semibold text-stone-600">Não informada pela API</span>}
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50"
                >
                  Fechar
                </button>
                <button
                  onClick={() => {
                    setSelectedDoc(null);
                    setActiveTab('matter');
                  }}
                  className="px-5 py-2 rounded-xl bg-cognac-700 hover:bg-cognac-800 text-white text-sm font-medium shadow-sm"
                >
                  Abrir caso
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RECENT SEARCHES FOOTER */}
        {recentSearches.data.length === 0 && !results.length && (
          <div className="surface-subtle mx-auto max-w-4xl p-4 text-center"><h2 className="text-sm font-semibold text-stone-800">Nenhuma consulta persistida</h2><p className="mt-1 text-xs text-stone-500">Pesquisas concluídas aparecerão aqui após confirmação da API.</p></div>
        )}
        {recentSearches.data.length > 0 && <div className="champagne-card-subtle p-6 rounded-2xl max-w-4xl mx-auto space-y-3">
          <h4 className="text-xs uppercase font-bold tracking-wider text-stone-500">
            Consultas recentes
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recentSearches.data.map((item) => (
              <div 
                key={item.id}
                onClick={() => handleQuickTrigger(item.query)}
                className="p-3 rounded-xl bg-white border border-champagne-border hover:border-cognac-400 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1">
                  <span className="font-semibold text-cognac-700">{item.court}</span>
                  <span>{new Date(item.createdAt).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-xs text-stone-800 font-medium line-clamp-1">
                  {item.query}
                </p>
              </div>
            ))}
          </div>
        </div>}

      </div>
    </div>
  );
};
