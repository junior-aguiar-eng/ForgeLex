import { describe, expect, it } from 'vitest';
import { projectClientExecutionEvent, encodeExecutionEvent } from './event-stream.js';
const context = { executionId: 'run', deliveryIds: ['delivery'], documents: [{ documentId: 'doc', versionId: 'v1' }] };
const event = (type: string, payload: Record<string, unknown>) => ({
  executionId: 'run',
  sequence: 2,
  type,
  payload,
  createdAt: '2026-10-25T00:00:00.000Z',
});
describe('projeção pública de eventos', () => {
  it('codifica separadores reais de linha para consumidores SSE do navegador', () => {
    const encoded = encodeExecutionEvent({ ...event('STATUS', { status: 'RUNNING' }), type: 'STATUS' });
    expect(encoded).toContain('\nevent: status\ndata: ');
    expect(encoded.endsWith('\n\n')).toBe(true);
  });
  it('expõe falta de orçamento como motivo público sem mensagem interna', () => {
    expect(
      projectClientExecutionEvent(event('ERROR', { code: 'BUDGET_EXHAUSTED', message: 'private' }), context)?.payload,
    ).toEqual({ code: 'BUDGET_EXHAUSTED' });
  });
  it('elimina prompts, contratos e argumentos sem depender de esconder componentes', () => {
    expect(
      projectClientExecutionEvent(
        event('INTERNAL', { prompt: 'private', arguments: { secret: 'hidden' }, contracts: ['internal'] }),
        context,
      ),
    ).toBeNull();
    const publicEvent = projectClientExecutionEvent(
      event('STATUS', { status: 'RUNNING', prompt: 'private', arguments: { secret: 'hidden' } }),
      context,
    )!;
    expect(publicEvent.payload).toEqual({ status: 'RUNNING' });
    expect(encodeExecutionEvent(publicEvent)).not.toMatch(/private|hidden|prompt|arguments/);
  });
  it('saneia erros e limita entregas/fontes às referências autorizadas', () => {
    expect(
      projectClientExecutionEvent(event('ERROR', { code: 'secret-in-error', message: 'raw prompt' }), context)?.payload,
    ).toEqual({ code: 'EXECUTION_FAILED' });
    expect(
      projectClientExecutionEvent(event('DELIVERY', { deliveryId: 'other', content: 'private' }), context),
    ).toBeNull();
    expect(projectClientExecutionEvent(event('SOURCE', { documentId: 'doc', versionId: 'other' }), context)).toBeNull();
    expect(
      projectClientExecutionEvent(
        event('SOURCE', { documentId: 'doc', versionId: 'v1', arguments: 'private' }),
        context,
      )?.payload,
    ).toEqual({ documentId: 'doc', versionId: 'v1' });
  });
});
