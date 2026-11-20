import { registerActivity } from "../registry.ts";
import { gong } from "./gong.tsx";
import { status } from "./status.tsx";
import { plane } from "./plane.tsx";
import { deploy } from "./deploy.tsx";
import { noticeBoard } from "./board.tsx";
import { greet } from "./greet.tsx";
import { photoBooth } from "./photo.tsx";
import { photoWall } from "./photowall.tsx";
import { lobbyPanel } from "./painel.tsx";
import { megafone } from "./megafone.tsx";
import { quadro } from "./quadro.tsx";
import { convite } from "./convite.tsx";

/** Pacote "escritorio": interações sociais do escritório. */
registerActivity(gong);
registerActivity(status);
registerActivity(plane);
registerActivity(deploy);
registerActivity(noticeBoard);
registerActivity(greet);
registerActivity(photoBooth);
registerActivity(photoWall);
registerActivity(lobbyPanel);
registerActivity(megafone);
registerActivity(quadro);
registerActivity(convite);
