import { requestApi, requestApiStream } from '../api-client';
import type { Answer, Delivery, Execution, PublicAction, Context, ActionId } from './execution-model';
import type { CommercialAuthorization, CommercialQuote, CommercialReceipt } from './commercial-model';
import type { RecentItem } from './RecentConversations';
import type { GuidanceStart, GuidanceState } from './guidance-model';
export interface StartInput {
  objective: string;
  actionId?: ActionId;
  conversationId?: string;
  matterId?: string;
  context?: Context;
  contextRevision?: number;
  useGuidance?: false;
}
export interface ClosedPilotBudget {
  currency: 'USD';
  model: string;
  ceilingCents: number;
  availableCents: number;
  settledCents: number;
  provisionedCents: number;
  escrowCents: number;
  reconciliationRequired: boolean;
  invoiceReconciled: false;
  examples: { id: string; objective: string }[];
  execution: { maximumCents: number; settledCents: number; escrowCents: number; status: string } | null;
}
export class WorkspaceClient {
  actions = () =>
    requestApi<{
      available: boolean;
      actions: PublicAction[];
      closedPilot?: boolean;
      commercial?: boolean;
      guidance?: boolean;
      deskEditorial?: boolean;
      researchCapabilities?: { caseLaw: boolean; legislation: boolean };
    }>('/api/agentic/actions', {}, { sessionOnly: true });
  closedBudget = (id?: string) =>
    requestApi<ClosedPilotBudget>(
      '/api/agentic/pilot/budget' + (id ? `?executionId=${encodeURIComponent(id)}` : ''),
      {},
      { sessionOnly: true },
    );
  closedStart = (body: { caseId: string; maxCostCents: number; confirmed: true }, key: string) =>
    this.command('/api/agentic/pilot/executions', body, key);
  commercialQuote = () => requestApi<CommercialQuote>('/api/agentic/commercial/quote', {}, { sessionOnly: true });
  commercialReceipt = (id: string) =>
    requestApi<CommercialReceipt>(
      `/api/agentic/commercial/executions/${encodeURIComponent(id)}/receipt`,
      {},
      { sessionOnly: true },
    );
  commercialStart = (body: StartInput & CommercialAuthorization, key: string) =>
    this.command('/api/agentic/commercial/executions', body, key);
  recent = (trash = false) =>
    requestApi<{ items: RecentItem[] }>(
      '/api/agentic/conversations' + (trash ? '?view=trash' : ''),
      {},
      { sessionOnly: true },
    );
  setConversationHidden = (id: string, hidden: boolean) =>
    requestApi<{ hidden: boolean }>(
      `/api/agentic/executions/${encodeURIComponent(id)}/history`,
      { method: 'POST', body: JSON.stringify({ hidden }) },
      { sessionOnly: true },
    );
  get = (id: string) =>
    requestApi<Execution>(`/api/agentic/executions/${encodeURIComponent(id)}`, {}, { sessionOnly: true });
  guidance = (id: string, signal?: AbortSignal) =>
    requestApi<GuidanceState>(`/api/agentic/guidance/${encodeURIComponent(id)}`, { signal }, { sessionOnly: true });
  startGuidance = (input: GuidanceStart, key: string) =>
    this.command<GuidanceState>('/api/agentic/guidance', input, key);
  answerGuidance = (id: string, input: Answer, key: string, correcting: boolean) =>
    this.command<GuidanceState>(
      `/api/agentic/guidance/${encodeURIComponent(id)}/${correcting ? 'correct' : 'answer'}`,
      input,
      key,
    );
  delivery = (id: string) =>
    requestApi<Delivery>(`/api/agentic/deliveries/${encodeURIComponent(id)}`, {}, { sessionOnly: true });
  private command<T = Execution>(path: string, body: unknown, key: string) {
    return requestApi<T>(
      path,
      { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) },
      { sessionOnly: true },
    );
  }
  start = (body: StartInput, key: string) => this.command('/api/agentic/executions', body, key);
  answer = (id: string, body: Answer & Partial<CommercialAuthorization>, key: string) =>
    this.command(`/api/agentic/executions/${encodeURIComponent(id)}/answers`, body, key);
  correct = (id: string, body: Answer & Partial<CommercialAuthorization>, key: string) =>
    this.command(`/api/agentic/executions/${encodeURIComponent(id)}/corrections`, body, key);
  cancel = (id: string, key: string) =>
    this.command(`/api/agentic/executions/${encodeURIComponent(id)}/cancel`, {}, key);
  continue = (id: string, key: string, authorization?: CommercialAuthorization) =>
    this.command(`/api/agentic/executions/${encodeURIComponent(id)}/continue`, authorization ?? {}, key);
  events = (id: string, after: number, signal: AbortSignal) =>
    requestApiStream(`/api/agentic/executions/${encodeURIComponent(id)}/events?after=${after}`, signal);
}
