import { useId, useRef, useState } from 'react';
import { FileText, Paperclip } from 'lucide-react';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_FILES,
  attachmentChars,
  attachmentStatusLabel,
  type Attachment,
} from './attachments';

const PREVIEW_CHARS = 4000;

/** Botão de clipe do compositor: abre o seletor de arquivos e entrega os escolhidos. */
export function AttachButton({
  disabled,
  count,
  onFiles,
}: {
  disabled: boolean;
  count: number;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const full = count >= ATTACHMENT_MAX_FILES;
  return (
    <>
      <button
        type="button"
        disabled={disabled || full}
        aria-label="Anexar arquivo"
        title={full ? `Até ${ATTACHMENT_MAX_FILES} anexos por pedido` : 'Anexar PDF, TXT ou MD'}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-stone-700 hover:bg-ivory-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cognac-700 disabled:opacity-50"
        onClick={() => input.current?.click()}
      >
        <Paperclip size={18} aria-hidden="true" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ATTACHMENT_ACCEPT}
        aria-label="Escolher arquivos para anexar"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

function Chip({
  attachment,
  busy,
  onReplace,
  onRemove,
}: {
  attachment: Attachment;
  busy: boolean;
  onReplace: (file: File) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const region = useId();
  const input = useRef<HTMLInputElement>(null);
  const done = attachment.status === 'done';
  const detail =
    done && attachment.pages
      ? `${attachmentStatusLabel.done} · ${attachment.pages} página${attachment.pages > 1 ? 's' : ''}`
      : attachmentStatusLabel[attachment.status];
  const button = 'min-h-11 rounded-lg px-2 text-sm font-medium text-cognac-800 hover:bg-ivory-100 disabled:opacity-50';
  return (
    <li
      className="min-w-0 rounded-xl border border-stone-200 bg-ivory-50 px-3 py-1"
      aria-busy={attachment.status === 'reading'}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
        <FileText size={16} aria-hidden="true" className="shrink-0 text-stone-600" />
        <span className="min-w-0 flex-1 break-words text-sm font-medium text-stone-900" title={attachment.name}>
          {attachment.name}
        </span>
        <span className="text-xs text-stone-600">{detail}</span>
        {done && (
          <button
            type="button"
            className={button}
            aria-expanded={open}
            aria-controls={region}
            aria-label={`${open ? 'Fechar' : 'Abrir'} o texto do anexo: ${attachment.name}`}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Fechar' : 'Abrir'}
          </button>
        )}
        <button
          type="button"
          className={button}
          disabled={busy || attachment.status === 'reading'}
          aria-label={`Trocar anexo: ${attachment.name}`}
          onClick={() => input.current?.click()}
        >
          Trocar
        </button>
        <input
          ref={input}
          type="file"
          hidden
          accept={ATTACHMENT_ACCEPT}
          aria-label={`Escolher o novo arquivo para: ${attachment.name}`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) onReplace(file);
          }}
        />
        <button
          type="button"
          className={button}
          disabled={busy}
          aria-label={`Remover anexo: ${attachment.name}`}
          onClick={onRemove}
        >
          Remover
        </button>
      </div>
      {!done && attachment.status !== 'reading' && attachment.message && (
        <p role="note" className="pb-2 text-sm text-stone-700">
          {attachment.message}
        </p>
      )}
      {done && open && (
        <section
          id={region}
          aria-label={`Texto do anexo: ${attachment.name}`}
          className="mb-2 max-h-48 overflow-auto rounded-lg border border-stone-200 bg-white p-2 text-sm"
        >
          <pre className="whitespace-pre-wrap break-words font-sans">
            {attachment.text.slice(0, PREVIEW_CHARS)}
            {attachment.text.length > PREVIEW_CHARS ? '\n… (o restante também segue com o pedido)' : ''}
          </pre>
        </section>
      )}
    </li>
  );
}

/** Anexos do pedido como chips: abrir o texto, trocar e remover, com estado de leitura e aviso de que só o texto é guardado. */
export function AttachmentChips({
  attachments,
  notice,
  busy,
  onReplace,
  onRemove,
}: {
  attachments: readonly Attachment[];
  notice: string;
  busy: boolean;
  onReplace: (id: string, file: File) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <>
          <ul aria-label="Anexos do pedido" className="space-y-2">
            {attachments.map((attachment) => (
              <Chip
                key={attachment.id}
                attachment={attachment}
                busy={busy}
                onReplace={(file) => onReplace(attachment.id, file)}
                onRemove={() => onRemove(attachment.id)}
              />
            ))}
          </ul>
          {attachments.length >= ATTACHMENT_MAX_FILES && (
            <p className="text-xs text-stone-700">
              Limite de {ATTACHMENT_MAX_FILES} anexos por pedido. Remova um para anexar outro.
            </p>
          )}
          <p className="text-xs text-stone-600">
            Guardamos só o texto extraído, não o arquivo. Confira o texto antes de enviar
            {attachmentChars(attachments)
              ? ` (${attachmentChars(attachments).toLocaleString('pt-BR')} caracteres)`
              : ''}
            .
          </p>
        </>
      )}
      <p role="status" className="sr-only">
        {notice}
      </p>
    </div>
  );
}
