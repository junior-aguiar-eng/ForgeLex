import { requestApi, requestApiStream } from '../api-client';
import type { Answer, Delivery, Execution, PublicAction, Context, ActionId } from './execution-model';
export interface StartInput {
  objective: string;
  actionId?: ActionId;
  conversationId?: string;
  matterId?: string;
  context?: Context;
  contextRevision?: number;
}
export class WorkspaceClient {
  actions = () =>
    requestApi<{ available: boolean; actions: PublicAction[] }>('/api/agentic/actions', {}, { sessionOnly: true });
  get = (id: string) =>
    requestApi<Execution>(`/api/agentic/executions/${encodeURIComponent(id)}`, {}, { sessionOnly: true });
  delivery = (id: string) =>
    requestApi<Delivery>(`/api/agentic/deliveries/${encodeURIComponent(id)}`, {}, { sessionOnly: true });
  private command(path: string, body: unknown, key: string) {
    return requestApi<Execution>(
      path,
      { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) },
      { sessionOnly: true },
    );
  }
  start = (body: StartInput, key: string) => this.command('/api/agentic/executions', body, key);
  answer = (id: string, body: Answer, key: string) =>
    this.command(`/api/agentic/executions/${encodeURIComponent(id)}/answers`, body, key);
  correct = (id: string, body: Answer, key: string) =>
    this.command(`/api/agentic/executions/${encodeURIComponent(id)}/corrections`, body, key);
  cancel = (id: string, key: string) =>
    this.command(`/api/agentic/executions/${encodeURIComponent(id)}/cancel`, {}, key);
  continue = (id: string, key: string) =>
    this.command(`/api/agentic/executions/${encodeURIComponent(id)}/continue`, {}, key);
  events = (id: string, after: number, signal: AbortSignal) =>
    requestApiStream(`/api/agentic/executions/${encodeURIComponent(id)}/events?after=${after}`, signal);
}
