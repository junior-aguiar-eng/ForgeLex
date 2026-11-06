import { editorialArithmeticFindings } from './editorial-arithmetic.js';
import { createHash } from 'node:crypto';
import type { AgenticOwner } from '@forgelex/domain';
import { TaskDocumentSchema } from '@forgelex/domain';
import type { NativeCaseTaskRepository } from '@forgelex/persistence';
import { FinalEditorialContextSchema, validateFinalEditorialProposal } from '@forgelex/legal-agents';

type Target = { draftId: string; versionId: string };
/** Explicit local operations; no agent execution, model, approval or patch application. */
export class FinalEditorService {
  constructor(private readonly native: Pick<NativeCaseTaskRepository, 'loadEditorialSnapshot'>) {}

  async load(owner: AgenticOwner, deliveryId: string, target: Target) {
    const saved = await this.native.loadEditorialSnapshot(owner, deliveryId, target);
    return editorialContextFromSnapshot(saved);
  }

  async validate(owner: AgenticOwner, deliveryId: string, target: Target, proposal: unknown) {
    return validateFinalEditorialProposal(await this.load(owner, deliveryId, target), proposal);
  }
}

export function editorialContextFromSnapshot(
  saved: Awaited<ReturnType<NativeCaseTaskRepository['loadEditorialSnapshot']>>,
) {
  const delivery = saved.delivery;
  // Missing historic audits are not silently reconstructed or treated as a clean review.
  if (!delivery.supportAudit) throw new Error('EDITORIAL_AUDIT_UNAVAILABLE');
  // Desk snapshots contain user text, not an inherited legal audit. Local checks are
  // recomputed from the saved version and remain visible even if the model omits them.
  const arithmetic =
    saved.origin === 'DESK_VERSION' && delivery.document ? editorialArithmeticFindings(delivery.document) : [];
  if (delivery.findings.length + arithmetic.length > 200) throw new Error('EDITORIAL_CONTEXT_LIMIT');
  return FinalEditorialContextSchema.parse({
    contractVersion: '1.0.0',
    ...(saved.origin ? { origin: saved.origin } : {}),
    contextId: delivery.contextId,
    contextRevision: delivery.contextRevision,
    deliveryId: saved.id,
    draftId: saved.draftId,
    versionId: saved.versionId,
    documentHash: createHash('sha256')
      .update(JSON.stringify(TaskDocumentSchema.parse(delivery.document)))
      .digest('hex'),
    document: delivery.document,
    claims: delivery.claims,
    requirements: delivery.requirements,
    findings: [...delivery.findings, ...arithmetic],
    supportAudit: delivery.supportAudit,
    sources: saved.sources,
  });
}
