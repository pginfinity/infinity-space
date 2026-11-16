import type { ActivityFactory } from "../types.ts";
import { MesasActivity } from "./desks.ts";
import { mesasAdmin } from "./admin.ts";

/** Pacote "mesas": check-in nas mesas rotativas, mesas fixas, objetos pessoais e recados na mesa. */
const create: ActivityFactory = (host) => [new MesasActivity(host, mesasAdmin(host.store, process.env, (id) => host.playerEmail?.(id)))];
export default create;
