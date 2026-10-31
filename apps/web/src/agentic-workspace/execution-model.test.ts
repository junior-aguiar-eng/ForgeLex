import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  emptyEvents,
  parseEventFrames,
  answerFor,
  sourceLink,
  statusText,
  editorLink,
  streamRetries,
  STABLE_STREAM_MS,
} from './execution-model';

describe('projeção pública do trabalho', () => {
  it('não oferece edição sem permissão atual', () => {
    expect(
      editorLink(
        { id: 'run', matterId: 'm', permissions: { editDraft: false } } as any,
        { draftId: 'd', versionId: 'v', delivery: { document: {} } } as any,
      ),
    ).toBeNull();
  });
  it('abre texto sem caso no editor existente para vinculação explícita antes de salvar', () => {
    expect(
      editorLink(
        { id: 'run', matterId: null } as any,
        { id: 'delivery:run', delivery: { document: { title: 'Minuta' } } } as any,
      ),
    ).toBe('/app/rascunhos?deliveryId=delivery%3Arun&returnExecution=run');
  });
  it('não duplica eventos e ignora eventos de outra execução e dados privados', () => {
    const event = {
      executionId: 'run',
      sequence: 3,
      type: 'DELIVERY',
      payload: { deliveryId: 'd', prompt: 'privado' },
    };
    const once = applyEvent(emptyEvents('run'), event);
    expect(applyEvent(once, event)).toEqual(once);
    expect(applyEvent(once, { ...event, executionId: 'other', sequence: 4 })).toEqual(once);
    expect(once.deliveryIds).toEqual(['d']);
    expect(JSON.stringify(once)).not.toContain('privado');
  });
  it('mantém frames incompletos e decodifica CRLF, comentários e erro SSE', () => {
    const first = parseEventFrames(': connected\r\n\r\nevent: status\r\ndata: {"executionId":"r",');
    expect(first.events).toEqual([]);
    expect(
      parseEventFrames(first.rest + '"sequence":1,"type":"STATUS","payload":{"status":"RUNNING"}}\r\n\r\n').events,
    ).toHaveLength(1);
    expect(parseEventFrames('event: error\ndata: {"code":"ACCESS_REVOKED"}\n\n').error).toBe('ACCESS_REVOKED');
  });
  it('exige envio explícito e preserva texto livre sem pressupor resposta jurídica', () => {
    const q = {
      id: 'q',
      version: 2,
      contextRevision: 3,
      selection: 'single' as const,
      options: [{ id: 'a', label: 'A' }],
      allowFreeText: true,
      allowUnknown: true,
      prompt: 'Finalidade?',
      reason: 'Delimitar',
    };
    expect(answerFor(q, [], '', false)).toBeNull();
    expect(answerFor(q, ['a', 'b'], '', false)).toBeNull();
    expect(answerFor(q, [], 'Resposta fora das opções', false)?.freeText).toBe('Resposta fora das opções');
    expect(answerFor(q, ['a'], 'texto anterior', true)).toEqual({
      questionId: 'q',
      questionVersion: 2,
      contextRevision: 3,
      selectedOptionIds: [],
      unknown: true,
    });
  });
  it('resolve apenas fontes versionadas e URLs https seguras; status não inventa pesquisa', () => {
    expect(sourceLink({ kind: 'DOCUMENT', documentId: 'd', versionId: 'v' }, 'm')).toEqual({
      matterId: 'm',
      documentId: 'd',
      versionId: 'v',
    });
    expect(sourceLink({ kind: 'AUTHORITY', url: 'javascript:alert(1)' }, 'm')).toBeNull();
    expect(sourceLink({ kind: 'AUTHORITY', url: 'https://stj.jus.br/' }, 'm')).toBe('https://stj.jus.br/');
    expect(statusText('RUNNING')).toBe('Processando seu pedido');
    expect(statusText('FAILED', 'BUDGET_EXHAUSTED')).toContain('orçamento');
  });
  it('reconexões de um stream estável não acumulam para o limite de falhas', () => {
    expect(streamRetries(4, 500)).toBe(4);
    expect(streamRetries(4, STABLE_STREAM_MS - 1)).toBe(4);
    expect(streamRetries(4, STABLE_STREAM_MS)).toBe(0);
  });
});
