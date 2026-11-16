import { registerActivity } from "../registry.ts";
import "./sounds.ts";
import { TableBoards } from "./tables.tsx";
import { duels } from "./duels.tsx";
import { cabinets } from "./cabinet/client.ts";
import { paperball } from "./paperball.tsx";

/** Pacote "arcade": jogos do Arcade (mesas, tempo real, fliperamas) e a bolinha de papel. */
registerActivity({ name: "arcade/mesas", Scene: TableBoards });
registerActivity(duels);
registerActivity(cabinets);
registerActivity(paperball);
