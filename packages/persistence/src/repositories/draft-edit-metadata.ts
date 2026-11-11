import type { DeskEditProposal } from '@forgelex/domain';
import type { CitationAnchorInput, DraftSectionInput, DraftVersionBundle } from './draft-repository.js';

export function inheritDraftEditMetadata(
  base: DraftVersionBundle,
  sections: DraftSectionInput[],
  referenceOrdinals: ReadonlySet<number>,
  edit?: DeskEditProposal,
): CitationAnchorInput[] {
  const citations: CitationAnchorInput[] = [];
  for (const original of base.sections) {
    const anchors = base.citations.filter((citation) => citation.sectionId === original.id);
    const hasLinks = [
      original.linkedFactIds,
      original.linkedEvidenceIds,
      original.linkedAuthorityIds,
      original.linkedThesisIds,
    ].some((links) => links.length > 0);
    const matches = sections.filter((section) =>
      edit
        ? section.ordinal === original.ordinal
        : section.title === original.title && section.content === original.content,
    );
    const uniqueOriginal =
      edit ||
      base.sections.filter((section) => section.title === original.title && section.content === original.content)
        .length === 1;
    if (matches.length !== 1 || !uniqueOriginal) {
      if (hasLinks || anchors.length || referenceOrdinals.has(original.ordinal))
        throw new Error('DRAFT_EDIT_METADATA_CONFLICT');
      continue;
    }
    const [section] = matches;
    // Historical document references are inherited through the parent at the same ordinal.
    if (referenceOrdinals.has(original.ordinal) && section.ordinal !== original.ordinal)
      throw new Error('DRAFT_EDIT_METADATA_CONFLICT');
    section.linkedFactIds = [...new Set([...original.linkedFactIds, ...(section.linkedFactIds ?? [])])];
    section.linkedEvidenceIds = [...new Set([...original.linkedEvidenceIds, ...(section.linkedEvidenceIds ?? [])])];
    section.linkedAuthorityIds = original.linkedAuthorityIds;
    section.linkedThesisIds = original.linkedThesisIds;
    const changes = edit?.changes.filter((change) => change.sectionId === original.id) ?? [];
    for (const { targetType, targetId, citationText, verified } of anchors) {
      const start = original.content.indexOf(citationText);
      if (changes.length && start >= 0 && !section.content.includes(citationText)) continue;
      const untouched =
        !changes.length ||
        (start >= 0 &&
          original.content.lastIndexOf(citationText) === start &&
          section.content.indexOf(citationText) === section.content.lastIndexOf(citationText) &&
          !changes.some((change) => change.start < start + citationText.length && change.end > start));
      citations.push({
        sectionOrdinal: section.ordinal,
        targetType,
        targetId,
        citationText,
        verified: verified && untouched,
      });
    }
  }
  return citations;
}
