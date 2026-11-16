import { registerActivity } from "../registry.ts";
import { gong } from "./gong.tsx";
import { status } from "./status.tsx";
import { plane } from "./plane.tsx";
import { deploy } from "./deploy.tsx";
import { noticeBoard } from "./board.tsx";
import { greet } from "./greet.tsx";
import { photoBooth } from "./photo.tsx";

/** Pacote "escritorio": interações sociais do escritório. */
registerActivity(gong);
registerActivity(status);
registerActivity(plane);
registerActivity(deploy);
registerActivity(noticeBoard);
registerActivity(greet);
registerActivity(photoBooth);
