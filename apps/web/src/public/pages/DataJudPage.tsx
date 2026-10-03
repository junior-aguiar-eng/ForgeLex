import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Search, LoaderCircle, ExternalLink } from 'lucide-react';
import { formatCnjNumber, formatDataJudDate, lookupTjalProcess, type DataJudResult } from '../../datajud-client';
import { PageIntro } from './PublicSections';

export function DataJudPage() {
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DataJudResult | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  async function consult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true);
    setError('');
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 45000);
    try { setResult(await lookupTjalProcess(number, controller.signal)); }
    catch (failure) {
      if (controller.signal.aborted && !timedOut) return;
      setError(timedOut ? 'A consulta demorou a responder. Tente novamente mais tarde; este serviço é gratuito.'
        : failure instanceof Error ? failure.message : 'Não foi possível consultar o DataJud. Tente novamente mais tarde.');
    } finally { window.clearTimeout(timeout); inFlight.current = null; setBusy(false); }
  }

  return (
    <>
      <PageIntro eyebrow="Serviço gratuito · CNJ / DataJud" title="Consulta processual do TJAL"
        text="Consulte os dados públicos e as movimentações de um processo de Alagoas. Acesso gratuito, sem cadastro, assinatura ou compra de créditos." />
      <section className="page-container space-y-6 pb-16">
        <div className="surface p-5 sm:p-7">
          <form onSubmit={consult} className="flex flex-col gap-3 sm:flex-row sm:items-end" aria-label="Consultar processo do TJAL">
            <div className="min-w-0 flex-1">
              <label htmlFor="datajud-number" className="block text-sm font-semibold text-stone-800">Número do processo</label>
              <input id="datajud-number" type="text" inputMode="numeric" autoComplete="off" required maxLength={25}
                pattern="(?:[0-9]{20}|[0-9]{7}-[0-9]{2}\.[0-9]{4}\.8\.02\.[0-9]{4})"
                title="Informe os 20 dígitos de um número CNJ do TJAL, com ou sem máscara."
                placeholder="NNNNNNN-DD.AAAA.8.02.OOOO" value={number} onChange={(event) => setNumber(event.target.value)}
                aria-describedby="datajud-number-help" className="mt-2 min-h-12 w-full rounded-xl border border-champagne-border bg-white px-4 text-stone-900" />
              <p id="datajud-number-help" className="mt-2 text-xs text-stone-600">Use a numeração CNJ do TJAL, com ou sem pontuação.</p>
            </div>
            <button type="submit" disabled={busy} className="btn-primary min-h-12 sm:mb-6 disabled:opacity-70">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              {busy ? 'Consultando…' : 'Consultar'}
            </button>
          </form>
          <p className="mt-5 border-t border-champagne-border pt-4 text-sm leading-6 text-stone-600">
            Fonte: CNJ / DataJud, com dados remetidos pelo TJAL. As informações podem estar incompletas ou desatualizadas.
            Confirme a situação do processo e os prazos no tribunal. Esta consulta não guarda um histórico dos processos.
          </p>
        </div>
        <p role="status" className="text-sm text-stone-600">{busy ? 'Consultando o DataJud…' : result && !error ? 'Consulta concluída. Confira os dados retornados abaixo.' : ''}</p>
        {error && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{error}</div>}
        {result && (
          <section role="region" aria-labelledby="datajud-result-heading" className="space-y-5">
            <div>
              <h2 id="datajud-result-heading" className="font-editorial text-2xl font-bold text-stone-900">Resultado da consulta</h2>
              <p className="mt-2 break-words text-base font-semibold text-stone-800">Processo {formatCnjNumber(result.processNumber)}</p>
              <p className="mt-1 text-sm text-stone-600">Consultado em {formatDataJudDate(result.consultedAt)} · Horários em Brasília</p>
            </div>
            {result.records.length === 0 && <div className="surface p-6"><h3 className="font-semibold text-stone-900">Nenhum registro retornado</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">A ausência no DataJud não comprova a inexistência do processo ou de movimentações. Confira o número e consulte o tribunal.</p></div>}
            {result.truncated && <p className="rounded-xl border border-champagne-border bg-white p-4 text-sm text-stone-700">Há mais registros na fonte. Esta consulta exibe até 20 entradas; outros graus ou classes podem não aparecer.</p>}
            {result.records.map((entry, index) => (
              <article key={`${entry.id}:${index}`} className="surface min-w-0 p-5 sm:p-7">
                <h3 className="break-words font-editorial text-xl font-bold text-stone-900">{entry.caseClass?.nome ?? 'Classe não informada'}{entry.degree ? ` · ${entry.degree}` : ''}</h3>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="font-semibold text-stone-700">Órgão julgador</dt><dd className="mt-1 break-words text-stone-600">{entry.judgingBody?.nome ?? 'Não informado'}</dd></div>
                  <div><dt className="font-semibold text-stone-700">Ajuizamento</dt><dd className="mt-1 text-stone-600">{formatDataJudDate(entry.filedAt)}</dd></div>
                  <div><dt className="font-semibold text-stone-700">Atualização informada pela fonte</dt><dd className="mt-1 text-stone-600">{formatDataJudDate(entry.sourceUpdatedAt)}</dd></div>
                  <div><dt className="font-semibold text-stone-700">Atualização no índice DataJud</dt><dd className="mt-1 text-stone-600">{formatDataJudDate(entry.indexedAt)}</dd></div>
                  {entry.subjects.length > 0 && <div className="sm:col-span-2"><dt className="font-semibold text-stone-700">Assuntos</dt><dd className="mt-1 break-words text-stone-600">{entry.subjects.map((subject) => subject.nome).join(' · ')}</dd></div>}
                </dl>
                <details className="mt-6 border-t border-champagne-border pt-4" open={result.records.length === 1}>
                  <summary className="cursor-pointer rounded text-sm font-semibold text-stone-800">Movimentações retornadas ({entry.movements.length})</summary>
                  {entry.movements.length === 0 ? <p className="mt-3 text-sm text-stone-600">Movimentações não retornadas pelo DataJud.</p>
                    : <ol className="mt-4 divide-y divide-stone-200">{entry.movements.map((movement, position) => <li key={`${movement.code}:${movement.occurredAt}:${position}`} className="py-3">
                      <p className="break-words text-sm font-medium text-stone-800">{movement.name}</p>
                      <p className="mt-1 text-xs text-stone-600">{formatDataJudDate(movement.occurredAt)}{movement.code !== undefined ? ` · Código ${movement.code}` : ''}</p>
                    </li>)}</ol>}
                </details>
              </article>
            ))}
            <a href="https://www.cnj.jus.br/sistemas/datajud/api-publica/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-cognac-800 hover:underline">
              Sobre a fonte CNJ / DataJud <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </section>
        )}
      </section>
    </>
  );
}
