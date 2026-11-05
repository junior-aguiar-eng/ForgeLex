import { createHash } from 'node:crypto';
import { mkdirSync, openSync, closeSync, readFileSync, writeSync, fsyncSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const integer = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_AMOUNT');
  return value;
};

// Acquire before preparing snapshots or writing child configs; no stale-lock bypass.
export function acquireRunnerLock(directory) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'runner.lock');
  const fd = openSync(path, 'wx');
  let released = false;
  return () => {
    if (released) return;
    closeSync(fd);
    unlinkSync(path);
    released = true;
  };
}

/** Append-only local evaluation ledger. Caller supplies an isolated directory, never a customer wallet. */
export class EvaluationBudget {
  constructor({ directory, fingerprint, runIds, cap, runCap = 250000, runLimits = {}, now = Date.now }) {
    integer(cap);
    if (!integer(runCap)) throw new Error('INVALID_RUN_CAP');
    for (const [id, limits] of Object.entries(runLimits)) {
      if (!runIds.includes(id) || !limits || typeof limits !== 'object') throw new Error('INVALID_RUN_LIMITS');
      for (const [key, value] of Object.entries(limits)) {
        const ceiling = { runCap, maxCalls: 24, maxDurationMs: 300000 }[key];
        if (!ceiling || !integer(value) || value > ceiling) throw new Error('INVALID_RUN_LIMITS');
      }
    }
    if (!fingerprint || !runIds.length || new Set(runIds).size !== runIds.length) throw new Error('INVALID_CAMPAIGN');
    this.now = now;
    mkdirSync(directory, { recursive: true });
    this.lock = join(directory, 'budget.lock');
    this.lockFd = openSync(this.lock, 'wx'); // No stale-lock bypass: a crashed writer needs operator reconciliation.
    try {
      this.path = join(directory, 'budget.jsonl');
      const identity = {
        fingerprint,
        runIds,
        cap,
        runCap,
        maxCalls: 24,
        maxDurationMs: 300000,
        ...(Object.keys(runLimits).length ? { runLimits } : {}),
      };
      this.state = { identity, runs: {} };
      this.previous = null;
      if (existsSync(this.path)) {
        const text = readFileSync(this.path, 'utf8');
        if (!text.endsWith('\n')) throw new Error('LEDGER_INCOMPLETE');
        for (const line of text.trimEnd().split('\n')) {
          const entry = JSON.parse(line);
          if (
            entry.previous !== this.previous ||
            digest({ previous: entry.previous, state: entry.state }) !== entry.hash
          )
            throw new Error('LEDGER_INTEGRITY');
          this.previous = entry.hash;
          this.state = entry.state;
        }
        if (digest(this.state.identity) !== digest(identity)) throw new Error('FINGERPRINT_MISMATCH');
      }
      this.fd = openSync(this.path, 'a');
      if (!this.previous) this.save();
    } catch (error) {
      this.close();
      throw error;
    }
  }
  save() {
    const value = { previous: this.previous, state: this.state };
    const hash = digest(value);
    const bytes = Buffer.from(JSON.stringify({ ...value, hash }) + '\n');
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(this.fd, bytes, offset, bytes.length - offset);
    fsyncSync(this.fd);
    this.previous = hash;
  }
  summary() {
    const calls = Object.values(this.state.runs).flatMap((run) => Object.values(run.calls));
    return {
      measured: calls.reduce((sum, call) => sum + (call.status === 'SETTLED' ? call.actual : 0), 0),
      exposure: calls.reduce((sum, call) => sum + this.cost(call), 0),
      unresolved: calls.filter((call) => ['RESERVED', 'UNCERTAIN'].includes(call.status)).length,
      calls: calls.length,
    };
  }
  cost(call) {
    return call.status === 'SETTLED' ? call.actual : call.status === 'VOID' ? 0 : call.upper;
  }
  begin(id) {
    if (!this.state.identity.runIds.includes(id)) throw new Error('RUN_NOT_ALLOWED');
    if (this.state.runs[id]) throw new Error('RUN_ALREADY_STARTED');
    if (this.summary().unresolved) throw new Error('UNCERTAIN_COST');
    if (Object.values(this.state.runs).some((run) => run.status === 'active')) throw new Error('RUN_ACTIVE');
    this.state.runs[id] = { status: 'active', startedAt: this.now(), calls: {} };
    this.save();
  }
  assertActive(id) {
    const run = this.state.runs[id];
    if (!run || run.status !== 'active') throw new Error('RUN_NOT_ACTIVE');
    if (
      this.now() - run.startedAt >=
      (this.state.identity.runLimits?.[id]?.maxDurationMs ?? this.state.identity.maxDurationMs)
    )
      throw new Error('RUN_DEADLINE');
    return run;
  }
  reserve(id, callId, upper) {
    integer(upper);
    if (!callId || upper === 0) throw new Error('INVALID_CALL');
    const run = this.assertActive(id);
    if (run.calls[callId]) {
      if (run.calls[callId].upper !== upper) throw new Error('CALL_CONFLICT');
      return false;
    }
    if (this.summary().unresolved) throw new Error('UNCERTAIN_COST');
    if (
      Object.keys(run.calls).length >= (this.state.identity.runLimits?.[id]?.maxCalls ?? this.state.identity.maxCalls)
    )
      throw new Error('CALL_LIMIT');
    if (
      this.summary().exposure + upper > this.state.identity.cap ||
      Object.values(run.calls).reduce((sum, call) => sum + this.cost(call), 0) + upper >
        (this.state.identity.runLimits?.[id]?.runCap ?? this.state.identity.runCap)
    )
      throw new Error('BUDGET_EXCEEDED');
    run.calls[callId] = { status: 'RESERVED', upper, actual: null };
    this.save(); // Durable before the HTTP callback can be invoked.
    return true;
  }
  settle(id, callId, actual, usage) {
    integer(actual);
    const call = this.state.runs[id]?.calls[callId];
    if (!call || call.status !== 'RESERVED') throw new Error('CALL_STATE');
    if (actual > call.upper) throw new Error('COST_OVERRUN');
    Object.assign(call, { status: 'SETTLED', actual, usage });
    this.save();
  }
  uncertain(id, callId) {
    this.transition(id, callId, 'UNCERTAIN');
  }
  void(id, callId) {
    this.transition(id, callId, 'VOID');
  }
  transition(id, callId, status) {
    const call = this.state.runs[id]?.calls[callId];
    if (!call) throw new Error('CALL_STATE');
    if (call.status === 'SETTLED') return; // A later SDK parse failure does not erase measured usage.
    if (call.status !== 'RESERVED' && call.status !== status) throw new Error('CALL_STATE');
    call.status = status;
    this.save();
  }
  finish(id, status, { aborted = false } = {}) {
    if (aborted) status = 'cancelled';
    const run = this.state.runs[id];
    if (!run || run.status !== 'active' || !['completed', 'failed', 'cancelled', 'question'].includes(status))
      throw new Error('RUN_STATE');
    run.status = status;
    this.save();
    return status;
  }
  close() {
    if (this.fd !== undefined) {
      closeSync(this.fd);
      this.fd = undefined;
    }
    if (this.lockFd !== undefined) {
      closeSync(this.lockFd);
      this.lockFd = undefined;
      unlinkSync(this.lock);
    }
  }
}
