export interface DeskPiece {
  matterId: string;
  draftId: string;
  versionId: string;
  title: string;
  dirty: boolean;
  deliveryId?: string;
  canOpenDelivery?: (attached: boolean) => boolean;
  localText?: string;
  prepare?: () => Promise<DeskPiece>;
}

export interface DeskRequest {
  id: number;
  text: string;
}
