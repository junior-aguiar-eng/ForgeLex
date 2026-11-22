import { describe, expect, it } from 'vitest';
import { createSingleFlight } from './single-flight';

const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
};

describe('createSingleFlight', () => {
  it('ignora uma segunda chamada com a mesma chave enquanto a primeira não terminou', async () => {
    const flight = createSingleFlight();
    const hold = gate();
    let runs = 0;
    const first = flight.run('a', async () => {
      runs += 1;
      await hold.promise;
    });
    expect(flight.isActive('a')).toBe(true);
    expect(await flight.run('a', async () => void (runs += 1))).toBe(false);
    hold.open();
    expect(await first).toBe(true);
    expect(runs).toBe(1);
  });

  it('libera a chave quando termina, inclusive com erro, e deixa chaves diferentes andarem juntas', async () => {
    const flight = createSingleFlight();
    await expect(
      flight.run('a', async () => {
        throw new Error('falhou');
      }),
    ).rejects.toThrow('falhou');
    expect(flight.isActive('a')).toBe(false);
    const hold = gate();
    const slow = flight.run('a', () => hold.promise);
    expect(await flight.run('b', async () => undefined)).toBe(true);
    hold.open();
    await slow;
    expect(await flight.run('a', async () => undefined)).toBe(true);
  });
});
