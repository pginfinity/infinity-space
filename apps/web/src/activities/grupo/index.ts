import { registerActivity } from "../registry.ts";
import "./sounds.ts";
import { fxClient } from "./fx.tsx";
import { quizClient } from "./quiz.tsx";
import { drawClient } from "./draw.tsx";
import { stopClient } from "./stop.tsx";

/** Pacote "grupo": jogos de grupo (Quiz Show, Desenhe e adivinhe, Stop). */
registerActivity(quizClient);
registerActivity(drawClient);
registerActivity(stopClient);
registerActivity(fxClient);
