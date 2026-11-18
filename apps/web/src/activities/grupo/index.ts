import { registerActivity } from "../registry.ts";
import "./sounds.ts";
import { fxClient } from "./fx.tsx";
import { quizClient } from "./quiz.tsx";
import { drawClient } from "./draw.tsx";
import { stopClient } from "./stop.tsx";
import { impostorClient } from "./impostor.tsx";
import { palavraClient } from "./palavra.tsx";

/** Pacote "grupo": jogos de grupo (Quiz Show, Desenhe e adivinhe, Stop, Impostor na Estação, Palavra secreta). */
registerActivity(quizClient);
registerActivity(drawClient);
registerActivity(stopClient);
registerActivity(impostorClient);
registerActivity(palavraClient);
registerActivity(fxClient);
