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
  /** A aba Estrutura da peça está aberta: no modo Automático, o pedido corrige a estrutura do caso (E2). */
  structureTabActive?: boolean;
}

export interface DeskRequest {
  id: number;
  text: string;
}
