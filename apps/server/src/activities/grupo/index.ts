import type { Activity, ActivityFactory } from "../types.ts";
import { DrawActivity } from "./draw.ts";
import { QuizActivity } from "./quiz.ts";
import { StopActivity } from "./stop.ts";

/**
 * Pacote "grupo": jogos de grupo para o time se integrar.
 * Quiz Show (Auditório), Desenhe e adivinhe (um por quadro branco) e Stop (Café).
 */
const create: ActivityFactory = (host) => {
  const list: Activity[] = [new QuizActivity(host), new StopActivity(host)];
  for (const board of host.objects("whiteboard")) list.push(new DrawActivity(host, board));
  return list;
};
export default create;
