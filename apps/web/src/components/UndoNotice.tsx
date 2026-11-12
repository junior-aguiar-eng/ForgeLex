import { useEffect, useRef, useState } from 'react';

/**
 * Aviso curto de uma ação reversível ("Conversa excluída. Desfazer"). Fica na tela por alguns segundos, para de contar
 * enquanto o ponteiro ou o foco estão nele e é anunciado como aviso de status, sem tirar o foco de onde o cliente está.
 */
export function UndoNotice({
  message,
  actionLabel = 'Desfazer',
  onUndo,
  onDismiss,
  busy = false,
  duration = 10000,
}: {
  message: string;
  actionLabel?: string;
  onUndo: () => void;
  onDismiss: () => void;
  busy?: boolean;
  duration?: number;
}) {
  const [paused, setPaused] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (paused || busy) return;
    const timer = window.setTimeout(() => dismiss.current(), duration);
    return () => window.clearTimeout(timer);
  }, [paused, busy, duration, message]);
  return (
    <div
      role="status"
      className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-xl border border-stone-300 bg-white/80 px-4 py-2 text-sm text-stone-800"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDismiss();
      }}
    >
      <span className="min-w-0 flex-1 break-words">{message}</span>
      <button
        type="button"
        disabled={busy}
        className="min-h-11 rounded-lg px-3 font-medium text-cognac-800 hover:bg-cognac-100 disabled:opacity-50"
        onClick={onUndo}
      >
        {actionLabel}
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label="Dispensar aviso"
        className="min-h-11 rounded-lg px-3 text-stone-600 hover:bg-ivory-100"
        onClick={onDismiss}
      >
        Fechar
      </button>
    </div>
  );
}
