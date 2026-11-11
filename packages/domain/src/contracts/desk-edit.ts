import { createHash } from 'node:crypto';
import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const utf16 = z
  .string()
  .max(16000)
  .refine((text) => !/[\uD800-\uDFFF]/u.test(text), 'DESK_EDIT_UNICODE_INVALID');
const range = z.strictObject({
  sectionId: z.guid(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});
export const DeskEditSelectionSchema = range.extend({ versionId: z.guid(), before: utf16.min(1) });
const target = z.strictObject({ draftId: z.guid(), versionId: z.guid(), documentHash: digest });
const anchor = range.extend({ sectionHash: digest });
const change = anchor.extend({ id: z.string().min(1).max(80), before: utf16.min(1), after: utf16 });
export const DeskEditProposalSchema = z.strictObject({ target, changes: z.array(change).min(1).max(30) });
export const DeskEditSnapshotSchema = z.strictObject({
  target,
  title: z.string().min(1),
  sections: z.array(z.strictObject({ id: z.guid(), title: z.string().min(1), content: z.string() })),
  scope: anchor.extend({ before: utf16.min(1) }),
});

export type DeskEditSelection = z.infer<typeof DeskEditSelectionSchema>;
export type DeskEditProposal = z.infer<typeof DeskEditProposalSchema>;
export type DeskEditSnapshot = z.infer<typeof DeskEditSnapshotSchema>;
const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function checkRange(text: string, start: number, end: number, before: string) {
  if (end <= start || end > text.length || text.slice(start, end) !== before)
    throw new Error('DESK_EDIT_ANCHOR_INVALID');
  // A valid, nonempty before cannot split a surrogate pair at either boundary.
  if (/[\uD800-\uDFFF]/u.test(text)) throw new Error('DESK_EDIT_UNICODE_INVALID');
}

export function validateDeskEditSelection(sections: DeskEditSnapshot['sections'], raw: DeskEditSelection) {
  const selection = DeskEditSelectionSchema.parse(raw);
  const section = sections.find(({ id }) => id === selection.sectionId);
  if (!section) throw new Error('DESK_EDIT_ANCHOR_INVALID');
  checkRange(section.content, selection.start, selection.end, selection.before);
  return section;
}

export function createDeskEditSnapshot(
  base: Omit<DeskEditSnapshot, 'target' | 'scope'> & { draftId: string; versionId: string; versionHash: string },
  rawSelection: DeskEditSelection,
): DeskEditSnapshot {
  const { versionId, sectionId, start, end, before } = DeskEditSelectionSchema.parse(rawSelection);
  if (versionId !== base.versionId) throw new Error('DESK_EDIT_TARGET_INVALID');
  const section = validateDeskEditSelection(base.sections, rawSelection);
  return {
    target: { draftId: base.draftId, versionId, documentHash: hash(JSON.stringify(base)) },
    title: base.title,
    sections: base.sections,
    scope: { sectionId, start, end, before, sectionHash: hash(section.content) },
  };
}

export function applyDeskEdit(snapshot: DeskEditSnapshot, raw: DeskEditProposal): DeskEditSnapshot['sections'] {
  const { target: proposed, changes } = DeskEditProposalSchema.parse(raw);
  const { target: base, scope } = snapshot;
  if (
    proposed.draftId !== base.draftId ||
    proposed.versionId !== base.versionId ||
    proposed.documentHash !== base.documentHash
  )
    throw new Error('DESK_EDIT_TARGET_INVALID');
  const section = snapshot.sections.find(({ id }) => id === scope.sectionId);
  if (!section || hash(section.content) !== scope.sectionHash) throw new Error('DESK_EDIT_ANCHOR_INVALID');
  checkRange(section.content, scope.start, scope.end, scope.before);
  const ids = new Set<string>();
  let nextStart = scope.end;
  let content = section.content;
  for (const patch of [...changes].sort((a, b) => b.start - a.start)) {
    if (patch.sectionId !== scope.sectionId || patch.start < scope.start || patch.end > scope.end)
      throw new Error('DESK_EDIT_OUT_OF_SCOPE');
    if (patch.sectionHash !== scope.sectionHash) throw new Error('DESK_EDIT_ANCHOR_INVALID');
    if (ids.has(patch.id) || patch.end > nextStart || patch.before === patch.after)
      throw new Error('DESK_EDIT_PATCH_INVALID');
    checkRange(section.content, patch.start, patch.end, patch.before);
    ids.add(patch.id);
    nextStart = patch.start;
    content = content.slice(0, patch.start) + patch.after + content.slice(patch.end);
  }
  if (content === section.content) throw new Error('DESK_EDIT_PATCH_INVALID');
  return snapshot.sections.map((item) => (item.id === section.id ? { ...item, content } : item));
}
