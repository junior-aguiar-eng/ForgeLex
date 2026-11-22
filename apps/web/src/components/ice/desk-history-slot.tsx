import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Ponto da lateral do tema gelo onde a Mesa coloca as conversas recentes (protótipo: a lista fica dentro da lateral, não
 * numa coluna da Mesa). A lateral registra o elemento enquanto está aberta na Mesa; a Mesa renderiza a lista nele por
 * portal. Fora do gelo o contexto é o padrão: sem elemento, e a Mesa usa a própria coluna.
 */
interface Slot {
  element: HTMLElement | null;
  setElement: (element: HTMLElement | null) => void;
  /** Só o gelo tem lateral com esse ponto; o clássico mantém a coluna da Mesa. */
  inSidebar: boolean;
}

const Context = createContext<Slot>({ element: null, setElement: () => undefined, inSidebar: false });

export function DeskHistorySlotProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const value = useMemo<Slot>(() => ({ element, setElement, inSidebar: true }), [element]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useDeskHistorySlot = () => useContext(Context);
