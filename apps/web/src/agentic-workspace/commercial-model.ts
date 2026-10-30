export interface CommercialAuthorization {
  confirmed: true;
  policyVersion: string;
}
export interface CommercialQuote {
  currency: 'BRL';
  policyVersion: string;
  minCostCents: number;
  maxCostCents: number;
  availableCents: number;
  dailyLimitCents: number;
  monthlyLimitCents: number;
}
export interface CommercialReceipt {
  currency: 'BRL';
  reservedCents: number;
  chargedCents: number;
  releasedCents: number;
  expiredPromoCents?: number;
  status: string;
}
export const reais = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
