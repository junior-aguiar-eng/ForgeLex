import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TaskSourceSchema, type TaskSource } from './agentic-case-task.js';

// These protocols share the same evidence representation. The rest of each
// checkpoint belongs to the workflow reader and is intentionally not parsed here.
const version = z.literal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const versionEnvelope = z.object({ caseTask: z.object({ version }) });
const evidenceEnvelope = z.object({
  caseTask: z.object({ version, evidence: z.array(TaskSourceSchema).max(100) }),
});

export function readCaseTaskCheckpointVersion(raw: unknown) {
  return versionEnvelope.safeParse(raw).data?.caseTask.version;
}

export function readCheckpointEvidence(raw: unknown): readonly TaskSource[] {
  const parsed = evidenceEnvelope.safeParse(raw);
  if (!parsed.success) throw new Error('EDITORIAL_SOURCE_UNAVAILABLE');
  const { evidence } = parsed.data.caseTask;
  if (
    new Set(evidence.map((source) => source.id)).size !== evidence.length ||
    evidence.some(
      (source) =>
        /[\uD800-\uDFFF]/u.test(source.text) ||
        createHash('sha256').update(source.text, 'utf8').digest('hex') !== source.contentHash,
    )
  )
    throw new Error('EDITORIAL_SOURCE_UNAVAILABLE');
  return evidence;
}
