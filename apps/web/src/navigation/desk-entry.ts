/**
 * Pedido de entrada na Mesa vindo da lateral do gelo (27/11). Fora da Mesa, abrir uma conversa ou um caso no histórico
 * deve levar à Mesa já com a escolha, numa entrada só do histórico do navegador: a lateral marca o pedido e a próxima
 * escolha da Mesa (`setDeskSelection`) o consome e navega. Se a Mesa não escolher nada (ex.: “Nova conversa” já vazia),
 * a lateral navega sozinha.
 */
let requested = false;

export function requestDeskEntry(): void {
  requested = true;
}

/** Devolve se havia pedido pendente e o limpa. */
export function consumeDeskEntry(): boolean {
  const value = requested;
  requested = false;
  return value;
}
