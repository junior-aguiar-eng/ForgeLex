import { describe, expect, it } from 'vitest';
import { isCaseWorkspaceEnabled } from './site-capabilities';

describe('configuração reversível do fluxo de casos', () => {
  it.each([undefined, '', 'false', 'TRUE', '1', ' true '])('mantém casos ocultos com %s', (value) => {
    expect(isCaseWorkspaceEnabled(value)).toBe(false);
  });
  it('habilita casos apenas com true explícito', () => {
    expect(isCaseWorkspaceEnabled('true')).toBe(true);
  });
});
