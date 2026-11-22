import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Ponto do cabeçalho da Mesa onde o seletor de caso aparece no tema gelo. O estado do caso continua no pedido
 * (`Composer`), que renderiza o seletor aqui por portal; assim nada do estado sobe de nível. Fora do gelo não há
 * ponto, e o seletor segue dentro de "Caso e documentos".
 */
const Context = createContext<HTMLElement | null>(null);

export function DeskCaseSlotProvider({ element, children }: { element: HTMLElement | null; children: ReactNode }) {
  const value = useMemo(() => element, [element]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useDeskCaseSlot = () => useContext(Context);
