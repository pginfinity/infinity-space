import { HOCKEY_DEF, PONG_DEF } from "@infinity/world";
import type { Activity, ActivityFactory } from "../types.ts";
import { DuelActivity } from "./duel.ts";
import { CabinetsActivity } from "./cabinets.ts";
import { PaperBallActivity } from "./paperball.ts";
import { PoolActivity } from "./pool.ts";

/** Pacote "arcade": jogos de tempo real do Arcade, fliperamas com ranking e a bolinha de papel. */
const create: ActivityFactory = (host) => {
  const acts: Activity[] = [];
  for (const o of host.objects("airhockey")) if (o.gameId) acts.push(new DuelActivity(host, HOCKEY_DEF, o));
  for (const o of host.objects("pingpong")) if (o.gameId) acts.push(new DuelActivity(host, PONG_DEF, o));
  for (const o of host.objects("pool")) if (o.gameId) acts.push(new PoolActivity(host, o));
  acts.push(new CabinetsActivity(host));
  acts.push(new PaperBallActivity(host));
  return acts;
};
export default create;
