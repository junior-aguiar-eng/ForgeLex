import { describe, expect, it } from 'vitest';
import { applyEvent, emptyEvents } from './execution-model';
import { workStages } from './work-stages';

const input = (over: Partial<Parameters<typeof workStages>[0]> = {}) => ({
  status: '',
  sources: 0,
  deliveries: 0,
  error: '',
  ...over,
});
const byId = (stages: ReturnType<typeof workStages>, id: string) => stages.find((stage) => stage.id === id);

describe('etapas do trabalho', () => {
  it('sem status ainda não mostra etapa nenhuma', () => {
    expect(workStages(input())).toEqual([]);
  });

  it('na fila: pedido recebido concluído e o trabalho ainda por começar', () => {
    const stages = workStages(input({ status: 'QUEUED' }));
    expect(byId(stages, 'received')?.state).toBe('done');
    expect(byId(stages, 'working')?.state).toBe('pending');
    expect(byId(stages, 'delivery')?.state).toBe('pending');
    expect(byId(stages, 'question')).toBeUndefined();
    expect(byId(stages, 'reading')).toBeUndefined();
  });

  it('em andamento: o trabalho é a etapa atual', () => {
    const stages = workStages(input({ status: 'RUNNING' }));
    expect(byId(stages, 'working')?.state).toBe('current');
  });

  it('documentos lidos aparecem como etapa própria, com a contagem sem inventar detalhe', () => {
    const one = byId(workStages(input({ status: 'RUNNING', sources: 1 })), 'reading');
    expect(one).toMatchObject({ state: 'done', detail: '1 documento lido' });
    const many = byId(workStages(input({ status: 'RUNNING', sources: 3 })), 'reading');
    expect(many?.detail).toBe('3 documentos lidos');
  });

  it('esperando o usuário: a pergunta é a etapa atual e o trabalho fica pausado', () => {
    const stages = workStages(input({ status: 'WAITING_USER' }));
    expect(byId(stages, 'question')).toMatchObject({ state: 'waiting', label: 'Esperando a sua resposta' });
    expect(byId(stages, 'working')?.state).toBe('paused');
  });

  it('concluído: tudo feito e a entrega pronta, com a contagem', () => {
    const stages = workStages(input({ status: 'COMPLETED', deliveries: 1 }));
    expect(stages.every((stage) => stage.state === 'done')).toBe(true);
    expect(byId(stages, 'delivery')?.detail).toBe('1 entrega preliminar');
    expect(byId(workStages(input({ status: 'COMPLETED', deliveries: 2 })), 'delivery')?.detail).toBe(
      '2 entregas preliminares',
    );
  });

  it('falha: o erro aparece na etapa de trabalho, com o texto do erro, e a entrega não conta como pronta', () => {
    const stages = workStages(input({ status: 'FAILED', error: 'EXECUTION_FAILED' }));
    expect(byId(stages, 'working')).toMatchObject({ state: 'error' });
    expect(byId(stages, 'working')?.detail).toMatch(/Não foi possível concluir/);
    expect(byId(stages, 'delivery')?.state).toBe('pending');
  });

  it('um erro de evento aparece mesmo com o status ainda em andamento', () => {
    const stages = workStages(input({ status: 'RUNNING', error: 'BUDGET_EXHAUSTED' }));
    expect(byId(stages, 'working')?.state).toBe('error');
    expect(byId(stages, 'working')?.detail).toMatch(/orçamento/);
  });

  it('interrompido: sinaliza a etapa de trabalho como interrompida', () => {
    const stages = workStages(input({ status: 'CANCELLED' }));
    expect(byId(stages, 'working')).toMatchObject({ state: 'error', detail: 'Processamento interrompido' });
  });

  it('entrega que chega antes do status final já conta como entrega', () => {
    expect(byId(workStages(input({ status: 'RUNNING', deliveries: 1 })), 'delivery')?.state).toBe('done');
  });

  it('o estado dos eventos conta documentos lidos sem repetir e sem guardar identificadores no texto', () => {
    let state = emptyEvents('run');
    const event = (sequence: number, type: string, payload: Record<string, unknown>) => ({
      executionId: 'run',
      sequence,
      type,
      payload,
    });
    state = applyEvent(state, event(1, 'SOURCE', { documentId: 'd1', versionId: 'v1' }));
    state = applyEvent(state, event(2, 'SOURCE', { documentId: 'd1', versionId: 'v1' }));
    state = applyEvent(state, event(3, 'SOURCE', { documentId: 'd2', versionId: 'v1' }));
    expect(state.sources).toBe(2);
    expect(applyEvent(state, event(4, 'SOURCE', { documentId: 5 })).sources).toBe(2);
  });
});
