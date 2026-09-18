export type BillingReturnOutcome = 'approved' | 'pending' | 'failed' | 'canceled';

export interface BillingReturn {
  purchaseId: string;
  paymentId?: string;
  outcome: BillingReturnOutcome;
}

function outcomeFromStatus(status: string | null): BillingReturnOutcome {
  if (status === 'approved' || status === 'accredited') return 'approved';
  if (status === 'pending' || status === 'in_process' || status === 'processing') return 'pending';
  if (status === 'cancelled' || status === 'canceled') return 'canceled';
  return 'failed';
}

export function parseBillingReturn(search: string): BillingReturn | null {
  const params = new URLSearchParams(search);
  const purchaseId = params.get('billing_purchase') ?? params.get('billing_canceled');
  if (!purchaseId?.trim()) return null;

  const status = params.get('collection_status') ?? params.get('status');
  const outcome = params.has('billing_canceled') ? 'canceled' : outcomeFromStatus(status);
  const paymentId = params.get('payment_id') ?? undefined;

  return {
    purchaseId,
    paymentId,
    outcome,
  };
}
