import { useId, useRef, useState } from 'react';
import { FileText, Paperclip } from 'lucide-react';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_FILES,
  attachmentChars,
  attachmentRoom,
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
        title={full ? `Até ${ATTACHMENT_MAX_FILES} anexos por pedido` : 'Anexar PDF, Word, TXT ou MD'}
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
  room,
  onReplace,
  onRemove,
  onRecognize,
  onCancelRecognize,
  onEdit,
}: {
  attachment: Attachment;
  busy: boolean;
  /** Caracteres que o texto deste anexo ainda pode ter (o teto do conjunto menos os outros anexos). */
  room: number;
  onReplace: (file: File) => void;
  onRemove: () => void;
  onRecognize: () => void;
  onCancelRecognize: () => void;
  onEdit: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const region = useId();
  const input = useRef<HTMLInputElement>(null);
  const done = attachment.status === 'done';
  const recognizing = attachment.status === 'ocr';
  const progress = attachment.ocrProgress;
  const percent = Math.round((progress?.fraction ?? 0) * 100);
  const detail = recognizing
    ? `${attachmentStatusLabel.ocr} página ${progress?.page ?? 1} de ${progress?.pages ?? 1} · ${percent}%`
    : done && attachment.ocr
      ? `Reconhecido por OCR — conferir${attachment.ocr.confidence !== null ? ` · confiança média ${attachment.ocr.confidence}%` : ''}`
      : done && attachment.pages
        ? `${attachmentStatusLabel.done} · ${attachment.pages} página${attachment.pages > 1 ? 's' : ''}`
        : attachmentStatusLabel[attachment.status];
  const button = 'min-h-11 rounded-lg px-2 text-sm font-medium text-cognac-800 hover:bg-ivory-100 disabled:opacity-50';
  return (
    <li
      className="min-w-0 rounded-xl border border-stone-200 bg-ivory-50 px-3 py-1"
      aria-busy={attachment.status === 'reading' || recognizing}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
        <FileText size={16} aria-hidden="true" className="shrink-0 text-stone-600" />
        <span className="min-w-0 flex-1 break-words text-sm font-medium text-stone-900" title={attachment.name}>
          {attachment.name}
        </span>
        <span className={`text-xs ${done && attachment.ocr ? 'font-medium text-amber-900' : 'text-stone-600'}`}>
          {detail}
        </span>
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
        {attachment.canOcr && (
          <button
            type="button"
            className={button}
            disabled={busy}
            aria-label={`Reconhecer texto por OCR: ${attachment.name}`}
            onClick={onRecognize}
          >
            Reconhecer texto (OCR)
          </button>
        )}
        {recognizing && (
          <button
            type="button"
            className={button}
            aria-label={`Cancelar o reconhecimento: ${attachment.name}`}
            onClick={onCancelRecognize}
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          className={button}
          disabled={busy || attachment.status === 'reading' || recognizing}
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
      {recognizing && (
        <progress
          className="mb-2 h-2 w-full"
          max={100}
          value={percent}
          aria-label={`Reconhecendo o texto de ${attachment.name}: página ${progress?.page ?? 1} de ${progress?.pages ?? 1}`}
        />
      )}
      {!done && attachment.status !== 'reading' && !recognizing && attachment.message && (
        <p role="note" className="pb-2 text-sm text-stone-700">
          {attachment.message}
        </p>
      )}
      {done && open && attachment.ocr && (
        <section
          id={region}
          aria-label={`Texto do anexo: ${attachment.name}`}
          className="mb-2 rounded-lg border border-amber-300 bg-white p-2 text-sm"
        >
          <p className="mb-1 text-xs text-amber-900">
            Texto reconhecido por OCR: pode ter erros de leitura. Corrija o que estiver errado antes de enviar.
          </p>
          <textarea
            className="h-48 w-full rounded border border-stone-300 p-2 font-sans text-sm"
            aria-label={`Texto reconhecido por OCR de ${attachment.name} (editável)`}
            value={attachment.text}
            maxLength={room}
            onChange={(event) => onEdit(event.target.value)}
          />
        </section>
      )}
      {done && open && !attachment.ocr && (
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
  onRecognize,
  onCancelRecognize,
  onEdit,
}: {
  attachments: readonly Attachment[];
  notice: string;
  busy: boolean;
  onReplace: (id: string, file: File) => void;
  onRemove: (id: string) => void;
  onRecognize: (id: string) => void;
  onCancelRecognize: (id: string) => void;
  onEdit: (id: string, text: string) => void;
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
                room={attachmentRoom(attachments, attachment.id)}
                onReplace={(file) => onReplace(attachment.id, file)}
                onRemove={() => onRemove(attachment.id)}
                onRecognize={() => onRecognize(attachment.id)}
                onCancelRecognize={() => onCancelRecognize(attachment.id)}
                onEdit={(text) => onEdit(attachment.id, text)}
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
