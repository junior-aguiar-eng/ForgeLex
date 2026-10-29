import { MATTER_ANALYST_INSTRUCTIONS } from './matter-analyst.js';
import { LEGAL_DRAFTER_INSTRUCTIONS } from './legal-drafter.js';
import { ADVERSARIAL_REVIEWER_INSTRUCTIONS } from './adversarial-reviewer.js';
export { LEGAL_WORK_POLICY } from '../system-policy.js';
export const LEGAL_WORK_INSTRUCTIONS = [
  MATTER_ANALYST_INSTRUCTIONS,
  LEGAL_DRAFTER_INSTRUCTIONS,
  ADVERSARIAL_REVIEWER_INSTRUCTIONS,
] as const;
