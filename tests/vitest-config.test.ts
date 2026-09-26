import { describe, expect, it } from 'vitest';
import config from '../vitest.config.js';

describe('Vitest configuration', () => {
  it('limits concurrent workers for local runs and CI', () => {
    expect(config.test?.maxWorkers).toBe(2);
  });
});
