import type { DraftReviewCheck, DraftReviewFinding, DraftReviewMode, DraftReviewResult } from '@forgelex/domain';
import { reviewContextHash, type DraftRepository, type DraftReviewRunRepository, type FactsEvidenceRepository, type MatterRepository, type MatterAuthorityRepository } from '@forgelex/persistence';
import type { FactsEvidenceService } from '../facts-evidence/facts-evidence-service.js';
import type { DraftContext } from '../drafting/draft-service.js';
import type { ResearchService } from '../research/research-service.js';

export type ReviewResult = DraftReviewResult;
export interface DraftReviewDependencies {
  drafts: DraftRepository; runs: DraftReviewRunRepository; facts: FactsEvidenceService;
  authorities: MatterAuthorityRepository; research: ResearchService; evidence: FactsEvidenceRepository;
  matters: MatterRepository; sourceMethod: 'PERSISTED_CORPUS' | 'PROVIDER';
}
type FindingInput = Omit<DraftReviewFinding, 'id' | 'createdAt' | 'reviewRunId'>;
export class DraftReviewService {
  constructor(private readonly deps: DraftReviewDependencies) {}
  verifyCitations(c: DraftContext, id: string, v?: string) { return this.execute(c, id, 'CITATION', v); }
  checkFactSupport(c: DraftContext, id: string, v?: string) { return this.execute(c, id, 'FACT_SUPPORT', v); }
  adversarialReview(c: DraftContext, id: string, v?: string) { return this.execute(c, id, 'STRUCTURE', v); }
  runAll(c: DraftContext, id: string, v?: string) { return this.execute(c, id, 'ALL', v); }
  private async execute(context: DraftContext, draftId: string, mode: DraftReviewMode, versionId?: string): Promise<ReviewResult> {
    const { drafts, runs } = this.deps;
    const bundle = versionId ? await drafts.getVersion(context.tenantId, context.matterId, draftId, versionId) : await drafts.getCurrentVersion(context.tenantId, context.matterId, draftId);
    if (!bundle) throw new Error('DRAFT_VERSION_NOT_FOUND: versão não localizada neste caso.');
    const snapshot = await drafts.reviewContext(context, bundle);
    const run = await runs.start(context, bundle.version, mode, reviewContextHash(snapshot));
    const checks: DraftReviewCheck[] = [], findings: FindingInput[] = [];
    const add = (kind: DraftReviewCheck['kind'], state: DraftReviewCheck['state'], code: string, message: string, severity?: DraftReviewFinding['severity'], extra: Partial<DraftReviewCheck> = {}) => {
      checks.push({ kind, state, code, message, checkedAt: new Date().toISOString(), ...extra });
      if (severity) findings.push({ tenantId: context.tenantId, matterId: context.matterId, draftId, draftVersionId: bundle.version.id, reviewType: kind === 'STRUCTURE' ? 'ADVERSARIAL' : kind, severity, code, message, sectionId: extra.sectionId, targetId: extra.targetId });
    };
    try {
      if (mode === 'ALL' || mode === 'CITATION') {
        for (const citation of bundle.citations) {
          const section = bundle.sections.find(s => s.id === citation.sectionId);
          const links = citation.targetType === 'AUTHORITY' ? section?.linkedAuthorityIds : citation.targetType === 'FACT' ? section?.linkedFactIds : section?.linkedEvidenceIds;
          if (!links?.includes(citation.targetId)) add('CITATION', 'ATTENTION', 'CITATION_TARGET_NOT_LINKED', 'Vincule a referência à seção em que ela é utilizada.', 'BLOCKING', { sectionId: citation.sectionId, targetType: citation.targetType, targetId: citation.targetId });
        }
        const refs = bundle.sections.flatMap(section => section.linkedAuthorityIds.map(targetId => ({ sectionId: section.id, targetId })));
        for (const c of bundle.citations.filter(c => c.targetType === 'AUTHORITY')) if (!refs.some(r => r.targetId === c.targetId && r.sectionId === c.sectionId)) refs.push({ sectionId: c.sectionId, targetId: c.targetId });
        const ids = [...new Set(refs.map(r => r.targetId))]; let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
          while (cursor < ids.length) {
            const id = ids[cursor++], saved = snapshot.authorities.find(a => a.id === id);
            const locations = refs.filter(r => r.targetId === id);
            if (!saved) { for (const ref of locations) add('CITATION', 'ATTENTION', 'AUTHORITY_NOT_IN_MATTER', 'A referência não pertence a este caso. Selecione uma fonte do caso.', 'BLOCKING', { ...ref, targetType: 'AUTHORITY' }); continue; }
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              const response = await Promise.race([this.deps.research.verifyAuthority({ court: saved.authority.court, processNumber: saved.authority.processNumber, judgmentDate: saved.authority.judgmentDate }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('SOURCE_TIMEOUT')), 15000); })]);
              const confirmed = response.status === 'VERIFIED_OFFICIAL' || response.status === 'VERIFIED_PROVIDER';
              const message = confirmed ? (this.deps.sourceMethod === 'PERSISTED_CORPUS' ? 'Referência localizada no acervo. Confira se o julgado sustenta o argumento.' : 'Referência localizada na fonte consultada. Confira se o julgado sustenta o argumento.') : response.status === 'NOT_FOUND' ? 'Referência não localizada no acervo consultado. Isso não demonstra que o julgado inexiste.' : response.status === 'CONFLICTING_METADATA' ? 'Os dados cadastrados diferem dos dados da fonte. Confira a referência.' : 'Não foi possível confirmar a referência com os dados disponíveis.';
              for (const ref of locations) {
                const citation = bundle.citations.find(c => c.sectionId === ref.sectionId && c.targetId === id && c.targetType === 'AUTHORITY'), source = response.authority?.provenance.source;
                add('CITATION', confirmed ? 'CONFIRMED' : 'ATTENTION', response.status === 'NOT_FOUND' ? 'AUTHORITY_NOT_FOUND' : response.status, message, confirmed ? undefined : 'WARNING', { ...ref, targetType: 'AUTHORITY', humanConfirmed: citation?.verified ?? false, checkedAt: response.checkedAt, source: { method: this.deps.sourceMethod, providerId: response.providerId, sourceUrl: source?.sourceUrl, contentHash: source?.contentHash, capturedAt: source?.capturedAt } });
              }
            } catch (error) {
              const unsupported = String(error).includes('UNSUPPORTED_COURT');
              for (const ref of locations) add('CITATION', unsupported ? 'ATTENTION' : 'UNAVAILABLE', unsupported ? 'COURT_NOT_SUPPORTED' : 'SOURCE_UNAVAILABLE', unsupported ? 'Este tribunal não está incluído na conferência automática. Confira a referência na fonte.' : 'A fonte está temporariamente indisponível. Tente conferir novamente.', 'WARNING', { ...ref, targetType: 'AUTHORITY', humanConfirmed: bundle.citations.some(c => c.targetId === id && c.sectionId === ref.sectionId && c.verified) });
            } finally { if (timer) clearTimeout(timer); }
          }
        }));
        if (!bundle.citations.length) add('CITATION', 'ATTENTION', 'CITATIONS_MISSING', 'Nenhuma referência cadastrada. A conferência não identifica citações no texto livre.', 'WARNING');
      }
      if (mode === 'ALL' || mode === 'FACT_SUPPORT' || mode === 'CITATION') {
        for (const section of bundle.sections) {
          for (const factId of section.linkedFactIds) {
            const support = snapshot.supports.find(s => s.fact.id === factId), extra = { sectionId: section.id, targetType: 'FACT' as const, targetId: factId };
            if (!support) add('FACT_SUPPORT', 'ATTENTION', 'FACT_NOT_FOUND', 'O fato não pertence a este caso. Selecione um fato do caso.', 'BLOCKING', extra);
            else { const coverage = support.coverage.coverage;
              add('FACT_SUPPORT', coverage === 'SUPPORTED' ? 'CONFIRMED' : 'ATTENTION', coverage === 'SUPPORTED' ? 'FACT_SUPPORT_REGISTERED' : coverage === 'PARTIAL' ? 'FACT_SUPPORT_PARTIAL' : 'FACT_SUPPORT_INSUFFICIENT', coverage === 'SUPPORTED' ? 'Há provas vinculadas ao fato. O vínculo não comprova a veracidade do conteúdo.' : coverage === 'CONFLICTING' ? 'Há relações de apoio e de contradição. Confira os documentos.' : coverage === 'PARTIAL' ? 'O suporte cadastrado é parcial. Confira ou vincule uma prova.' : 'Este fato não tem prova de apoio vinculada.', coverage === 'SUPPORTED' ? undefined : coverage === 'PARTIAL' ? 'WARNING' : 'BLOCKING', extra);
            }
          }
          for (const id of section.linkedEvidenceIds) if (!snapshot.evidence.some(e => e.id === id)) add('FACT_SUPPORT', 'ATTENTION', 'EVIDENCE_NOT_FOUND', 'A prova não pertence a este caso. Selecione uma prova do caso.', 'BLOCKING', { sectionId: section.id, targetType: 'EVIDENCE', targetId: id });
        }
        for (const c of bundle.citations.filter(c => c.targetType !== 'AUTHORITY')) if (!(c.targetType === 'FACT' ? snapshot.facts.some(f => f.id === c.targetId) : snapshot.evidence.some(e => e.id === c.targetId))) add('FACT_SUPPORT', 'ATTENTION', 'CITATION_TARGET_NOT_FOUND', 'A fonte da referência não pertence a este caso.', 'BLOCKING', { sectionId: c.sectionId, targetId: c.targetId, targetType: c.targetType });
        const anchorIds = snapshot.supports.flatMap(s => s.sourceLinks.map(l => l.documentAnchorId)).concat(snapshot.evidenceSourceLinks.map(l => l.documentAnchorId));
        if (anchorIds.some(id => !snapshot.anchors.some(a => a.id === id))) add('FACT_SUPPORT', 'ATTENTION', 'SUPPORT_SOURCE_NOT_FOUND', 'Um trecho vinculado não está disponível neste caso. Confira os vínculos.', 'BLOCKING');
        if (!bundle.sections.some(s => s.linkedFactIds.length)) add('FACT_SUPPORT', 'ATTENTION', 'FACTS_NOT_LINKED', 'Não há fatos vinculados às seções.', 'WARNING');
      }
      if (mode === 'ALL' || mode === 'STRUCTURE') {
        for (const section of bundle.sections) add('STRUCTURE', section.content.trim() ? 'CONFIRMED' : 'ATTENTION', section.content.trim() ? 'SECTION_CONTENT_PRESENT' : 'SECTION_CONTENT_EMPTY', section.content.trim() ? `A seção “${section.title}” possui conteúdo.` : `A seção “${section.title}” está vazia.`, section.content.trim() ? undefined : 'BLOCKING', { sectionId: section.id });
        if (!bundle.sections.some(s => s.linkedAuthorityIds.length)) add('STRUCTURE', 'ATTENTION', 'AUTHORITIES_NOT_LINKED', 'Nenhuma fonte jurídica está vinculada à minuta.', 'WARNING');
        if (bundle.sections.length < 2) add('STRUCTURE', 'ATTENTION', 'OUTLINE_TOO_SMALL', 'Confira a estrutura: a minuta possui uma única seção.', 'WARNING');
      }
      if (reviewContextHash(await drafts.reviewContext(context, bundle)) !== run.contextHash) add('FACT_SUPPORT', 'UNAVAILABLE', 'CASE_CONTEXT_CHANGED', 'Os vínculos do caso mudaram durante a conferência. Confira novamente.', 'WARNING');
    } catch { add('STRUCTURE', 'UNAVAILABLE', 'REVIEW_INCOMPLETE', 'Não foi possível concluir a conferência. Tente novamente.', 'WARNING'); }
    const incomplete = checks.some(c => c.state === 'UNAVAILABLE');
    const status = incomplete ? 'INCOMPLETE' : findings.some(f => f.severity === 'BLOCKING') ? 'BLOCKED' : findings.some(f => f.severity === 'WARNING') ? 'WARNINGS' : 'PASSED';
    return runs.finish(context, run.id, { state: incomplete ? 'INCOMPLETE' : 'COMPLETE', status, checks, findings });
  }
}
