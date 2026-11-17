import { describe, expect, it } from 'vitest';
import { routeForTab } from '../navigation/routes';
import { firstSteps } from './first-steps';

describe('firstSteps', () => {
  it('com a Mesa são quatro passos, na ordem; sem a Mesa, três', () => {
    expect(firstSteps({ deskEnabled: true }).map((step) => step.id)).toEqual([
      'connect',
      'desk',
      'research',
      'progress',
    ]);
    expect(firstSteps({ deskEnabled: false }).map((step) => step.id)).toEqual(['connect', 'research', 'progress']);
  });

  it('cada passo leva a uma tela que existe e nenhum leva a ferramenta removida', () => {
    for (const step of firstSteps({ deskEnabled: true })) {
      expect(() => routeForTab(step.tab, 'gelo'), step.id).not.toThrow();
      expect(['draft_studio', 'dashboard']).not.toContain(step.tab);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.action.length).toBeGreaterThan(0);
    }
  });
});
