import type { ActivityFactory } from "../types.ts";
import { ChamadoActivity } from "./chamado.ts";
import { SeguirActivity } from "./seguir.ts";

/** Pacote "presenca": achar e chamar pessoas (chamar, teleporte com convite, seguir com aceite). */
const create: ActivityFactory = (host) => [new ChamadoActivity(host), new SeguirActivity(host)];
export default create;
