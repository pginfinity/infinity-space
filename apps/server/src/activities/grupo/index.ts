import type { Activity, ActivityFactory } from "../types.ts";
import { DrawActivity } from "./draw.ts";
import { ImpostorActivity } from "./impostor.ts";
import { PalavraActivity } from "./palavra.ts";
import { QuizActivity } from "./quiz.ts";
import { StopActivity } from "./stop.ts";

/**
 * Pacote "grupo": jogos de grupo para o time se integrar.
 * Quiz Show (Auditório), Desenhe e adivinhe (um por quadro branco), Stop (Café), Impostor na Estação (Átrio)
 * e Palavra secreta (Marketing Studio).
 */
const create: ActivityFactory = (host) => {
  const list: Activity[] = [new QuizActivity(host), new StopActivity(host), new ImpostorActivity(host), new PalavraActivity(host)];
  for (const board of host.objects("whiteboard")) list.push(new DrawActivity(host, board));
  return list;
};
export default create;
