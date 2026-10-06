import type { MatterPurgeRepository } from '@forgelex/persistence';
import type { MatterPurgeJournal } from './matter-purge-journal.js';
export class MatterPurgeReconciler {
  constructor(private readonly repository: MatterPurgeRepository, private readonly journal: MatterPurgeJournal) {}
  async runOne(operationId: string): Promise<'completed' | 'pending' | 'aborted'> {
    const events = await this.journal.list();
    const prepared = events.find(event => event.kind === 'PREPARED' && event.intent.operationId === operationId);
    if (!prepared || prepared.kind !== 'PREPARED') throw new Error('MATTER_PURGE_JOURNAL_INTEGRITY');
    const terminal = events.find(event => event.kind !== 'PREPARED' && event.operationId === operationId);
    if (terminal) return terminal.kind === 'COMPLETED' ? 'completed' : 'aborted';
    const outcome = await this.repository.localOutcome(operationId);
    if (outcome === 'committed') {
      await this.repository.verifyResiduals(prepared.intent.target);
      await this.journal.complete(operationId);
      return 'completed';
    }
    if (outcome === 'rolled_back') { await this.journal.abortVerified(operationId); return 'aborted'; }
    return 'pending';
  }
  async runPending(): Promise<{ completed: number; pending: number }> {
    const events = await this.journal.list();
    const terminals = new Set(events.flatMap(event => event.kind === 'PREPARED' ? [] : [event.operationId]));
    const summary = { completed: 0, pending: 0 };
    for (const event of events) {
      if (event.kind !== 'PREPARED' || terminals.has(event.intent.operationId)) continue;
      const result = await this.runOne(event.intent.operationId);
      if (result === 'completed') summary.completed++; else if (result === 'pending') summary.pending++;
    }
    return summary;
  }
}
