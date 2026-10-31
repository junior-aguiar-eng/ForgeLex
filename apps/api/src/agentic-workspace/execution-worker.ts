import { randomUUID } from 'node:crypto';
import type { WorkerLease } from './execution-store.js';
import { ExecutionService, type StepOutcome } from './execution-service.js';
import { reportAgenticFailure } from './failure-log.js';

export interface ExecutionDriver {
  /** Planning is deterministic; paid/uncertain operations belong in the journaled run callback. */
  next(context: Awaited<ReturnType<ExecutionService['driverContext']>>):
    | {
        callId: string;
        run: (
          context: Awaited<ReturnType<ExecutionService['driverContext']>> & { signal: AbortSignal },
        ) => Promise<StepOutcome>;
      }
    | undefined;
}
export class ExecutionWorker {
  private active?: { lease: WorkerLease; controller: AbortController };
  private stopped = false;
  constructor(
    private readonly service: ExecutionService,
    private readonly driver?: ExecutionDriver,
    private readonly options: { id?: string; leaseMs?: number; maxSteps?: number; maxDurationMs?: number } = {},
  ) {}
  async runOnce() {
    if (this.active || this.stopped) return false;
    const leaseMs = this.options.leaseMs ?? 60000;
    const lease = await this.service.claimNext(this.options.id ?? randomUUID(), leaseMs);
    if (!lease) return false;
    const controller = new AbortController();
    const deadline = this.options.maxDurationMs
      ? setTimeout(() => controller.abort(), this.options.maxDurationMs)
      : undefined;
    deadline?.unref();
    this.active = { lease, controller };
    const timer = setInterval(
      () => {
        void this.service.renewLease(lease, leaseMs).catch(() => controller.abort());
      },
      Math.max(10, Math.floor(leaseMs / 3)),
    );
    timer.unref();
    try {
      if (!this.driver) {
        await this.service.failLease(lease, 'EXECUTOR_UNAVAILABLE');
        return true;
      }
      for (let i = 0; i < (this.options.maxSteps ?? 100); i++) {
        if (controller.signal.aborted || this.stopped) {
          if (!this.stopped) await this.service.failLease(lease, 'EXECUTION_FAILED');
          return true;
        }
        const context = await this.service.driverContext(lease),
          step = this.driver.next(context);
        if (!step) {
          await this.service.finishStep(lease, null, {
            kind: 'completed',
            checkpoint: context.execution.checkpoint ?? {},
          });
          return true;
        }
        await this.service.beginStep(lease, step.callId);
        const result = await step.run({ ...context, signal: controller.signal });
        if (controller.signal.aborted) {
          await this.service.failLease(lease, 'EXECUTION_FAILED');
          return true;
        }
        await this.service.finishStep(lease, step.callId, result);
        if (result.kind !== 'checkpoint') return true;
      }
      await this.service.failLease(lease, 'EXECUTION_FAILED');
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      const code =
        reason === 'ACCESS_REVOKED'
          ? 'ACCESS_REVOKED'
          : /^(BUDGET_NOT_FOUND|BUDGET_NOT_ACTIVE|BUDGET_EXCEEDED|BILLING_INSUFFICIENT_BALANCE|EXECUTION_NOT_AUTHORIZED)$/.test(
                reason,
              )
            ? 'BUDGET_EXHAUSTED'
            : 'EXECUTION_FAILED';
      if (reason !== 'SESSION_CANCELLED')
        reportAgenticFailure('agentic.execution.failed', error, {
          tenantId: lease.owner.tenantId,
          executionId: lease.executionId,
          failureCode: code,
        });
      await this.service.failLease(lease, code).catch(() => undefined);
    } finally {
      clearInterval(timer);
      if (deadline) clearTimeout(deadline);
      this.active = undefined;
    }
    return true;
  }
  async stop() {
    this.stopped = true;
    if (this.active) {
      this.active.controller.abort();
      await this.service.failLease(this.active.lease).catch(() => undefined);
    }
  }
  cancel(executionId: string) {
    if (this.active?.lease.executionId === executionId) this.active.controller.abort();
  }
}
