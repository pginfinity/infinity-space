import type { ActivityFactory } from "../types.ts";
import { CopaActivity } from "./copa.ts";
import { PlantsActivity } from "./plants.ts";
import { OrbiActivity } from "./orbi.ts";
import { JukeboxActivity } from "./jukebox.ts";

/** Pacote "vivo": a estação viva (copa, plantas, Orbi, jukebox). O telescópio é só do cliente. */
const create: ActivityFactory = (host) => [new CopaActivity(host), new PlantsActivity(host), new OrbiActivity(host), new JukeboxActivity(host)];
export default create;
