import { describe, expect, it } from 'vitest';
import { firstStepsKey, readFirstStepsHidden, writeFirstStepsHidden } from './first-steps-storage';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => void (data[key] = value),
    removeItem: (key: string) => void delete data[key],
  };
}
const broken = {
  getItem(): string | null {
    throw new Error('bloqueado');
  },
  setItem(): void {
    throw new Error('bloqueado');
  },
  removeItem(): void {
    throw new Error('bloqueado');
  },
};

describe('"Primeiros passos" ocultável, por usuário', () => {
  it('a chave leva o usuário, para duas contas no mesmo navegador não se misturarem', () => {
    expect(firstStepsKey('u1')).not.toBe(firstStepsKey('u2'));
    expect(firstStepsKey('u1')).toContain('u1');
  });

  it('por padrão o cartão aparece; ocultar vale para aquele usuário e mostrar desfaz', () => {
    const storage = memory();
    expect(readFirstStepsHidden(storage, 'u1')).toBe(false);
    writeFirstStepsHidden(storage, 'u1', true);
    expect(readFirstStepsHidden(storage, 'u1')).toBe(true);
    expect(readFirstStepsHidden(storage, 'u2')).toBe(false);
    writeFirstStepsHidden(storage, 'u1', false);
    expect(readFirstStepsHidden(storage, 'u1')).toBe(false);
    expect(storage.data).toEqual({});
  });

  it('um valor desconhecido guardado não oculta o cartão', () => {
    expect(readFirstStepsHidden(memory({ [firstStepsKey('u1')]: 'talvez' }), 'u1')).toBe(false);
  });

  it('sem armazenamento (bloqueado ou ausente) o cartão aparece e nada quebra', () => {
    expect(readFirstStepsHidden(broken, 'u1')).toBe(false);
    expect(() => writeFirstStepsHidden(broken, 'u1', true)).not.toThrow();
    expect(readFirstStepsHidden(undefined, 'u1')).toBe(false);
    expect(() => writeFirstStepsHidden(undefined, 'u1', true)).not.toThrow();
  });

  it('sem usuário identificado não se guarda nada', () => {
    const storage = memory();
    writeFirstStepsHidden(storage, '', true);
    expect(storage.data).toEqual({});
    expect(readFirstStepsHidden(storage, '')).toBe(false);
  });
});
