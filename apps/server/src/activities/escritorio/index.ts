import type { ActivityFactory } from "../types.ts";
import { GongActivity } from "./gong.ts";

/** Pacote "escritorio": interações sociais do escritório. */
const create: ActivityFactory = (host) => [new GongActivity(host)];
export default create;
