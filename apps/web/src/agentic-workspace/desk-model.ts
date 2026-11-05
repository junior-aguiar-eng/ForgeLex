export interface DeskPiece {
  matterId: string;
  draftId: string;
  versionId: string;
  title: string;
  dirty: boolean;
}

export interface DeskRequest {
  id: number;
  text: string;
}
