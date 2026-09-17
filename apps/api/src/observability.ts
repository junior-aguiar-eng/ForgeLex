const SENSITIVE_KEY = /token|secret|password|api.?key|authorization|cookie|payload/i;

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeForLog(item, depth + 1));
  if (!value || typeof value !== 'object') return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}…` : value;
  return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeForLog(item, depth + 1)]));
}

export interface MetricSnapshot {
  requests: number;
  errors: number;
  timeouts: number;
  totalLatencyMs: number;
  webhookEventsQueued: number;
  webhookDeliveries: number;
  webhookRetries: number;
  webhookFailures: number;
  billingOperations: number;
  billingUnits: number;
}

export class RequestMetrics {
  private snapshot: MetricSnapshot = {
    requests: 0,
    errors: 0,
    timeouts: 0,
    totalLatencyMs: 0,
    webhookEventsQueued: 0,
    webhookDeliveries: 0,
    webhookRetries: 0,
    webhookFailures: 0,
    billingOperations: 0,
    billingUnits: 0,
  };
  public observe(input: { latencyMs: number; statusCode: number }): void {
    this.snapshot.requests += 1;
    this.snapshot.totalLatencyMs += input.latencyMs;
    if (input.statusCode >= 500) this.snapshot.errors += 1;
    if (input.statusCode === 408 || input.statusCode === 504) this.snapshot.timeouts += 1;
  }

  public observeWebhookQueued(): void { this.snapshot.webhookEventsQueued += 1; }

  public observeWebhookDelivery(status: 'delivered' | 'retrying' | 'failed' | 'idle'): void {
    if (status === 'delivered') this.snapshot.webhookDeliveries += 1;
    if (status === 'retrying') this.snapshot.webhookRetries += 1;
    if (status === 'failed') this.snapshot.webhookFailures += 1;
  }

  public observeBilling(units = 1): void {
    this.snapshot.billingOperations += 1;
    this.snapshot.billingUnits += units;
  }
  public read(): MetricSnapshot { return { ...this.snapshot }; }

  public toPrometheus(): string {
    const lines = [
      '# HELP forgelex_http_requests_total Total de requisições HTTP observadas.',
      '# TYPE forgelex_http_requests_total counter',
      `forgelex_http_requests_total ${this.snapshot.requests}`,
      '# HELP forgelex_http_errors_total Total de respostas HTTP 5xx.',
      '# TYPE forgelex_http_errors_total counter',
      `forgelex_http_errors_total ${this.snapshot.errors}`,
      '# HELP forgelex_http_timeouts_total Total de respostas HTTP de timeout.',
      '# TYPE forgelex_http_timeouts_total counter',
      `forgelex_http_timeouts_total ${this.snapshot.timeouts}`,
      '# HELP forgelex_http_latency_ms_total Soma da latência HTTP observada em milissegundos.',
      '# TYPE forgelex_http_latency_ms_total counter',
      `forgelex_http_latency_ms_total ${this.snapshot.totalLatencyMs}`,
      '# HELP forgelex_webhook_events_queued_total Total de eventos de webhook persistidos no outbox.',
      '# TYPE forgelex_webhook_events_queued_total counter',
      `forgelex_webhook_events_queued_total ${this.snapshot.webhookEventsQueued}`,
      '# HELP forgelex_webhook_deliveries_total Total de entregas de webhook concluídas.',
      '# TYPE forgelex_webhook_deliveries_total counter',
      `forgelex_webhook_deliveries_total ${this.snapshot.webhookDeliveries}`,
      '# HELP forgelex_webhook_retries_total Total de tentativas de webhook que exigiram retry.',
      '# TYPE forgelex_webhook_retries_total counter',
      `forgelex_webhook_retries_total ${this.snapshot.webhookRetries}`,
      '# HELP forgelex_webhook_failures_total Total de entregas de webhook encerradas com falha.',
      '# TYPE forgelex_webhook_failures_total counter',
      `forgelex_webhook_failures_total ${this.snapshot.webhookFailures}`,
      '# HELP forgelex_billing_operations_total Total de operações faturáveis observadas.',
      '# TYPE forgelex_billing_operations_total counter',
      `forgelex_billing_operations_total ${this.snapshot.billingOperations}`,
      '# HELP forgelex_billing_units_total Total de unidades faturáveis observadas.',
      '# TYPE forgelex_billing_units_total counter',
      `forgelex_billing_units_total ${this.snapshot.billingUnits}`,
    ];
    return `${lines.join('\n')}\n`;
  }
}

export function structuredLog(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}): void {
  const safeFields = sanitizeForLog(fields) as Record<string, unknown>;
  process.stdout.write(`${JSON.stringify({ level, message, ...safeFields, timestamp: new Date().toISOString() })}\n`);
}
