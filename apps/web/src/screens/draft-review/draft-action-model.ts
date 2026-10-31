export function getDraftPrimaryAction(s: {
  exists: boolean;
  dirty: boolean;
  stale: boolean;
  reviewState: string | undefined;
  blockingCount: number;
  approvalStatus: string;
  readOnly: boolean;
}): 'CREATE' | 'SAVE_REVIEW' | 'REVIEW' | 'APPROVE' | 'DOWNLOAD' | null {
  if (s.readOnly) return null;
  if (!s.exists) return 'CREATE';
  if (s.dirty) return 'SAVE_REVIEW';
  if (s.stale || s.reviewState !== 'COMPLETE' || s.blockingCount > 0) return 'REVIEW';
  if (s.approvalStatus === 'APPROVED') return 'DOWNLOAD';
  return 'APPROVE';
}
