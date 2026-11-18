import { useId, useState } from 'react';
import { requestApi } from '../api-client';
import { caseNameFrom } from './case-name';
import { DeskCaseManager } from './DeskCaseManager';

export interface CaseOption {
  id: string;
  title: string;
}

/**
 * Seletor de caso da Mesa (tema gelo): "Sem caso — somente texto" ou um dos casos. O caso da conversa não troca depois
 * que ela começa (a decisão de outra conversa nunca vale aqui), então o seletor fica fixo com o motivo escrito.
 * "Criar caso a partir desta conversa" cria um caso só com o nome, sugerido pelo pedido e editável; nada mais vai junto.
 */
export function DeskCaseSelector({
  cases,
  value,
  lockedReason,
  suggestedName,
  disabled,
  onChange,
  onCreated,
  onCasesChanged,
}: {
  cases: CaseOption[];
  value: string;
  /** Por que o caso está fixo agora, em texto; sem valor, o cliente pode trocar. */
  lockedReason?: string;
  /** Texto do pedido, de onde vem o nome sugerido. */
  suggestedName: string;
  disabled: boolean;
  onChange: (id: string) => void;
  onCreated: (created: CaseOption) => void;
  /** Casos ativos depois de renomear, arquivar, mover para a lixeira ou restaurar no gerenciador. */
  onCasesChanged: (active: CaseOption[]) => void;
}) {
  const hintId = useId();
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = Boolean(lockedReason);

  const create = async () => {
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    setError('');
    try {
      const created = await requestApi<CaseOption>(
        '/api/v2/matters',
        { method: 'POST', body: JSON.stringify({ title }) },
        { sessionOnly: true },
      );
      onCreated({ id: created.id, title: created.title ?? title });
      setCreating(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível criar o caso.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" data-desk-case>
      <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
        <span className="shrink-0 font-medium text-ink-soft">Caso</span>
        <select
          aria-label="Caso"
          aria-describedby={locked ? hintId : undefined}
          disabled={disabled || locked}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-9 min-w-0 max-w-[16rem] rounded-[var(--fl-radius-control)] border border-line-control bg-surface px-2 text-sm font-normal text-ink disabled:opacity-70"
        >
          <option value="">Sem caso — somente texto</option>
          {cases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      {locked && (
        <span id={hintId} className="text-xs text-subtle">
          {lockedReason}
        </span>
      )}
      {!locked && !creating && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setName(caseNameFrom(suggestedName));
            setCreating(true);
          }}
          className="min-h-9 rounded-[var(--fl-radius-control)] px-2 text-sm font-medium text-accent hover:bg-canvas-deep disabled:opacity-50"
        >
          Criar caso a partir desta conversa
        </button>
      )}
      {!locked && creating && (
        <form
          aria-label="Criar caso"
          className="flex min-w-0 flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setCreating(false);
          }}
        >
          <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
            <span className="sr-only">Nome do caso</span>
            <input
              autoFocus
              value={name}
              maxLength={120}
              disabled={busy}
              placeholder="Nome do caso"
              onChange={(event) => setName(event.target.value)}
              className="min-h-9 w-56 max-w-full rounded-[var(--fl-radius-control)] border border-line-control bg-surface px-2 text-sm text-ink"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="min-h-9 rounded-[var(--fl-radius-control)] bg-accent px-3 text-sm font-semibold text-surface hover:bg-accent-strong disabled:opacity-50"
          >
            Criar caso
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setCreating(false)}
            className="min-h-9 rounded-[var(--fl-radius-control)] px-2 text-sm font-medium text-muted hover:bg-canvas-deep"
          >
            Cancelar
          </button>
          <span className="basis-full text-xs text-subtle">
            O caso nasce só com o nome. Os fatos e as provas você aprova depois, na tela do caso.
          </span>
          {error && (
            <p role="alert" className="basis-full text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setManaging(true)}
        className="min-h-9 rounded-[var(--fl-radius-control)] px-2 text-sm font-medium text-accent hover:bg-canvas-deep disabled:opacity-50"
      >
        Gerenciar casos
      </button>
      {managing && (
        <DeskCaseManager
          inUse={locked && value ? value : undefined}
          onClose={() => setManaging(false)}
          onChanged={onCasesChanged}
        />
      )}
    </div>
  );
}
