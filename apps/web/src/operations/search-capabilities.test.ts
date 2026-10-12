import { describe, expect, it } from 'vitest';
import { canSearchCourt } from './search-capabilities';
describe('search capability', () => {
  it('uses the server capability for each court rather than an STJ-only frontend type', () => {
    const capabilities = [{ code: 'STJ', searchable: true }, { code: 'STF', searchable: true }, { code: 'TST', searchable: false }];
    expect(canSearchCourt(capabilities, 'STF')).toBe(true);
    expect(canSearchCourt(capabilities, 'TST')).toBe(false);
    expect(canSearchCourt(capabilities, 'UNKNOWN')).toBe(false);
    expect(canSearchCourt([], 'STJ')).toBe(false);
  });
});
