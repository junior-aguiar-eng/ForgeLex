import { CopyCitationButton } from './CopyCitationButton';
import { mapSearchResult } from '../operations/operations-client';

export interface SavedCaseAuthority { id: string; savedAt: string; authority: unknown }

export function CaseAuthorities({ items }: { items: SavedCaseAuthority[] }) {
  return <section id="julgados" aria-labelledby="case-authorities-title" className="champagne-card rounded-2xl bg-white p-5 sm:p-6 space-y-4">
    <h2 id="case-authorities-title" className="font-editorial text-xl font-bold text-stone-900">Julgados do caso</h2>
    <p className="text-sm text-stone-600">Fontes guardadas para consulta e seleção nos rascunhos. O vínculo não confirma, por si, a aplicação do julgado ao caso.</p>
    {items.length === 0 && <p className="text-sm text-stone-500">Nenhum julgado salvo. Em Pesquisa, use “Salvar no caso” no resultado escolhido.</p>}
    {items.map(record => {
      const item = mapSearchResult(record.authority);
      return <article key={record.id} className="rounded-xl border border-champagne-border bg-[#FDFBF7] p-4 space-y-3 break-words">
        <div className="text-sm font-semibold text-stone-900">{item.court} · <span>{item.processNumber}</span></div>
        <p className="text-xs text-stone-600">Relatoria: {item.relator} · Julgamento: {item.judgmentDate}</p>
        <p className="text-xs leading-relaxed text-stone-700 whitespace-pre-wrap">{item.ementa}</p>
        <p className="text-xs text-stone-500">{item.verificationStatus === 'VERIFIED_OFFICIAL' ? 'Verificado na fonte oficial' : item.verificationStatus === 'VERIFIED_PROVIDER' ? 'Verificado pelo provedor' : 'Não verificado'} · Salvo em {new Date(record.savedAt).toLocaleDateString('pt-BR')}</p>
        <div className="flex flex-wrap items-center gap-3"><CopyCitationButton item={item} />{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-cognac-700 hover:underline">Abrir fonte</a>}</div>
      </article>;
    })}
  </section>;
}
