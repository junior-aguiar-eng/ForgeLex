import type { BillingTransaction } from '../../api-client';
import { billingActivityLabel } from '../../screens/AccountActivityScreen';

/**
 * Coluna lateral da Conta no tema gelo (V5): só o que o serviço devolve, sem recalcular nada. As chaves aparecem pelo
 * prefixo público (nunca o segredo nem os escopos) e os valores seguem em centavos, como vieram.
 */
const LIMIT = 3;

export interface ApiKeyLine {
  id: string;
  name: string;
  prefix: string;
  active: boolean;
}

export interface ActivityLine {
  id: string;
  label: string;
  amountCents: number;
  date: string;
}

const typeLabel = (item: Pick<BillingTransaction, 'type' | 'capability'>) =>
  item.type === 'CREDIT'
    ? 'Crédito'
    : item.type === 'REFUND'
      ? 'Reembolso'
      : item.capability
        ? billingActivityLabel(item.capability)
        : 'Uso';

export function recentAccountActivity(
  transactions: Pick<BillingTransaction, 'id' | 'type' | 'amountCents' | 'date' | 'capability'>[],
  limit = LIMIT,
): ActivityLine[] {
  return [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit)
    .map((item) => ({ id: item.id, label: typeLabel(item), amountCents: item.amountCents, date: item.date }));
}
