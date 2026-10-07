export interface DocumentSource {
  matterId: string;
  documentId: string;
  versionId?: string;
  anchorId?: string;
}

export interface DocumentAnchor {
  id: string;
  ordinal: number;
  startOffset: number;
  endOffset: number;
}

export interface DocumentBundle {
  document: { id: string; title: string; originalFilename: string; lifecycleState: string };
  version: { id: string; versionNumber: number; content: string; createdAt: string };
  anchors: DocumentAnchor[];
}

export interface DocumentReference {
  reference: {
    sectionOrdinal: number;
    itemId: string;
    documentVersionId: string;
    anchorId?: string;
    citationText?: string;
  };
  documentTitle?: string;
  versionNumber?: number;
  available: boolean;
  anchor?: { text: string };
}

export function documentTextParts(content: string, anchors: DocumentAnchor[]) {
  const parts: Array<{ start: number; end: number; anchor?: DocumentAnchor }> = [];
  let cursor = 0;
  for (const anchor of [...anchors].sort((a, b) => a.startOffset - b.startOffset)) {
    // Malformed anchors cannot hide or duplicate any of the saved text.
    if (anchor.startOffset < cursor || anchor.endOffset > content.length || anchor.endOffset <= anchor.startOffset)
      continue;
    if (cursor < anchor.startOffset) parts.push({ start: cursor, end: anchor.startOffset });
    parts.push({ start: anchor.startOffset, end: anchor.endOffset, anchor });
    cursor = anchor.endOffset;
  }
  if (cursor < content.length) parts.push({ start: cursor, end: content.length });
  return parts;
}

export function documentMatches(content: string, query: string) {
  const term = query.trim();
  const matches: Array<{ start: number; end: number }> = [];
  if (!term) return { matches, truncated: false };
  const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  for (const match of content.matchAll(pattern)) {
    if (matches.length === 1000) return { matches, truncated: true };
    matches.push({ start: match.index, end: match.index + match[0].length });
  }
  return { matches, truncated: false };
}
