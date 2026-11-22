import { useEffect, useState } from 'react';
import { getBillingAccount } from '../../api-client';

/**
 * Saldo da conta para o cartão da lateral. Lê de novo quando `refreshKey` muda (ao trocar de tela), ignora falha e
 * nunca inventa valor: sem resposta, `undefined`.
 */
export function useBalanceCents(refreshKey: unknown): number | undefined {
  const [cents, setCents] = useState<number | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void getBillingAccount()
      .then((account) => {
        if (active && Number.isInteger(account.balanceCents)) setCents(account.balanceCents);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [refreshKey]);
  return cents;
}
