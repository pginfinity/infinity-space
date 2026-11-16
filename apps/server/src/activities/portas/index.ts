import type { ActivityFactory } from "../types.ts";
import { PortasActivity } from "./portas.ts";

export { PortasActivity, type PrivacySource } from "./portas.ts";

/** Pacote "portas": portas das salas, roda fechada e sussurro (privacidade de conversa). */
const create: ActivityFactory = (host) => [new PortasActivity(host)];
export default create;
