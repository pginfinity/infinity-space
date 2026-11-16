import type { ActivityFactory } from "../types.ts";
import { ChatActivity } from "./chat.ts";

/** Pacote "chat": chat de texto do escritório (Geral, Perto e conversas diretas). */
const create: ActivityFactory = (host) => [new ChatActivity(host)];
export default create;
