import type { LifecycleTarget } from '@forgelex/domain';
import type { MatterPurgeJournal, PurgeIntent } from './matter-purge-journal.js';
export interface PurgeRecoveryPort { localOutcome(operationId: string): Promise<'committed' | 'rolled_back' | 'unknown'>; reapply(intent: PurgeIntent): Promise<void>; verifyResiduals(target: LifecycleTarget): Promise<void>; }
export class MatterPurgeRestoreGate {
  private verified = false;
  constructor(private readonly journal: MatterPurgeJournal, private readonly recovery: PurgeRecoveryPort) {}
  isVerified(): boolean { return this.verified; }
  invalidate(): void { this.verified = false; }
  async reapply(): Promise<{ reapplied: number }> {
    await this.journal.assertAnchor();
    const groups = new Map<string, { prepared?: PurgeIntent; terminal?: 'COMPLETED' | 'ABORTED' }>();
    for (const event of await this.journal.list()) {
      const id = event.kind === 'PREPARED' ? event.intent.operationId : event.operationId;
      const group = groups.get(id) ?? {};
      if (event.kind === 'PREPARED') { if (group.prepared) throw new Error('MATTER_PURGE_RESTORE_BLOCKED'); group.prepared = event.intent; }
      else { if (group.terminal) throw new Error('MATTER_PURGE_RESTORE_BLOCKED'); group.terminal = event.kind; }
      groups.set(id, group);
    }
    let reapplied = 0;
    for (const [operationId, group] of groups) {
      if (!group.prepared) throw new Error('MATTER_PURGE_RESTORE_BLOCKED');
      if (!group.terminal) {
        const outcome = await this.recovery.localOutcome(operationId);
        if (outcome === 'committed') {
          await this.recovery.verifyResiduals(group.prepared.target);
          await this.journal.complete(operationId); group.terminal = 'COMPLETED';
        } else if (outcome === 'rolled_back') { await this.journal.abortVerified(operationId); group.terminal = 'ABORTED'; }
        else throw new Error('MATTER_PURGE_RESTORE_BLOCKED');
      }
      if (group.terminal === 'COMPLETED') {
        await this.recovery.reapply(group.prepared);
        await this.recovery.verifyResiduals(group.prepared.target);
        reapplied++;
      }
    }
    return { reapplied };
  }
  async check(): Promise<boolean> {
    if (this.verified) return true;
    try { await this.reapply(); this.verified = true; return true; }
    catch { this.verified = false; return false; }
  }
}
