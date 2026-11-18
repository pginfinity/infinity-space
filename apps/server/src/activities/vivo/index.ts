import type { ActivityFactory } from "../types.ts";
import { CopaActivity } from "./copa.ts";
import { PlantsActivity } from "./plants.ts";
import { OrbiActivity } from "./orbi.ts";
import { JukeboxActivity } from "./jukebox.ts";
import { TvActivity } from "./tv.ts";

/** Pacote "vivo": a estação viva (copa, plantas, Orbi, jukebox, TV do lounge). O telescópio é só do cliente. */
const create: ActivityFactory = (host) => [new CopaActivity(host), new PlantsActivity(host), new OrbiActivity(host), new JukeboxActivity(host), new TvActivity(host)];
export default create;
