import type { LifecycleActor, LifecycleTarget, PurgeCommand, LifecycleResult } from '@forgelex/domain';
import { PurgeCommandSchema } from '@forgelex/domain';
import { createHmac, randomUUID } from 'node:crypto';
import type { MatterPurgeRepository } from '@forgelex/persistence';
import type { MatterPurgeJournal } from './matter-purge-journal.js';
import { MatterPurgeReconciler } from './matter-purge-reconciler.js';
export class MatterPurgeService {
  constructor(private readonly repository: MatterPurgeRepository, private readonly journal: MatterPurgeJournal, private readonly secret: string) {
    if (Buffer.byteLength(secret) < 32) throw new Error('MATTER_PURGE_JOURNAL_CONFIG_INVALID');
  }
  async status(tenantId: string, actor: LifecycleActor, operationId: string): Promise<{ status: 'completed' | 'aborted' | 'pending' }> {
    const prepared = (await this.journal.list()).find(event => event.kind === 'PREPARED' && event.intent.operationId === operationId);
    if (!prepared || prepared.kind !== 'PREPARED' || prepared.intent.target.tenantId !== tenantId) throw new Error('MATTER_NOT_FOUND');
    await this.repository.assertCanManage(prepared.intent.target, actor);
    return { status: await new MatterPurgeReconciler(this.repository, this.journal).runOne(operationId) };
  }
  async execute(target: LifecycleTarget, actor: LifecycleActor, command: PurgeCommand): Promise<LifecycleResult> {
    PurgeCommandSchema.parse(command);
    await this.repository.assertCanManage(target, actor);
    const fingerprint = createHmac('sha256', this.secret).update('forgelex-matter-purge-command\0').update(JSON.stringify([target.tenantId, target.matterId, target.documentId ?? null, command.expectedLifecycleRevision, command.confirmation])).digest('hex');
    const previous = await this.repository.findCommitted(target, actor, command.expectedLifecycleRevision, fingerprint);
    if (previous) {
      try {
        const events = await this.journal.list();
        const terminal = events.find(event => event.kind !== 'PREPARED' && event.operationId === previous.operationId);
        if (terminal?.kind === 'COMPLETED') throw new Error('LIFECYCLE_CONFLICT');
        if (terminal?.kind === 'ABORTED') throw new Error('MATTER_PURGE_JOURNAL_INTEGRITY');
        await this.repository.verifyResiduals(target);
        await this.journal.complete(previous.operationId);
        return previous.result;
      } catch (error) {
        if (error instanceof Error && error.message === 'LIFECYCLE_CONFLICT') throw error;
        throw Object.assign(new Error('PURGE_CONFIRMATION_PENDING'), { operationId: previous.operationId });
      }
    }
    const operationId = createHmac('sha256', this.secret).update('forgelex-matter-purge-operation\0').update(randomUUID()).digest('hex');
    const intent = { operationId, target: { tenantId: target.tenantId, matterId: target.matterId, ...(target.documentId ? { documentId: target.documentId } : {}) }, expectedLifecycleRevision: command.expectedLifecycleRevision, fingerprint, preparedAt: new Date().toISOString() };
    await this.journal.prepare(intent);
    let result: LifecycleResult;
    try { result = await this.repository.purge(target, actor, command, intent); }
    catch (error) {
      if ((error as { rollbackVerified?: boolean }).rollbackVerified) {
        try { await this.journal.abortVerified(operationId); } catch { throw Object.assign(new Error('PURGE_CONFIRMATION_PENDING'), { operationId }); }
        throw error;
      }
      throw Object.assign(new Error('PURGE_CONFIRMATION_PENDING'), { operationId });
    }
    try { await this.repository.verifyResiduals(target); await this.journal.complete(operationId); }
    catch { throw Object.assign(new Error('PURGE_CONFIRMATION_PENDING'), { operationId }); }
    return result;
  }
}
