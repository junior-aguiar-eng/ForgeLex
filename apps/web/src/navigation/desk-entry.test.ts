import { describe, expect, it } from 'vitest';
import { consumeDeskEntry, requestDeskEntry } from './desk-entry';

describe('pedido de entrada na Mesa', () => {
  it('é consumido uma vez só', () => {
    expect(consumeDeskEntry()).toBe(false);
    requestDeskEntry();
    expect(consumeDeskEntry()).toBe(true);
    expect(consumeDeskEntry()).toBe(false);
  });
});
