export interface DeskEditSelection {
  versionId: string;
  sectionId: string;
  start: number;
  end: number;
  before: string;
}

export interface DeskPiece {
  matterId: string;
  draftId: string;
  versionId: string;
  title: string;
  dirty: boolean;
  loadingSelection?: boolean;
  deliveryId?: string;
  canOpenDelivery?: (attached: boolean) => boolean;
  localText?: string;
  editSelection?: DeskEditSelection;
  clearEditSelection?: () => void;
  prepare?: () => Promise<DeskPiece>;
}

export interface DeskRequest {
  id: number;
  text: string;
}
