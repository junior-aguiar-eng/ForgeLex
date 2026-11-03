import { expect, it } from 'vitest';
import { safeAgentFailure, safeAgentFailureDetails } from './agent-failure.js';
it('recognizes a nested budget error without retaining arbitrary messages or SDK details', () => {
  const error = new Error('Bearer private-key; document text', { cause: new Error('BUDGET_EXCEEDED') });
  expect(safeAgentFailure(error)).toEqual({ errorType: 'Error', failureCode: 'BUDGET_EXCEEDED' });
  expect(
    safeAgentFailureDetails({ errorType: 'private-key', failureCode: 'secret document', stack: 'private prompt' }),
  ).toEqual({ errorType: 'OTHER' });
  const cycle: any = { name: 'Unknown', message: 'sensitive' };
  cycle.cause = cycle;
  expect(safeAgentFailure(cycle)).toEqual({ errorType: 'OTHER' });
});
