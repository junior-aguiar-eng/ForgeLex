import { createHash } from 'node:crypto';

const FORBIDDEN_KEY = /(authorization|cookie|token|secret|password|conversation|files|history|documentcontent)/i;
const REDACT_VALUE_KEY = /^(query|fulltext|syllabus|content|text)$/i;

function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12); }
export function redactEvidence(value) {
  if (Array.isArray(value)) return value.map(redactEvidence);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`EVIDENCE_FORBIDDEN_KEY:${key}`);
    if (REDACT_VALUE_KEY.test(key) && typeof item === 'string') result[key] = `[REDACTED:${item.length}:${digest(item)}]`;
    else result[key] = redactEvidence(item);
  }
  return result;
}
