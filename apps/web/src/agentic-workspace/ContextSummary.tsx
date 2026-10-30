import type { Context, Source } from './execution-model';
import { sourceLink } from './execution-model';
import type { DocumentSource } from '../documents/document-reader-model';

function SourceItem({
  source: s,
  matterId,
  onRead,
}: {
  source: Source;
  matterId: string | null;
  onRead: (source: DocumentSource) => void;
}) {
  const link = sourceLink(s, matterId);
  const identity =
    (
      {
        VERIFIED_OFFICIAL: 'Identidade conferida em fonte oficial; não confirma suporte à afirmação',
        VERIFIED_PROVIDER: 'Identidade conferida no provedor; não confirma suporte à afirmação',
        CURATED_SNAPSHOT_NOT_APPLICABILITY:
          'Snapshot normativo curado; não confirma aplicabilidade ou vigência no caso',
        HUMAN: 'Versão de autoria humana; avaliação jurídica pendente',
        WORKFLOW: 'Texto produzido no trabalho; avaliação jurídica pendente',
      } as Record<string, string>
    )[s.identityStatus ?? ''] ?? 'Identidade ou suporte jurídico não confirmados';
  return (
    <li className="space-y-1 border-b py-2" data-source-reference={s.id}>
      <p>
        {(
          {
            USER_TEXT: 'Contexto escrito',
            DOCUMENT: 'Documento selecionado',
            DRAFT: 'Minuta selecionada',
            ANSWER: 'Resposta informada',
            AUTHORITY: 'Jurisprudência',
            NORM: 'Dispositivo normativo',
            PREVIOUS_DELIVERY: 'Entrega anterior',
          } as Record<string, string>
        )[s.kind] ?? 'Fonte'}
      </p>
      <p>{identity}</p>
      {s.versionId && <p>Versão da fonte: {s.versionId}</p>}
      {s.contentHash && <p>Hash do conteúdo: {s.contentHash}</p>}
      {s.extent && (
        <p>
          Extensão:{' '}
          {s.extent === 'SYLLABUS' ? 'ementa' : s.extent === 'PROVISION' ? 'dispositivo' : 'trecho selecionado'}
        </p>
      )}
      {typeof link === 'string' ? (
        <a
          className="inline-flex min-h-11 items-center underline"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir fonte externa
        </a>
      ) : link ? (
        <button className="min-h-11 underline" onClick={() => onRead(link)}>
          Abrir documento {s.documentId?.slice(0, 8)}
        </button>
      ) : (
        <span>Origem no contexto autorizado desta tarefa.</span>
      )}
    </li>
  );
}
export function SourceReferences({
  label,
  sourceIds,
  sources,
  matterId,
  onRead,
}: {
  label: string;
  sourceIds: string[];
  sources: Source[];
  matterId: string | null;
  onRead: (source: DocumentSource) => void;
}) {
  return (
    <details className="mt-2 text-sm">
      <summary className="min-h-11 cursor-pointer">{label}</summary>
      <section aria-label={label} className="break-words">
        <ul>
          {sourceIds.length ? (
            [...new Set(sourceIds)].map((id) => {
              const source = sources.find((s) => s.id === id);
              return source ? (
                <SourceItem key={id} source={source} matterId={matterId} onRead={onRead} />
              ) : (
                <li key={id}>Referência indisponível neste contexto.</li>
              );
            })
          ) : (
            <li>Sem fonte vinculada a este trecho; suporte pendente.</li>
          )}
        </ul>
      </section>
    </details>
  );
}
export function ContextSummary({
  context,
  matterId,
  sources,
  onRead,
  executionId,
  onEditor,
}: {
  context: Context;
  matterId: string | null;
  sources: Source[];
  onRead: (source: DocumentSource) => void;
  executionId: string;
  onEditor: (url: string) => void;
}) {
  return (
    <>
      <details>
        <summary className="min-h-11 cursor-pointer">Contexto do trabalho</summary>
        <section aria-label="Contexto do trabalho" className="space-y-3 break-words text-sm">
          <p>{matterId ? 'Trabalho vinculado a caso' : 'Trabalho com contexto escrito'}</p>
          <p className="whitespace-pre-wrap">{context.text || 'Sem texto adicional.'}</p>
          {context.draft && matterId && (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={`/app/rascunhos?${new URLSearchParams({ matterId, draftId: context.draft.draftId, versionId: context.draft.versionId, returnExecution: executionId })}`}
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  onEditor(e.currentTarget.getAttribute('href')!);
                }
              }}
            >
              Abrir minuta selecionada
            </a>
          )}
          {context.documents.map((d) => (
            <button
              className="block min-h-11 underline"
              key={d.documentId}
              onClick={() => {
                if (matterId) onRead({ matterId, ...d });
              }}
            >
              Abrir documento {d.documentId.slice(0, 8)} · versão {d.versionId.slice(0, 8)}
            </button>
          ))}
        </section>
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer">Fontes e limites</summary>
        <p className="text-sm text-stone-600">
          Fontes identificadas não equivalem à confirmação de suporte jurídico. A entrega exige sua revisão.
        </p>
        <ul className="space-y-3 break-words text-sm">
          {sources.map((s, i) => (
            <SourceItem key={s.id ?? i} source={s} matterId={matterId} onRead={onRead} />
          ))}
        </ul>
      </details>
    </>
  );
}
