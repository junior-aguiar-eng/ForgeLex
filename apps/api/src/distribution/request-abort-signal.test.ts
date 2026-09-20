import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createRequestAbortSignal } from './request-abort-signal.js';

describe('createRequestAbortSignal', () => {
  it('cancela a tool quando a conexão HTTP é abortada antes da resposta', () => {
    const raw = new EventEmitter() as EventEmitter & { aborted?: boolean };
    const lifecycle = createRequestAbortSignal(raw);

    raw.emit('aborted');

    expect(lifecycle.signal.aborted).toBe(true);
    lifecycle.dispose();
  });

  it('inicia cancelado quando a conexão já foi abortada', () => {
    const raw = new EventEmitter() as EventEmitter & { aborted?: boolean };
    raw.aborted = true;

    const lifecycle = createRequestAbortSignal(raw);

    expect(lifecycle.signal.aborted).toBe(true);
    lifecycle.dispose();
  });
});
