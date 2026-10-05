import { useEffect, useRef, useState } from 'react';
import { requestApiWithToken } from '../../api-client';
import { reviewCheckLabel, type ReviewPoint } from './review-model';
interface Support {
  fact: { statement: string };
  sourceLinks: { documentAnchorId: string; relation: string }[];
  evidenceLinks: { evidenceItemId: string; relation: string }[];
  evidenceSourceLinks: { documentAnchorId: string; evidenceItemId: string; relation: string }[];
}
interface Document {
  id: string;
  title: string;
}
interface Anchor {
  id: string;
  text: string;
}
async function readLinkedAnchors(support: Support, documents: Document[], matterId: string, token: string) {
  const links = [...support.sourceLinks, ...support.evidenceSourceLinks];
  if (!links.length) return [];
  const bundles = await Promise.all(
    documents.map(async (document) => ({
      title: document.title,
      ...(await requestApiWithToken<{ anchors: Anchor[] }>(
        `/api/v2/matters/${matterId}/documents/${document.id}`,
        token,
      )),
    })),
  );
  return bundles.flatMap((b) =>
    b.anchors.filter((a) => links.some((l) => l.documentAnchorId === a.id)).map((a) => ({ ...a, title: b.title })),
  );
}
export function SourcePanel({
  point,
  matterId,
  token,
  sectionTitle,
  citationText,
  facts,
  evidence,
  authorities,
  onClose,
  onLinked,
  onEditSection,
  onLinkReference,
  onRemoveReference,
}: {
  point: ReviewPoint;
  matterId: string;
  token: string;
  sectionTitle?: string;
  citationText?: string;
  facts: { id: string; statement: string }[];
  evidence: { id: string; title: string }[];
  authorities: { id: string; authority: { court: string; processNumber: string; syllabus: string } }[];
  onClose: () => void;
  onLinked: () => void;
  onEditSection: () => void;
  onLinkReference: () => void;
  onRemoveReference: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [support, setSupport] = useState<Support>();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [anchorId, setAnchorId] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [relation, setRelation] = useState('SUPPORTS');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [linkedAnchors, setLinkedAnchors] = useState<Array<Anchor & { title: string }>>([]);
  const { check } = point;
  const fact = facts.find((f) => f.id === check.targetId);
  const proof = evidence.find((e) => e.id === check.targetId);
  const authority = authorities.find((a) => a.id === check.targetId);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (check.targetType === 'FACT' && fact) {
      setBusy(true);
      Promise.all([
        requestApiWithToken<Support>(`/api/v2/matters/${matterId}/facts/${fact.id}/support`, token),
        requestApiWithToken<{ documents: Document[] }>(`/api/v2/matters/${matterId}`, token),
      ])
        .then(async ([s, d]) => {
          if (!active) return;
          setSupport(s);
          setDocuments(d.documents);
          const linked = await readLinkedAnchors(s, d.documents, matterId, token);
          if (active) setLinkedAnchors(linked);
        })
        .catch(() => {
          if (active) setError('Não foi possível carregar as fontes deste fato.');
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }
    return () => {
      active = false;
    };
  }, [matterId, token, check.targetType, fact]);
  const selectDocument = async (id: string) => {
    setDocumentId(id);
    setAnchorId('');
    setAnchors([]);
    setError('');
    if (!id) return;
    setBusy(true);
    try {
      const result = await requestApiWithToken<{ anchors: Anchor[] }>(
        `/api/v2/matters/${matterId}/documents/${id}`,
        token,
      );
      setAnchors(result.anchors);
    } catch {
      setError('Não foi possível carregar os trechos do documento.');
    } finally {
      setBusy(false);
    }
  };
  const link = async () => {
    if (!fact || (!evidenceId && !anchorId)) return;
    setBusy(true);
    setSaving(true);
    setError('');
    setNotice('');
    let committed = false;
    try {
      await requestApiWithToken(`/api/v2/matters/${matterId}/facts/${fact.id}/support`, token, {
        method: 'POST',
        body: JSON.stringify({ evidenceItemId: evidenceId || undefined, anchorId: anchorId || undefined, relation }),
      });
      committed = true;
      setNotice('Vínculo registrado. Confira novamente o rascunho.');
      onLinked();
      setEvidenceId('');
      setAnchorId('');
      const updated = await requestApiWithToken<Support>(`/api/v2/matters/${matterId}/facts/${fact.id}/support`, token);
      setSupport(updated);
      setLinkedAnchors(await readLinkedAnchors(updated, documents, matterId, token));
    } catch {
      setError(
        committed
          ? 'O vínculo foi salvo, mas não foi possível carregar as fontes. Feche e reabra o ponto para consultar os trechos.'
          : 'Não foi possível registrar o vínculo. Confira seu acesso ao caso e tente novamente.',
      );
    } finally {
      setBusy(false);
      setSaving(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      aria-labelledby="source-panel-title"
      className="w-[min(42rem,calc(100%-2rem))] max-h-[90vh] overflow-y-auto rounded-2xl p-6 text-stone-900 backdrop:bg-black/40"
    >
      <div className="sticky top-0 bg-white pb-3 flex justify-between gap-4">
        <h2 id="source-panel-title" className="font-editorial text-xl font-bold">
          {reviewCheckLabel(check)}
        </h2>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
          Fechar
        </button>
      </div>
      <div className="space-y-4 mt-4">
        {sectionTitle && <p className="text-sm font-semibold">Seção: {sectionTitle}</p>}
        <p className="text-sm">{check.message}</p>
        {citationText && (
          <div className="text-sm rounded-lg bg-stone-50 p-3">
            <p className="font-semibold">Citação registrada</p>
            <p className="whitespace-pre-wrap">{citationText}</p>
          </div>
        )}
        <p className="text-xs text-stone-600">Conferido em {new Date(check.checkedAt).toLocaleString('pt-BR')}</p>
        {authority && (
          <>
            <p className="font-semibold">
              {authority.authority.court} · {authority.authority.processNumber}
            </p>
            <p className="text-sm whitespace-pre-wrap">{authority.authority.syllabus}</p>
          </>
        )}
        {proof && <p>Prova: {proof.title}</p>}
        {check.source?.capturedAt && (
          <p className="text-xs">Acervo capturado em {new Date(check.source.capturedAt).toLocaleString('pt-BR')}</p>
        )}
        {check.source?.sourceUrl && /^https?:\/\//.test(check.source.sourceUrl) && (
          <a href={check.source.sourceUrl} target="_blank" rel="noreferrer" className="btn-secondary">
            Abrir fonte
          </a>
        )}
        {fact && (
          <>
            <p className="font-semibold">{fact.statement}</p>
            {support && (
              <div className="text-sm space-y-2">
                <h3 className="font-semibold">Fontes vinculadas</h3>
                {support.evidenceLinks.map((l, i) => (
                  <p key={i}>
                    {evidence.find((e) => e.id === l.evidenceItemId)?.title ?? 'Prova do caso'} ·{' '}
                    {l.relation === 'SUPPORTS' ? 'Apoia' : l.relation === 'CONTRADICTS' ? 'Contradiz' : 'Contextualiza'}
                  </p>
                ))}
                {[...support.sourceLinks, ...support.evidenceSourceLinks].map((l, i) => {
                  const anchor = linkedAnchors.find((a) => a.id === l.documentAnchorId);
                  return (
                    <div key={i} className="rounded-lg bg-stone-50 p-3">
                      <p className="font-semibold">{anchor?.title ?? 'Documento do caso'}</p>
                      <p className="whitespace-pre-wrap">{anchor?.text ?? 'Trecho indisponível. Confira o vínculo.'}</p>
                      <p>
                        {l.relation === 'SUPPORTS'
                          ? 'Apoia'
                          : l.relation === 'CONTRADICTS'
                            ? 'Contradiz'
                            : 'Contextualiza'}
                      </p>
                    </div>
                  );
                })}
                {!support.evidenceLinks.length && !support.sourceLinks.length && <p>Nenhuma fonte vinculada.</p>}
              </div>
            )}
            <label className="block text-sm">
              Prova do caso
              <select
                className="input-control w-full mt-1"
                value={evidenceId}
                onChange={(e) => setEvidenceId(e.target.value)}
              >
                <option value="">Selecione uma prova</option>
                {evidence.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Documento do caso
              <select
                disabled={busy}
                className="input-control w-full mt-1"
                value={documentId}
                onChange={(e) => void selectDocument(e.target.value)}
              >
                <option value="">Selecione um documento</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            {documentId && (
              <label className="block text-sm">
                Trecho do documento
                <select
                  className="input-control w-full mt-1"
                  value={anchorId}
                  onChange={(e) => setAnchorId(e.target.value)}
                >
                  <option value="">Selecione um trecho</option>
                  {anchors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.text.slice(0, 140)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {anchorId && (
              <p className="text-sm whitespace-pre-wrap rounded-lg bg-stone-50 p-3">
                {anchors.find((a) => a.id === anchorId)?.text}
              </p>
            )}
            <label className="block text-sm">
              Relação com o fato
              <select
                className="input-control w-full mt-1"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
              >
                <option value="SUPPORTS">Apoia</option>
                <option value="CONTRADICTS">Contradiz</option>
                <option value="CONTEXT">Contextualiza</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void link()}
              disabled={busy || (!evidenceId && !anchorId)}
              className="btn-secondary disabled:opacity-50"
            >
              Vincular fonte ao fato
            </button>
          </>
        )}
        {check.code === 'CITATION_TARGET_NOT_LINKED' && (
          <button type="button" onClick={onLinkReference} className="btn-secondary">
            Vincular referência à seção
          </button>
        )}
        {check.targetId &&
          ['AUTHORITY_NOT_IN_MATTER', 'FACT_NOT_FOUND', 'EVIDENCE_NOT_FOUND', 'CITATION_TARGET_NOT_FOUND'].includes(
            check.code,
          ) && (
            <button type="button" onClick={onRemoveReference} className="btn-secondary">
              Remover referência ausente desta seção
            </button>
          )}
        {sectionTitle && (
          <button type="button" onClick={onEditSection} className="btn-secondary">
            Ir para a seção
          </button>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        )}
        <p className="text-xs text-stone-600">
          Vincular uma fonte registra sua relação com o fato. A leitura e a avaliação do conteúdo continuam necessárias.
        </p>
      </div>
    </dialog>
  );
}
