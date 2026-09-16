export interface UsageEvent {
  id: string;
  tenantId: string;
  userId?: string;
  capability: string;
  toolName?: string;
  provider?: string;
  model?: string;
  units: number;
  legalCredits?: number;
  monetaryCostCents?: number;
  requestId: string;
  sessionId?: string;
  timestamp: string;
}
