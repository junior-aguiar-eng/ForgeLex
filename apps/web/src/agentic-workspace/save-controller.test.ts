import { describe, expect, it } from 'vitest';
import type { Attachment } from './attachments';
import { createSaveController, type SaveState, type Saver } from './save-controller';

const attachment = (patch: Partial<Attachment> = {}): Attachment => ({
  id: 'a1',
  name: 'relato.txt',
  status: 'done',
  text: 'Primeira linha.\nSegunda linha.',
  ...patch,
});

function setup(saver: Saver) {
  const states = new Map<string, SaveState | undefined>();
  const controller = createSaveController(saver, (key, state) => void states.set(key, state));
  return { controller, states };
}

describe('createSaveController', () => {
  it('dois cliques seguidos, antes de qualquer resposta, gravam um só documento', async () => {
    const calls: unknown[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { controller, states } = setup(async (matterId, input) => {
      calls.push([matterId, input]);
      await held;
      return { title: input.title, paragraphs: 2 };
    });
    const first = controller.save(attachment(), 'm1');
    const second = controller.save(attachment(), 'm1');
    expect(states.get('m1:a1')).toEqual({ status: 'saving' });
    release();
    await Promise.all([first, second]);
    expect(calls).toHaveLength(1);
    expect(states.get('m1:a1')).toEqual({ status: 'saved', title: 'relato', paragraphs: 2 });
  });

  it('um anexo já salvo não é salvo de novo, mas outro caso é outro destino', async () => {
    let calls = 0;
    const { controller } = setup(async (_matter, input) => {
      calls += 1;
      return { title: input.title, paragraphs: 1 };
    });
    await controller.save(attachment(), 'm1');
    await controller.save(attachment(), 'm1');
    expect(calls).toBe(1);
    await controller.save(attachment(), 'm2');
    expect(calls).toBe(2);
  });

  it('a recusa vira texto pelo código, não grava como salvo e a nova tentativa funciona', async () => {
    let attempt = 0;
    const { controller, states } = setup(async (_matter, input) => {
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error('x'), { code: 'DOCUMENT_ANCHOR_LIMIT_EXCEEDED' });
      return { title: input.title, paragraphs: 2 };
    });
    await controller.save(attachment(), 'm1');
    const failed = states.get('m1:a1');
    expect(failed?.status).toBe('error');
    expect(failed && 'message' in failed ? failed.message : '').toContain('5.000 linhas');
    await controller.save(attachment(), 'm1');
    expect(states.get('m1:a1')?.status).toBe('saved');
    expect(attempt).toBe(2);
  });

  it('erro sem código usa a mensagem da própria falha', async () => {
    const { controller, states } = setup(async () => {
      throw new Error('Sem conexão.');
    });
    await controller.save(attachment(), 'm1');
    expect(states.get('m1:a1')).toEqual({ status: 'error', message: 'Sem conexão.' });
  });

  it('trocar ou remover o anexo apaga o estado em todos os casos e permite salvar de novo', async () => {
    let calls = 0;
    const { controller, states } = setup(async (_matter, input) => {
      calls += 1;
      return { title: input.title, paragraphs: 1 };
    });
    await controller.save(attachment(), 'm1');
    await controller.save(attachment(), 'm2');
    controller.forget('a1');
    expect(states.get('m1:a1')).toBeUndefined();
    expect(states.get('m2:a1')).toBeUndefined();
    await controller.save(attachment({ text: 'Texto novo.' }), 'm1');
    expect(calls).toBe(3);
  });

  it('anexo que não está pronto ou sem texto não chama a rota', async () => {
    let calls = 0;
    const { controller } = setup(async (_matter, input) => {
      calls += 1;
      return { title: input.title, paragraphs: 1 };
    });
    await controller.save(attachment({ status: 'reading', text: '' }), 'm1');
    await controller.save(attachment({ text: '   ' }), 'm1');
    expect(calls).toBe(0);
  });
});
