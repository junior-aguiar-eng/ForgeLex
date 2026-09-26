import { ACCOUNT_CLOSURE_RESTORE_PENDING_ATTEMPT_COUNT, type AccountClosureRepository } from '@forgelex/persistence';
import { digestClosureValue } from './account-closure-crypto.js';
import type { AccountClosurePurgeService } from './account-closure-purge-service.js';
import {
  appendAccepted,
  openJournalIds,
  type AccountClosureJournal,
  type JournalEvent,
  type PreparedJournalEvent,
} from './account-closure-journal.js';

export interface RestoreSummary {
  reapplied: number;
  completed: number;
}

export class AccountClosureRestoreGate {
  private verified = false;

  public constructor(
    private readonly options: {
      journal: AccountClosureJournal;
      repository: AccountClosureRepository;
      residualVerifier: Pick<AccountClosurePurgeService, 'verifyResiduals'>;
      reconciler?: {
        runOneForClosure(closureId: string, now?: Date): Promise<'completed' | 'retrying' | 'failed' | 'idle'>;
      };
      subjectHashSecret: string;
      journalEncryptionKeys: Record<string, Buffer>;
      journalAnchorId: string;
    },
  ) {}

  public isVerified(): boolean {
    return this.verified;
  }

  public invalidate(): void {
    this.verified = false;
  }

  private async intents(): Promise<Array<{ prepared: PreparedJournalEvent; terminal: JournalEvent }>> {
    await this.options.journal.assertAnchor(this.options.journalAnchorId);
    const events = await this.options.journal.list();
    const groups = new Map<string, Partial<Record<JournalEvent['kind'], JournalEvent>>>();
    for (const event of events) {
      if (event.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(event.key)) {
        throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
      }
      const group = groups.get(event.key) ?? {};
      if (group[event.kind]) throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
      group[event.kind] = event;
      groups.set(event.key, group);
    }
    const resolved: Array<{ prepared: PreparedJournalEvent; terminal: JournalEvent }> = [];
    for (const group of groups.values()) {
      const prepared = group.PREPARED;
      let terminal = group.ACCEPTED ?? group.ABORTED;
      if (prepared?.kind === 'PREPARED' && !terminal) {
        const local = await this.options.repository.findBySubjectHash(prepared.subjectHash);
        if (
          local &&
          local.id === prepared.closureId &&
          local.statusTokenHash === prepared.statusTokenHash &&
          local.userHash === prepared.userHash &&
          local.tenantHash === prepared.tenantHash &&
          local.idempotencyKeyHash === prepared.idempotencyKeyHash &&
          local.requestFingerprint === prepared.requestFingerprint &&
          local.policyVersion === prepared.policyVersion &&
          local.accessBlockedAt
        ) {
          await appendAccepted(this.options.journal, prepared);
          terminal = await this.options.journal.read(prepared.key, 'ACCEPTED');
        }
      }
      if (
        !prepared ||
        prepared.kind !== 'PREPARED' ||
        !terminal ||
        (group.ACCEPTED && group.ABORTED) ||
        terminal.closureId !== prepared.closureId
      ) {
        throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
      }
      const ids = openJournalIds(this.options.journalEncryptionKeys, prepared.closureId, prepared.sealedIds);
      if (
        digestClosureValue(this.options.subjectHashSecret, ids.subjectId) !== prepared.subjectHash ||
        digestClosureValue(this.options.subjectHashSecret, ids.userId) !== prepared.userHash ||
        digestClosureValue(this.options.subjectHashSecret, ids.tenantId) !== prepared.tenantHash
      ) {
        throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
      }
      resolved.push({ prepared, terminal });
    }
    return resolved;
  }

  public async check(): Promise<boolean> {
    const wasVerified = this.verified;
    const fail = () => {
      this.verified = false;
      return false;
    };
    try {
      const intents = await this.intents();
      for (const { prepared, terminal } of intents) {
        const local = await this.options.repository.findBySubjectHash(prepared.subjectHash);
        if (terminal.kind === 'ABORTED') {
          if (local?.id === prepared.closureId) return fail();
          continue;
        }
        if (
          !local ||
          local.id !== prepared.closureId ||
          local.statusTokenHash !== prepared.statusTokenHash ||
          local.userHash !== prepared.userHash ||
          local.tenantHash !== prepared.tenantHash ||
          local.idempotencyKeyHash !== prepared.idempotencyKeyHash ||
          local.requestFingerprint !== prepared.requestFingerprint ||
          local.policyVersion !== prepared.policyVersion ||
          !local.accessBlockedAt ||
          (local.attemptCount === ACCOUNT_CLOSURE_RESTORE_PENDING_ATTEMPT_COUNT && local.status !== 'COMPLETED')
        )
          return fail();
        const ids = openJournalIds(this.options.journalEncryptionKeys, prepared.closureId, prepared.sealedIds);
        if (local.status === 'COMPLETED') {
          const steps = await this.options.repository.listSteps(prepared.closureId);
          if (steps.length !== 5 || steps.some((step) => step.status !== 'COMPLETED')) return fail();
          if (local.subjectId || local.userId || local.tenantId) return fail();
          await this.options.repository.assertCompletedIdentityRemoved({
            userId: ids.userId,
            tenantId: ids.tenantId,
          });
          await this.options.residualVerifier.verifyResiduals({
            closureId: prepared.closureId,
            tenantId: ids.tenantId,
            userId: ids.userId,
            tenantPseudonym: `tenant_closed_${prepared.tenantHash.slice(0, 24)}`,
          });
        } else {
          await this.options.repository.assertPendingAccessBlocked({ userId: ids.userId, tenantId: ids.tenantId });
        }
      }
      this.verified = true;
      return true;
    } catch (error) {
      // A transient journal outage cannot re-open a restore, but must not take down an already
      // verified, continuous database or the receipt/worker for previously accepted closures.
      if (wasVerified && error instanceof Error && error.message === 'ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE') {
        return true;
      }
      return fail();
    }
  }

  public async replay(): Promise<RestoreSummary> {
    this.verified = false;
    const intents = await this.intents();
    let reapplied = 0;
    let completed = 0;
    for (const { prepared, terminal } of intents) {
      const local = await this.options.repository.findBySubjectHash(prepared.subjectHash);
      if (terminal.kind === 'ABORTED') {
        if (local?.id === prepared.closureId) throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
        continue;
      }
      if (
        local &&
        (local.id !== prepared.closureId ||
          local.statusTokenHash !== prepared.statusTokenHash ||
          local.userHash !== prepared.userHash ||
          local.tenantHash !== prepared.tenantHash ||
          local.idempotencyKeyHash !== prepared.idempotencyKeyHash ||
          local.requestFingerprint !== prepared.requestFingerprint ||
          local.policyVersion !== prepared.policyVersion)
      ) {
        throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
      }
      if (!local) {
        const ids = openJournalIds(this.options.journalEncryptionKeys, prepared.closureId, prepared.sealedIds);
        await this.options.repository.restoreAccepted({
          id: prepared.closureId,
          ...ids,
          subjectHash: prepared.subjectHash,
          userHash: prepared.userHash,
          tenantHash: prepared.tenantHash,
          statusTokenHash: prepared.statusTokenHash,
          idempotencyKeyHash: prepared.idempotencyKeyHash,
          requestFingerprint: prepared.requestFingerprint,
          policyVersion: prepared.policyVersion,
          requestedAt: prepared.requestedAt,
        });
        reapplied += 1;
      }
      let closure = await this.options.repository.findById(prepared.closureId);
      if (!closure) throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
      if (closure.status !== 'COMPLETED') {
        if (!this.options.reconciler) throw new Error('ACCOUNT_CLOSURE_RESTORE_HANDLER_UNAVAILABLE');
        // At most five freshly restored steps; retries require a separate, audited run.
        for (let step = 0; step < 5 && closure.status !== 'COMPLETED'; step += 1) {
          const result = await this.options.reconciler.runOneForClosure(prepared.closureId);
          if (result !== 'completed') throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
          closure = await this.options.repository.findById(prepared.closureId);
          if (!closure) throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
        }
        if (closure.status !== 'COMPLETED') throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
        completed += 1;
      }
    }
    if (!(await this.check())) throw new Error('ACCOUNT_CLOSURE_RESTORE_BLOCKED');
    return { reapplied, completed };
  }
}
