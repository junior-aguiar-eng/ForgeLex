import type { CommercialReceipt } from './commercial-model';

/** Receipt settlement may follow the last execution event. Reads are safe to repeat. */
export function observeCommercialReceipt(
  read: () => Promise<CommercialReceipt>,
  onReceipt: (receipt: CommercialReceipt) => void,
  onUnavailable: () => void,
): () => void {
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const load = async () => {
    try {
      const receipt = await read();
      if (stopped) return;
      failures = 0;
      onReceipt(receipt);
      if (receipt.status === 'ACTIVE') timer = setTimeout(() => void load(), 1500);
    } catch {
      if (stopped) return;
      failures++;
      if (failures < 3) timer = setTimeout(() => void load(), 1500);
      else onUnavailable();
    }
  };
  void load();
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
