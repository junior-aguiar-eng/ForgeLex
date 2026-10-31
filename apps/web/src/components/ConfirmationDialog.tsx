import { useEffect, useRef } from 'react';
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const current = dialog.current;
    if (open && current && !current.open) current.showModal();
    return () => {
      current?.close();
      previouslyFocused?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="research-confirm-title"
      aria-describedby="research-confirm-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="rounded-2xl border border-stone-200 p-5 max-w-md w-[calc(100%-2rem)] backdrop:bg-black/50"
    >
      <h2 id="research-confirm-title" className="font-editorial text-xl font-bold">
        {title}
      </h2>
      <p id="research-confirm-description" className="my-4 text-sm leading-relaxed">
        {description}
      </p>
      <div className="flex flex-wrap justify-end gap-3">
        <button autoFocus type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={onConfirm}>
          {busy ? 'Aguarde…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
