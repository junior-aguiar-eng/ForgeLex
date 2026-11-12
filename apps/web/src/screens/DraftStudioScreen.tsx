import { CanvasDialog, DraftCanvas } from './draft-review/DraftCanvas';
import { EditorialReviewPanel } from '../agentic-workspace/EditorialReviewPanel';
import { hasDeskPiece, selectDeskPiece, type DeskDocumentSelection } from '../agentic-workspace/desk-selection';
import { deskLocation, readDeskLocation, writeDeskLocation } from '../navigation/desk-location';
import type { DeskEditSelection, DeskPiece } from '../agentic-workspace/desk-model';
import { printDraftPdf } from '../documents/draft-print';
import {getDraftPrimaryAction} from './draft-review/draft-action-model';
import React, { useEffect, useRef, useState } from 'react';
import { ReviewPanel } from './draft-review/ReviewPanel';
import { SourcePanel } from './draft-review/SourcePanel';
import { DocumentReaderDialog } from '../components/DocumentReaderDialog';
import { UndoNotice } from '../components/UndoNotice';
import type { DocumentReference, DocumentSource } from '../documents/document-reader-model';
import { type DraftReviewRun, type ReviewPoint, type DraftReviewFinding } from './draft-review/review-model';
import { ApiRequestError, requestApiWithToken, requestApi } from '../api-client';
import { pendingDraftSaveKey, readPendingDraftSave, storePendingDraftSave } from '../documents/draft-save-session';
import type { } from './draft-ai/received-draft-model';
import { useAuth } from '../auth/AuthContext';
import type { Delivery } from '../agentic-workspace/execution-model';

interface Matter {
  id: string;
  title: string;
  practiceArea?: string;
  jurisdiction?: string;
}

interface Draft {
  id: string;
  matterId: string;
  title: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVAL_PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
  currentVersionId?: string;
  updatedAt: string;
}

interface DraftSection {
  id: string;
  ordinal: number;
  title: string;
  content: string;
  linkedFactIds: string[];
  linkedEvidenceIds: string[];
  linkedAuthorityIds: string[];
  linkedThesisIds: string[];
}

interface LegalIssue {
  id: string;
  statement: string;
  status: string;
}

interface Fact {
  id: string;
  statement: string;
}

interface EvidenceItem {
  id: string;
  title: string;
}

interface SavedAuthority {
  id: string;
  authority: { court: string; processNumber: string; syllabus: string };
}

interface LegalThesis {
  id: string;
  title: string;
  statement: string;
  issueIds: string[];
  factIds: string[];
  evidenceIds: string[];
  authorityIds: string[];
}

interface DraftVersion {
  id: string;
  versionNumber: number;
  contentHash: string;
  status: Draft['status'];
  createdAt: string;
}


interface DraftDetails {
  draft: Draft;
  currentVersion?: { version: DraftVersion; sections: DraftSection[]; citations: Citation[] };
  versions: DraftVersion[];
  reviewFindings: DraftReviewFinding[];
  latestReviewRun?: DraftReviewRun;
  currentReviewRun?: DraftReviewRun;
  reviewContextChanged: boolean;
  documentReferences?: DocumentReference[];
  approvals?: {id:string;draftVersionId:string;status:string}[];
}

interface DraftWriteResponse {
  draft: Draft;
  version: DraftVersion;
  sections: DraftSection[];
  citations: Citation[];
}

interface Citation {
  id: string;
  sectionId: string;
  targetType: 'AUTHORITY' | 'FACT' | 'EVIDENCE';
  targetId: string;
  citationText: string;
  verified: boolean;
}

interface EditableSection {
  ordinal?: number;
  title: string;
  content: string;
  linkedFactIds: string[];
  linkedEvidenceIds: string[];
  linkedAuthorityIds: string[];
  linkedThesisIds: string[];
}


function initialToken(): string {
  try {
    return window.localStorage.getItem('forgelex_api_token') ?? '';
  } catch {
    return '';
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  return requestApiWithToken<T>(path, token, init);
}

const statusLabel: Record<Draft['status'], string> = {
  DRAFT: 'Rascunho',
  IN_REVIEW: 'Em revisão',
  APPROVAL_PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  ARCHIVED: 'Arquivado',
};

export const DraftStudioScreen: React.FC<{ requestedLocation?: string; selectedVersionId?: string; onPieceChange?: (piece: DeskPiece | null) => void; onCaseSources?: () => void; requestedReview?: DeskDocumentSelection; deskEditorialEnabled?: boolean }> = ({ requestedLocation, selectedVersionId, onPieceChange, onCaseSources, requestedReview, deskEditorialEnabled = false }) => {
  const emptySections = () => [{title:'Texto da peça',content:'',linkedFactIds:[],linkedEvidenceIds:[],linkedAuthorityIds:[],linkedThesisIds:[]}];
  const [importedDelivery, setImportedDelivery] = useState<Delivery>();
  const submittedLocalSnapshot = useRef<string>();
  const localSnapshot = useRef('');
  const [newWorkCase, setNewWorkCase] = useState('');
  const { status: authStatus, account } = useAuth();
  const [token] = useState(initialToken);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [undoDraft, setUndoDraft] = useState<{ id: string; title: string }>();
  const [selectedMatterId, setSelectedMatterId] = useState('');
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [loadingSelection, setLoadingSelection] = useState(false);
  const [details, setDetails] = useState<DraftDetails | null>(null);
  const [draftTitle, setDraftTitle] = useState('Minuta para revisão humana');
  const [sections, setSections] = useState<EditableSection[]>(emptySections);
  const [, setIssues] = useState<LegalIssue[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [authorities, setAuthorities] = useState<SavedAuthority[]>([]);
  const [, setTheses] = useState<LegalThesis[]>([]);
  const [citations, setCitations] = useState<Array<{
    sectionOrdinal: number;
    targetType: Citation['targetType'];
    targetId: string;
    citationText: string;
    verified: boolean;
  }>>([]);
  const [, setCitationSectionOrdinal] = useState(0);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [approvalConfirmation, setApprovalConfirmation] = useState<{versionId:string;versionNumber:number} | null>(null);
  const approvalDialog = useRef<HTMLDialogElement>(null);
  const approvalSubmitting = useRef(false);
  useEffect(() => {
    const dialog = approvalDialog.current;
    if (!approvalConfirmation || !dialog) return;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); if(trigger?.isConnected) trigger.focus(); };
  }, [approvalConfirmation]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPayload, setSavedPayload] = useState('');
  const [contextChanged, setContextChanged] = useState(false);
  const [point, setPoint] = useState<ReviewPoint>();
  const [readingDocument, setReadingDocument] = useState<DocumentSource>();
  const [reviewOpenFor, setReviewOpenFor] = useState<string>();
  const lastRequestedReview = useRef<DeskDocumentSelection>();
  const [historyVersion, setHistoryVersion] = useState('');
  const [historyRuns, setHistoryRuns] = useState<DraftReviewRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequest = useRef(0);
  const selection = useRef(0);
  const editingVersion=useRef<string>();
  const [matterContextReady,setMatterContextReady]=useState('');
  const hasApiAccess = Boolean(token.trim()) || authStatus === 'authenticated' || authStatus === 'legacy';

  const deskScope = () => {
    if (window.location.pathname !== '/app/trabalho') return;
    const current = readDeskLocation(window.location.href);
    if (hasDeskPiece(current)) return deskLocation({
      ...current, conversationId: current.executionId ? undefined : current.conversationId, contextRevision: undefined,
    });
  };
  const publishDeskPiece = (scope: string | undefined, document: DeskDocumentSelection) => {
    if (!scope || scope !== deskScope()) return;
    writeDeskLocation(selectDeskPiece(readDeskLocation(window.location.href), document));
  };


  const loadMatters = async () => {
    if (!hasApiAccess) return;
    const sequence = selection.current;
    const requestedQuery = new URL(requestedLocation || window.location.href, window.location.origin).searchParams;
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ items: Matter[] }>('/api/v2/matters', token);
      if (sequence !== selection.current) return;
      setMatters(response.items);
      if(selectedMatterId)await loadDrafts(selectedMatterId);
      if (response.items.length > 0 && !selectedMatterId && requestedQuery.has('matterId') && (!requestedQuery.has('deliveryId') || requestedQuery.has('draftId'))) {
        const initial = requestedQuery.get('matterId');
        if (initial && !response.items.some(m => m.id === initial)) { setError('Este caso não está disponível para sua conta.'); return; }
        await selectMatter(initial ?? response.items[0].id, true);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os casos.');
    } finally {
      if (sequence === selection.current) setBusy(false);
    }
  };

  useEffect(() => {
    void loadMatters();
    // Recarrega o contexto quando muda a sessão ou a credencial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authStatus]);

  const [recoverableMatter, setRecoverableMatter] = useState<string>();
  const saveIntents = useRef(new Map<string, { id: string; path: string; body: string }>());
  const saveInFlight = useRef(false);
  const [pendingSave, setPendingSave] = useState<{ scope: string; id: string }>();
  const saveScope = account && selectedMatterId
    ? pendingDraftSaveKey(account.workspace.id, account.user.id, selectedMatterId)
    : undefined;
  useEffect(() => {
    const id = saveScope && (saveIntents.current.get(saveScope)?.id ?? readPendingDraftSave(saveScope));
    setPendingSave(saveScope && id ? { scope: saveScope, id } : undefined);
  }, [saveScope]);

  const loadDrafts = async (matterId: string) => {
    const sequence = selection.current;
    const response = await request<{ items: Draft[]; saveRecovery?: boolean }>(`/api/v2/matters/${matterId}/drafts`, token);
    if (sequence !== selection.current) return;
    setDrafts(response.items);
    setRecoverableMatter(response.saveRecovery ? matterId : undefined);
  };

  const loadMatterContext = async (matterId: string) => {
    const sequence = selection.current;
    const [issuesResponse, factsResponse, evidenceResponse, authoritiesResponse, thesisMap] = await Promise.all([
      request<{ items: LegalIssue[] }>(`/api/v2/matters/${matterId}/issues`, token),
      request<{ items: Fact[] }>(`/api/v2/matters/${matterId}/facts`, token),
      request<{ items: EvidenceItem[] }>(`/api/v2/matters/${matterId}/evidence`, token),
      request<{ items: SavedAuthority[] }>(`/api/v2/matters/${matterId}/authorities`, token),
      request<{ theses: LegalThesis[] }>(`/api/v2/matters/${matterId}/thesis-map`, token),
    ]);
    if (sequence !== selection.current) return;
    setIssues(issuesResponse.items);
    setFacts(factsResponse.items);
    setEvidence(evidenceResponse.items);
    setAuthorities(authoritiesResponse.items);
    setTheses(thesisMap.theses);
    setMatterContextReady(matterId);
  };

  const selectMatter = async (matterId: string, fromLocation = false) => {
    const keepLocal = !selectedMatterId && !selectedDraftId;
    if (!keepLocal && dirty && !window.confirm('Há alterações não salvas. Deseja descartá-las e abrir este caso?')) return;
    setReadingDocument(undefined);
    const sequence = ++selection.current;
    setMatterContextReady('');
    setPoint(undefined); setHistoryVersion(''); setHistoryRuns([]); setReviewStatus(null); setApprovalConfirmation(null); setSavedPayload(''); setContextChanged(false);
    setSelectedMatterId(matterId);
    setSelectedDraftId('');
    editingVersion.current=undefined;
    setDetails(null);
    if (!keepLocal) { setImportedDelivery(undefined); setDraftTitle('Minuta para revisão humana'); setSections(emptySections()); setCitations([]); }
    if (!fromLocation) publishDeskPiece(deskScope(), { matterId: matterId || undefined });
    setError(null);
    setLoadingSelection(true);
    setBusy(true);
    try {
      if (matterId) await Promise.all([loadDrafts(matterId), loadMatterContext(matterId)]); else setDrafts([]);
    } catch (loadError) {
      if (sequence !== selection.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os rascunhos.');
    } finally {
      if (sequence === selection.current) { setBusy(false); setLoadingSelection(false); }
    }
  };

  // Excluir peça (U4): arquiva sem apagar nada. A peça sai da lista e o aviso oferece "Desfazer", que a reabre.
  const archiveOpenDraft = async () => {
    if (!selectedMatterId || !selectedDraftId || busy) return;
    if (dirty) {
      setError('Salve ou descarte a edição antes de excluir a peça.');
      return;
    }
    const target = { id: selectedDraftId, title: draftTitle || 'Peça sem título' };
    setBusy(true);
    setError(null);
    try {
      await request(`/api/v2/matters/${selectedMatterId}/drafts/${target.id}/archive`, token, { method: 'POST' });
      setUndoDraft(target);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Não foi possível excluir a peça.');
      setBusy(false);
      return;
    }
    setBusy(false);
    await selectMatter(selectedMatterId);
  };
  const restoreArchivedDraft = async () => {
    if (!selectedMatterId || !undoDraft || busy) return;
    const target = undoDraft;
    setBusy(true);
    setError(null);
    try {
      await request(`/api/v2/matters/${selectedMatterId}/drafts/${target.id}/restore`, token, { method: 'POST' });
      setUndoDraft(undefined);
      await loadDrafts(selectedMatterId);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Não foi possível desfazer a exclusão.');
      return;
    } finally {
      setBusy(false);
    }
    await selectDraft(target.id, true);
  };

  const selectDraft = async (draftId: string, adopted = false, fromLocation = false) => {
    if (!selectedMatterId) return;
    if (!adopted && dirty && !window.confirm('Há alterações não salvas. Deseja descartá-las e abrir este rascunho?')) return;
    initialDraftOpened.current=true;
    setReadingDocument(undefined);
    const sequence = ++selection.current;
    const scope = deskScope();
    setPoint(undefined); setHistoryVersion(''); setHistoryRuns([]); setReviewStatus(null); setApprovalConfirmation(null); setContextChanged(false);
    setLoadingSelection(true);
    setBusy(true);
    setError(null);
    try {
      const [response] = await Promise.all([
        request<DraftDetails>(`/api/v2/matters/${selectedMatterId}/drafts/${draftId}`, token),
        loadMatterContext(selectedMatterId),
      ]);
      if (sequence !== selection.current) return;
      setSelectedDraftId(draftId);
      setDetails(response);
      setImportedDelivery(undefined);
      editingVersion.current=response.currentVersion?.version.id;
      const route = new URL(window.location.href);
      const current = readDeskLocation(route.href);
      const sameDraft = current.matterId === selectedMatterId && current.draftId === draftId;
      publishDeskPiece(scope, {
        matterId: selectedMatterId, draftId,
        versionId: fromLocation && sameDraft && current.versionId ? current.versionId : response.currentVersion?.version.id,
        deliveryId: sameDraft ? current.deliveryId : undefined,
      });

      if (response.currentVersion) {
        const version = response.currentVersion;
        setCitationSectionOrdinal(version.sections[0]?.ordinal??0);
        setSavedPayload(JSON.stringify({ title: response.draft.title, sections: version.sections.map((s) => ({ ordinal:s.ordinal, title: s.title, content: s.content, linkedFactIds: s.linkedFactIds, linkedEvidenceIds: s.linkedEvidenceIds, linkedAuthorityIds: s.linkedAuthorityIds, linkedThesisIds: s.linkedThesisIds })), citations: version.citations.map(c => ({ sectionOrdinal: version.sections.find(s => s.id === c.sectionId)?.ordinal ?? 0, targetType: c.targetType, targetId: c.targetId, citationText: c.citationText, verified: c.verified })) }));
        setDraftTitle(response.draft.title);
        setSections(response.currentVersion.sections.map((section) => ({
          ordinal:section.ordinal,
          title: section.title,
          content: section.content,
          linkedFactIds: section.linkedFactIds,
          linkedEvidenceIds: section.linkedEvidenceIds,
          linkedAuthorityIds: section.linkedAuthorityIds,
          linkedThesisIds: section.linkedThesisIds,
        })));
        setCitations(response.currentVersion.citations.map((citation) => ({
          sectionOrdinal: response.currentVersion!.sections.find((section) => section.id === citation.sectionId)?.ordinal ?? 0,
          targetType: citation.targetType,
          targetId: citation.targetId,
          citationText: citation.citationText,
          verified: citation.verified,
        })));
      }
    } catch (loadError) {
      if (sequence !== selection.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a minuta.');
    } finally {
      if (sequence === selection.current) { setBusy(false); setLoadingSelection(false); }
    }
  };


  const payload = () => ({
    title: draftTitle,
    sections: sections.map((section, ordinal) => ({ ordinal:section.ordinal??ordinal, ...section })),
    citations,
  });
  const versionChanged=Boolean(editingVersion.current && details?.currentVersion && editingVersion.current!==details.currentVersion.version.id);
  localSnapshot.current = JSON.stringify({ title: draftTitle, sections: sections.map(({title, content}) => ({title, content})) });
  const dirty = Boolean((versionChanged || JSON.stringify(payload()) !== (details ? savedPayload : JSON.stringify({ title: 'Minuta para revisão humana', sections: emptySections().map((s, ordinal) => ({ ordinal, ...s })), citations: [] }))));
  const [caseUnavailable, setCaseUnavailable] = useState(false);
  useEffect(() => {
    setCaseUnavailable(false);
    const currentId = selectedMatterId;
    let disposed = false;
    const check = async () => {
      if (!currentId) return;
      try {
        const result = await request<{ matter: { lifecycleState: string } }>(`/api/v2/matters/${currentId}`, token);
        if (!disposed) setCaseUnavailable(result.matter.lifecycleState !== 'ACTIVE');
      } catch { if (!disposed) setCaseUnavailable(true); }
    };
    void check();
    window.addEventListener('focus', check);
    return () => { disposed = true; window.removeEventListener('focus', check); };
  }, [selectedMatterId, token]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  const approvalReady = Boolean(details?.latestReviewRun?.state === 'COMPLETE' &&
    details.latestReviewRun.draftVersionId === details.currentVersion?.version.id &&
    details.latestReviewRun.blockingCount === 0 && !dirty && !contextChanged && !details.reviewContextChanged);
  const primaryAction=getDraftPrimaryAction({exists:Boolean(selectedDraftId),dirty,stale:contextChanged||Boolean(details?.reviewContextChanged),reviewState:details?.latestReviewRun?.state,blockingCount:details?.latestReviewRun?.blockingCount??0,approvalStatus:details?.draft.status??'DRAFT',readOnly:caseUnavailable});
  const refreshDetails = async () => {
    const sequence = selection.current;
    const response = await request<DraftDetails>(`/api/v2/matters/${selectedMatterId}/drafts/${selectedDraftId}`, token);
    if (sequence === selection.current) setDetails(response);
  };
  useEffect(() => {
    const changed = (event: Event) => {
      const target = (event as CustomEvent<{matterId:string;draftId:string;versionId:string}>).detail;
      if (target.matterId !== selectedMatterId || target.draftId !== selectedDraftId || target.versionId === editingVersion.current) return;
      if (dirty) { void refreshDetails().catch(()=>setError('Atualize a peça para consultar a nova versão.')); setReviewStatus('Uma nova versão foi criada. Sua edição local foi preservada.'); }
      else void selectDraft(selectedDraftId, true);
    };
    window.addEventListener('forgelex:draft-version-created', changed);
    return ()=>window.removeEventListener('forgelex:draft-version-created', changed);
  }, [selectedMatterId, selectedDraftId, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const openHistory = async (versionId: string) => {
    const sequence = selection.current;
    const requestNumber = ++historyRequest.current;
    setHistoryLoading(true);
    setHistoryVersion(versionId); setHistoryRuns([]); setError(null);
    try {
      const response = await request<{ items: DraftReviewRun[] }>(`/api/v2/matters/${selectedMatterId}/drafts/${selectedDraftId}/review-runs?versionId=${versionId}`, token);
      if (sequence === selection.current && requestNumber === historyRequest.current) setHistoryRuns(response.items);
    } catch { if (sequence === selection.current && requestNumber === historyRequest.current) setError('Não foi possível carregar as conferências.'); }
    finally { if (sequence === selection.current && requestNumber === historyRequest.current) setHistoryLoading(false); }
  };





  const saveDraft = async (
    event?: React.FormEvent,
    expectedCurrentVersionId = editingVersion.current,
    recoveryOnly = false,
  ) => {
    event?.preventDefault();
    if (saveInFlight.current || !selectedMatterId) return;
    if (caseUnavailable) {
      setError('Este caso está disponível apenas para consulta. Sua edição foi mantida.');
      return;
    }
    if (!recoveryOnly && (!draftTitle.trim() || sections.some((section) => section.title.trim().length < 1))) return;
    saveInFlight.current = true;
    setBusy(true);
    setError(null);
    setApprovalConfirmation(null);
    const sequence = selection.current;
    const scope = deskScope();
    const localTextAtStart = localSnapshot.current;
    const content = JSON.stringify(payload());
    const base = `/api/v2/matters/${selectedMatterId}/drafts`;
    const path = selectedDraftId ? `${base}/${selectedDraftId}/versions` : base;
    const body = selectedDraftId
      ? JSON.stringify({ ...payload(), baseVersionId: editingVersion.current, expectedCurrentVersionId })
      : content;
    const memory = saveScope ? saveIntents.current.get(saveScope) : undefined;
    const pendingId = saveScope ? memory?.id ?? readPendingDraftSave(saveScope) : undefined;
    const commandId = pendingId || (saveScope && recoverableMatter === selectedMatterId ? crypto.randomUUID() : undefined);
    const remember = (id?: string) => {
      if (!saveScope) return;
      storePendingDraftSave(saveScope, id);
      if (!id) saveIntents.current.delete(saveScope);
      if (sequence === selection.current) setPendingSave(id ? { scope: saveScope, id } : undefined);
    };
    const recover = async (id: string) => {
      try {
        return await request<DraftWriteResponse>(
          `/api/v2/matters/${selectedMatterId}/draft-save-commands/${encodeURIComponent(id)}`, token, { cache: 'no-store' },
        );
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === 'DRAFT_SAVE_COMMAND_NOT_FOUND') return undefined;
        throw error;
      }
    };

    try {
      let response = pendingId ? await recover(pendingId) : undefined;
      let recovered = Boolean(response);
      if (!response) {
        if (recoveryOnly) {
          setError('Nenhum resultado confirmado. Use Salvar para reenviar com o mesmo identificador.');
          return;
        }
        if (sequence !== selection.current) return;
        if (memory && memory.path !== path)
          throw new Error('Há um salvamento pendente para outra peça deste caso. Recupere o resultado antes de salvar.');
        if (commandId && saveScope) {
          const intent = { id: commandId, path, body: memory?.body ?? body };
          saveIntents.current.set(saveScope, intent);
          remember(commandId);
          try {
            response = await request<DraftWriteResponse>(intent.path, token, {
              method: 'POST',
              body: JSON.stringify({ ...JSON.parse(intent.body), commandId }),
            });
          } catch (error) {
            const definitive = error instanceof ApiRequestError && error.status < 500 &&
              error.code !== 'DRAFT_SAVE_COMMAND_CONFLICT';
            if (definitive && (!pendingId || memory) && error instanceof ApiRequestError &&
                (error.status === 400 || error.code === 'DRAFT_VERSION_CONFLICT' || error.status === 401)) {
              remember();
              throw error;
            }
            response = await recover(commandId);
            if (!response) throw new Error('Salvamento sem confirmação. Recupere o resultado antes de tentar novamente.', { cause: error });
            recovered = true;
          }
        } else {
          response = await request<DraftWriteResponse>(path, token, { method: 'POST', body });
        }
      }
      if (sequence !== selection.current) return;
      if (selectedDraftId && selectedDraftId !== response.draft.id) {
        await loadDrafts(selectedMatterId);
        remember();
        if (sequence === selection.current) setReviewStatus(`Salvamento recuperado em “${response.draft.title}”.`);
        return;
      }
      // Bind the original receipt even if refreshing the current draft fails.
      setSelectedDraftId(response.draft.id);
      editingVersion.current = response.version.id;
      const savedSections = response.sections.map(({ ordinal, title, content, linkedFactIds, linkedEvidenceIds, linkedAuthorityIds, linkedThesisIds }) =>
        ({ ordinal, title, content, linkedFactIds, linkedEvidenceIds, linkedAuthorityIds, linkedThesisIds }));
      const savedCitations = (response.citations ?? []).map(({ sectionId, targetType, targetId, citationText, verified }) => ({
        sectionOrdinal: response.sections.find((section) => section.id === sectionId)?.ordinal ?? 0,
        targetType, targetId, citationText, verified,
      }));
      const savedContent = JSON.stringify({ title: response.draft.title, sections: savedSections, citations: savedCitations });
      setSavedPayload(commandId ? savedContent : content);
      setContextChanged(false);
      await loadDrafts(selectedMatterId);
      if (sequence !== selection.current) return;
      const updated = await request<DraftDetails>(`${base}/${response.draft.id}`, token, { cache: 'no-store' });
      if (sequence !== selection.current) return;
      setDetails(updated);
      const advanced = updated.currentVersion?.version.id !== response.version.id;
      const restoreLocal = (recovered || recoveryOnly) && !dirty && !advanced && localSnapshot.current === localTextAtStart;
      if (restoreLocal) {
        setDraftTitle(response.draft.title);
        setSections(savedSections);
        setCitations(savedCitations);
      }
      const current = readDeskLocation(window.location.href);
      publishDeskPiece(scope, {
        matterId: selectedMatterId, draftId: response.draft.id, versionId: response.version.id,
        deliveryId: current.draftId === response.draft.id && current.versionId === response.version.id
          ? current.deliveryId : undefined,
      });
      remember();
      if (advanced) {
        setError('Salvamento localizado. Há uma versão posterior no caso e sua edição local foi preservada.');
        return;
      }
      setReviewStatus(recovered || pendingId ? 'Salvamento recuperado.' : 'Versão salva.');
      // The composer must not submit a saved version if the editor still has other unsaved text.
      if (commandId && !restoreLocal && (content !== savedContent || localSnapshot.current !== localTextAtStart)) return;
      return response;
    } catch (saveError) {
      if (sequence === selection.current)
        setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a versão.');
    } finally {
      saveInFlight.current = false;
      if (sequence === selection.current) setBusy(false);
    }
  };

  const recoverSaveAction = saveScope && pendingSave?.scope === saveScope && (
    <button type="button" className="btn-secondary" disabled={busy || loadingSelection || caseUnavailable}
      onClick={() => void saveDraft(undefined, undefined, true)}>
      Recuperar salvamento
    </button>
  );


  const initialDraftOpened=useRef(false);
  useEffect(()=>{
    const target=new URL(requestedLocation || window.location.href, window.location.origin).searchParams.get('draftId');
    if(!initialDraftOpened.current&&target&&selectedMatterId&&matterContextReady===selectedMatterId&&drafts.some(d=>d.id===target)){initialDraftOpened.current=true;void selectDraft(target,false,true);}
  },[drafts,selectedMatterId,matterContextReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const handledLocation = useRef<string>();
  const [editSelection, setEditSelection] = useState<DeskEditSelection>();
  useEffect(() => {
    if (!requestedLocation || !matters.length || handledLocation.current === requestedLocation) return;
    handledLocation.current = requestedLocation;
    const query = new URL(requestedLocation, window.location.origin).searchParams;
    const targetMatter = query.get('matterId'), targetDraft = query.get('draftId') ?? '', targetVersion = query.get('versionId');
    if (!targetMatter) {
      if (!query.has('deliveryId') && selectedMatterId) void selectMatter('', true);
      return;
    }
    if (targetMatter === selectedMatterId && targetDraft === selectedDraftId) {
      if (targetDraft && targetVersion && targetVersion !== editingVersion.current) {
        if (dirty) { setError('A IA concluiu uma nova versão. Sua edição local foi preservada.'); return; }
        void selectDraft(targetDraft, false, true);
      }
      return;
    }
    if (!matters.some(matter => matter.id === targetMatter)) { setError('Este caso não está disponível para sua conta.'); return; }
    initialDraftOpened.current = false;
    if (targetMatter !== selectedMatterId || !targetDraft) void selectMatter(targetMatter, true);
    else void selectDraft(targetDraft, false, true);
  }, [requestedLocation, matters]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!onPieceChange) return;
    const versionId = editingVersion.current;
    const snapshot: DeskPiece = {
      matterId: selectedMatterId, draftId: selectedDraftId, versionId: versionId ?? '', title: draftTitle,
      dirty: dirty || loadingSelection || caseUnavailable || contextChanged,
      loadingSelection,
      deliveryId: importedDelivery?.id,
      canOpenDelivery: attached => !loadingSelection && (!dirty || (attached && submittedLocalSnapshot.current === localSnapshot.current)),
      editSelection: !dirty && editSelection?.versionId === versionId ? editSelection : undefined,
      clearEditSelection: () => setEditSelection(undefined),
    };
    snapshot.prepare = async () => {
      if (busy || loadingSelection || caseUnavailable) throw new Error('A peça ainda está sendo atualizada.');
      if (!selectedMatterId) { submittedLocalSnapshot.current = localSnapshot.current; return { ...snapshot, dirty: false, localText: localSnapshot.current }; }
      if (!dirty && selectedDraftId && versionId) return snapshot;
      const saved = await saveDraft();
      if (!saved) throw new Error('Não foi possível guardar a edição. Seu texto foi preservado.');
      return { matterId: selectedMatterId, draftId: saved.draft.id, versionId: saved.version.id, title: draftTitle, dirty: false };
    };
    onPieceChange(snapshot);
  }, [onPieceChange, selectedMatterId, selectedDraftId, details?.currentVersion?.version.id, importedDelivery, draftTitle, sections, dirty, busy, loadingSelection, caseUnavailable, contextChanged, editSelection]); // eslint-disable-line react-hooks/exhaustive-deps
  const expectedWorkVersion = new URLSearchParams(requestedLocation?.split('?')[1] ?? window.location.search).get('versionId');
  const selectionHasDifferentVersion = Boolean(selectedVersionId && editingVersion.current && selectedVersionId !== editingVersion.current);
  const requestedVersion = selectedVersionId ?? expectedWorkVersion;
  const reviewTargetMismatch = Boolean(requestedVersion && requestedVersion !== details?.currentVersion?.version.id);
  const importDeliveryId = new URLSearchParams(requestedLocation?.split('?')[1] ?? window.location.search).get('deliveryId');
  useEffect(() => {
    let active = true;
    const sequence = selection.current;
    const scope = deskScope();
    if (!importDeliveryId || new URL(requestedLocation || window.location.href, window.location.origin).searchParams.has('draftId') || authStatus !== 'authenticated') return;
    void requestApi<Delivery>(`/api/agentic/deliveries/${encodeURIComponent(importDeliveryId)}`, {}, { sessionOnly: true }).then(d => {
      if (!active || sequence !== selection.current || scope !== deskScope() || !d.delivery.document) return;
      if (dirty && submittedLocalSnapshot.current !== localSnapshot.current) { setError('Sua edição local foi preservada. A resposta está disponível na conversa.'); return; }
      submittedLocalSnapshot.current = undefined;
      editingVersion.current=undefined;
      setSelectedMatterId(''); setSelectedDraftId(''); setDetails(null); setImportedDelivery(d); setSavedPayload('');
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Entrega indisponível.'); });
    return () => { active = false; };
  }, [importDeliveryId, authStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!importedDelivery?.delivery.document || selectedDraftId) return;
    setDraftTitle(importedDelivery.delivery.document.title);
    setSections(importedDelivery.delivery.document.sections.map((s, ordinal) => ({ ordinal, title: s.title, content: s.content, linkedFactIds: [], linkedEvidenceIds: [], linkedAuthorityIds: [], linkedThesisIds: [] })));
  }, [importedDelivery]); // eslint-disable-line react-hooks/exhaustive-deps

  const runReview = async (saved?: DraftWriteResponse) => {
    const versionId = saved?.version.id ?? details?.currentVersion?.version.id;
    const draftId = saved?.draft.id ?? selectedDraftId;
    if (!selectedMatterId || !draftId || !versionId || caseUnavailable || (!saved && (dirty || reviewTargetMismatch))) return;
    const sequence = selection.current;
    setBusy(true);
    setError(null);
    try {
      await request(
        `/api/v2/matters/${selectedMatterId}/drafts/${draftId}/review`,
        token,
        { method: 'POST', body: JSON.stringify({ type: 'all', versionId }) },
      );
      if (sequence === selection.current) { setContextChanged(false); await refreshDetails(); }
    } catch (reviewError) {
      if (sequence === selection.current)
        setError(reviewError instanceof Error ? reviewError.message : 'Não foi possível executar a revisão.');
    } finally {
      if (sequence === selection.current) setBusy(false);
    }
  };

  const requestApproval = async () => {
    if (!selectedMatterId || !selectedDraftId || !approvalReady || !approvalConfirmation || approvalSubmitting.current || reviewTargetMismatch || caseUnavailable) return;
    const versionId = approvalConfirmation.versionId;
    const scope = selection.current;
    if (versionId !== details?.draft.currentVersionId) {setError('A versão mudou. Confira novamente.');setApprovalConfirmation(null);return;}
    approvalSubmitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const base = `/api/v2/matters/${selectedMatterId}/drafts/${selectedDraftId}`;
      const fresh = await requestApi<DraftDetails>(base,undefined,{sessionOnly:true});
      if (scope !== selection.current || fresh.draft.currentVersionId !== versionId || fresh.reviewContextChanged) throw new Error('A versão ou o contexto mudou. Confira novamente.');
      const pending = fresh.approvals?.find(a => a.draftVersionId === versionId && a.status === 'PENDING');
      const response = await requestApi<{ token: string }>(`${base}/approval${pending?`/${pending.id}/reissue`:''}`, {
        method: 'POST',
        body: JSON.stringify({ versionId }),
      },{sessionOnly:true});
      if (scope !== selection.current) return;
      await requestApi('/api/v2/draft-approvals/resolve',{method:'POST',body:JSON.stringify({token:response.token,decision:'APPROVED',reason:'Decisão explícita no editor sobre a versão conferida.'})},{sessionOnly:true});
      if (scope !== selection.current) return;
      setApprovalConfirmation(null);
      await refreshDetails();
      if (scope !== selection.current) return;
      await loadDrafts(selectedMatterId);
      if (scope === selection.current) setReviewStatus('Aprovação registrada para esta versão.');
    } catch (approvalError) {
      if (scope === selection.current) {
        setError(approvalError instanceof Error ? approvalError.message : 'A versão não pode ser encaminhada para aprovação.');
        await refreshDetails().catch(()=>undefined);
      }
    } finally {
      approvalSubmitting.current = false;
      if (scope === selection.current) setBusy(false);
    }
  };

  const exportOpenPiece = async (format: 'docx' | 'pdf') => {
    const current = details?.currentVersion;
    const saved = {
      local: dirty || !current,
      title: draftTitle,
      version: { id: current?.version.id ?? 'local', versionNumber: (current?.version.versionNumber ?? 0) + (dirty || !current ? 1 : 0), contentHash: dirty ? '' : current?.version.contentHash ?? '', status: dirty || !current ? 'DRAFT' : current.version.status, createdAt: dirty || !current ? new Date().toISOString() : current.version.createdAt },
      sections: sections.map((section, index) => ({ id: current?.sections[index]?.id ?? String(index), ordinal: section.ordinal ?? index, title: section.title, content: section.content })),
      citations: citations.map(c => ({ sectionId: current?.sections.find(s => s.ordinal === c.sectionOrdinal)?.id ?? String(c.sectionOrdinal), citationText: c.citationText, verified: c.verified })),
      documentReferences: details?.documentReferences,
    };
    try {
      if (format === 'pdf') printDraftPdf(saved);
      else { const { downloadDraftDocx } = await import('../documents/draft-docx'); await downloadDraftDocx(saved); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível exportar a peça.'); }
  };
  const openVersionReview = () => {
    if (!selectedDraftId) return;
    setReviewOpenFor(selectedDraftId);
    if (reviewTargetMismatch && requestedVersion) void openHistory(requestedVersion);
  };
  useEffect(() => {
    if (!requestedReview || requestedReview === lastRequestedReview.current || loadingSelection ||
        requestedReview.matterId !== selectedMatterId || requestedReview.draftId !== selectedDraftId || !details?.currentVersion)
      return;
    lastRequestedReview.current = requestedReview;
    openVersionReview();
  }, [requestedReview, selectedMatterId, selectedDraftId, loadingSelection, details?.currentVersion?.version.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentReview = details && <ReviewPanel latestRun={details.latestReviewRun} currentRun={details.currentReviewRun} findings={details.reviewFindings} stale={dirty || contextChanged || details.reviewContextChanged} onOpenPoint={reviewPoint => {
                  const { check } = reviewPoint;
                  if (check.targetType === 'DOCUMENT' && check.targetId && check.source?.documentVersionId) {
                    setReadingDocument({ matterId: selectedMatterId, documentId: check.targetId, versionId: check.source.documentVersionId, anchorId: check.source.anchorId });
                  } else setPoint(reviewPoint);
                }} />;
  const sourcePanel = point && <SourcePanel point={point} matterId={selectedMatterId} token={token} facts={facts} evidence={evidence} authorities={authorities}
                sectionTitle={details?.currentVersion?.sections.find(s => s.id === point.check.sectionId)?.title}
                citationText={details?.currentVersion?.citations.find(c => c.sectionId === point.check.sectionId && c.targetId === point.check.targetId)?.citationText}
                onClose={() => setPoint(undefined)} onLinked={() => { setContextChanged(true); void refreshDetails().catch(() => setError('Vínculo salvo. Atualize a conferência para consultar o resultado.')); }}
                onEditSection={() => {
                  const index = details?.currentVersion?.sections.findIndex(s => s.id === point.check.sectionId) ?? -1;
                  setPoint(undefined); setReviewOpenFor(undefined); requestAnimationFrame(() => document.getElementById('draft-section-' + index)?.focus());
                }}
                onLinkReference={() => {
                  const index = details?.currentVersion?.sections.findIndex(s => s.id === point.check.sectionId) ?? -1;
                  const field = point.check.targetType === 'AUTHORITY' ? 'linkedAuthorityIds' : point.check.targetType === 'FACT' ? 'linkedFactIds' : 'linkedEvidenceIds';
                  if (index >= 0 && point.check.targetId) setSections(current => current.map((s, i) => i === index ? { ...s, [field]: [...new Set([...s[field], point.check.targetId!])] } : s));
                  setPoint(undefined);
                }}
                onRemoveReference={() => {
                  const index = details?.currentVersion?.sections.findIndex(s => s.id === point.check.sectionId) ?? -1;
                  const field = point.check.targetType === 'AUTHORITY' ? 'linkedAuthorityIds' : point.check.targetType === 'FACT' ? 'linkedFactIds' : 'linkedEvidenceIds';
                  if (index >= 0) {
                    setSections(current => current.map((s, i) => i === index ? { ...s, [field]: s[field].filter(id => id !== point.check.targetId) } : s));
                    const ordinal = details?.currentVersion?.sections[index].ordinal;
                    setCitations(current => current.filter(c => c.sectionOrdinal !== ordinal || c.targetId !== point.check.targetId || c.targetType !== point.check.targetType));
                  }
                  setPoint(undefined);
                }} />;
  const approvalModal = approvalConfirmation && <dialog ref={approvalDialog} aria-labelledby="draft-approval-title" onCancel={(event)=>{if(busy)event.preventDefault();else setApprovalConfirmation(null);}} className="rounded-2xl p-6 max-w-lg w-[calc(100%-2rem)] backdrop:bg-stone-900/50">
          <h2 id="draft-approval-title" className="text-xl font-bold">Aprovar esta versão</h2>
          <p className="mt-3">{draftTitle} · Versão {approvalConfirmation.versionNumber}</p>
          <p className="mt-3 text-sm">Você registra sua decisão sobre esta versão. A conferência automática não confirma a veracidade dos fatos nem a pertinência jurídica. Esta ação não publica ou envia o documento.</p>
          <ul className="mt-3 space-y-2 text-sm text-amber-900">{details?.latestReviewRun?.checks.filter(c=>c.state!=='CONFIRMED'&&c.state!=='NOT_APPLICABLE').map((c,i)=><li key={i}>{c.message}</li>)}</ul>
          <p className="mt-3 text-sm">{details?.latestReviewRun?.checks.filter(c=>c.state!=='CONFIRMED'&&c.state!=='NOT_APPLICABLE').length ?? 0} pontos de atenção na conferência. Consulte os alertas antes de confirmar.</p>
          {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
          <div className="mt-5 flex gap-3"><button type="button" className="btn-primary" disabled={busy || reviewTargetMismatch || !approvalReady || caseUnavailable} onClick={()=>void requestApproval()}>Confirmar aprovação</button><button type="button" className="btn-secondary" disabled={busy} onClick={()=>setApprovalConfirmation(null)}>Voltar à conferência</button></div>
        </dialog>;
  const activeVersion = details?.currentVersion?.version;
  const editorialVersionId = requestedVersion ?? activeVersion?.id;
  const editorialDelivery = importDeliveryId && expectedWorkVersion === editorialVersionId
    ? importDeliveryId
    : deskEditorialEnabled ? `desk:${selectedMatterId}` : undefined;
  const reviewActions = selectedMatterId && selectedDraftId && activeVersion && (
    <>
      <button type="button" className="min-h-9 rounded-lg px-2 hover:bg-stone-100" onClick={openVersionReview}>
        Conferência da peça
      </button>
      {editorialDelivery && editorialVersionId && details?.versions.some((version) => version.id === editorialVersionId) && (
        <EditorialReviewPanel
          key={`${editorialDelivery}:${selectedDraftId}:${editorialVersionId}`}
          deliveryId={editorialDelivery} matterId={selectedMatterId}
          draftId={selectedDraftId} versionId={editorialVersionId}
          disabled={busy || loadingSelection || caseUnavailable || (dirty && !reviewTargetMismatch)}
        />
      )}
    </>
  );
  const reviewModal = reviewOpenFor && reviewOpenFor === selectedDraftId && details && (
    <CanvasDialog title="Conferência da peça" onClose={() => setReviewOpenFor(undefined)}>
      {reviewTargetMismatch ? (
        <div className="space-y-3">
          <p role="status">Histórico da versão {details.versions.find((v) => v.id === requestedVersion)?.versionNumber ?? 'solicitada'}. Somente leitura.</p>
          {historyLoading && <p role="status">Carregando conferências…</p>}
          {!historyLoading && historyVersion === requestedVersion && !error && historyRuns.length === 0 && (
            <p>Nenhuma conferência registrada para esta versão.</p>
          )}
          {historyVersion === requestedVersion && historyRuns.map((run) => (
            <ReviewPanel key={run.id} latestRun={run} findings={[]} stale={false} />
          ))}
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-stone-600">Versão salva {activeVersion?.versionNumber}</p>
          {currentReview}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy || dirty || caseUnavailable} onClick={() => void runReview()}>Conferir rascunho</button>
            {primaryAction === 'APPROVE' && activeVersion && (
              <button type="button" className="btn-primary" disabled={busy || !approvalReady || caseUnavailable}
                onClick={() => setApprovalConfirmation({ versionId: activeVersion.id, versionNumber: activeVersion.versionNumber })}>
                Aprovar esta versão
              </button>
            )}
          </div>
          {dirty && <p className="mt-3 text-sm text-stone-600">Salve as alterações para conferir o texto editado.</p>}
        </>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-amber-900">{error}</p>}
      {reviewStatus && <p role="status" className="mt-3 text-sm text-emerald-800">{reviewStatus}</p>}
    </CanvasDialog>
  );

  return <>
    {recoverSaveAction && <div className="px-4 py-2">{recoverSaveAction}</div>}
    {reviewModal}
    {approvalModal}
    {sourcePanel}
    {readingDocument && readingDocument.matterId === selectedMatterId && hasApiAccess && <DocumentReaderDialog source={readingDocument} token={token} onClose={() => setReadingDocument(undefined)} />}
    <DraftCanvas title={draftTitle} sections={sections} matters={matters} drafts={drafts} matterId={selectedMatterId} draftId={selectedDraftId}
      busy={busy || loadingSelection || caseUnavailable} dirty={dirty} error={error} status={reviewStatus}
      onTitle={setDraftTitle} onSection={(i,field,value)=>setSections(old=>old.map((s,index)=>index===i?{...s,[field]:value}:s))}
      editVersionId={!dirty && !selectionHasDifferentVersion && !contextChanged ? details?.currentVersion?.version.id : undefined}
      onEditSelection={(index, start, end, displayed) => {
        const version = details?.currentVersion;
        const section = version?.sections[index];
        if (!version || !section || dirty || displayed !== section.content.replace(/\r\n?/g, '\n')) return;
        // A textarea renders CRLF as one character. Map its offsets to the saved text.
        const offset = (position: number) => {
          let saved = 0;
          for (let i = 0; i < position; i++, saved++) {
            if (section.content[saved] === '\r' && section.content[saved + 1] === '\n') saved++;
          }
          return saved;
        };
        const from = offset(start), to = offset(end), before = section.content.slice(from, to);
        if (before.length > 16000 || /[\uD800-\uDFFF]/u.test(before)) {
          setError('Selecione um trecho menor, com caracteres completos.');
          return;
        }
        setEditSelection({ versionId: version.version.id, sectionId: section.id, start: from, end: to, before });
      }}
      onMatter={id=>void selectMatter(id)} onDraft={id=>id ? void selectDraft(id) : void selectMatter(selectedMatterId)}
      onArchive={() => void archiveOpenDraft()}
      onSave={()=>void saveDraft()} onExport={format=>void exportOpenPiece(format)} onCaseSources={onCaseSources} reviewActions={reviewActions}
      caseControls={<details><summary className="cursor-pointer text-xs text-stone-600">Criar caso</summary><label className="mt-2 block text-xs">Nome do caso<input className="mt-1 w-full rounded border p-2" value={newWorkCase} maxLength={200} onChange={e=>setNewWorkCase(e.target.value)}/></label><button type="button" className="mt-2 text-sm text-cognac-800" disabled={busy || !newWorkCase.trim()} onClick={async()=>{setBusy(true);try{const m=await requestApi<Matter>('/api/v2/matters',{method:'POST',body:JSON.stringify({title:newWorkCase.trim()})},{sessionOnly:true});setMatters(old=>[...old,m]);await selectMatter(m.id);setNewWorkCase('');}catch(e){setError(e instanceof Error?e.message:'Não foi possível criar o caso.');}finally{setBusy(false);}}}>Criar caso e usar na peça</button></details>}
      extras={<>{undoDraft && <UndoNotice message={`Peça excluída: ${undoDraft.title}. As versões, revisões e recibos foram preservados.`} busy={busy} onUndo={() => void restoreArchivedDraft()} onDismiss={() => setUndoDraft(undefined)} />}{selectionHasDifferentVersion ? <p className="px-5 pt-3 text-sm text-stone-600">
        Este link aponta para outra versão. <button type="button" className="underline" disabled={busy || loadingSelection}
          onClick={() => publishDeskPiece(deskScope(), { matterId: selectedMatterId, draftId: selectedDraftId, versionId: editingVersion.current })}>Usar versão aberta</button>
      </p> : importedDelivery && !selectedMatterId ? <p className="px-5 pt-3 text-sm text-stone-600">Escolha um caso em “Abrir peça” para guardar esta entrega. Você já pode editar e exportar localmente.</p> : undefined}</>}
      history={<div className="space-y-3">{details?.versions.map(v=><button type="button" key={v.id} onClick={()=>void openHistory(v.id)} className="block w-full rounded-lg border border-stone-200 p-3 text-left">Versão {v.versionNumber} · {statusLabel[v.status]}</button>)}{historyLoading && <p>Carregando…</p>}{historyRuns.map(r=><div key={r.id}>{r.checks.map((c,i)=><p key={i} className="py-2 text-sm">{c.message}</p>)}</div>)}</div>}

    />
  </>;
};
