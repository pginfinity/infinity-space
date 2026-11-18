/**
 * Mensagens que não saem do cliente: antes de enviar, o campo pergunta aos interceptadores
 * registrados (o pacote easter usa para a frase do mapa). Se um deles assumir, nada vai para a rede.
 */

type Interceptor = (text: string) => boolean;

const interceptors: Interceptor[] = [];

/** Registra um interceptador; devolve true para "esta mensagem é minha, não envie". */
export function registerChatInterceptor(fn: Interceptor): () => void {
  interceptors.push(fn);
  return () => {
    const i = interceptors.indexOf(fn);
    if (i >= 0) interceptors.splice(i, 1);
  };
}

/** Algum interceptador assumiu a mensagem? (então ela não é enviada a ninguém) */
export function interceptChat(text: string): boolean {
  for (const fn of interceptors) {
    try {
      if (fn(text)) return true;
    } catch (e) {
      console.error("[chat] interceptador falhou:", e);
    }
  }
  return false;
}
