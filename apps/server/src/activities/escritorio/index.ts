import type { ActivityFactory } from "../types.ts";
import { GongActivity } from "./gong.ts";
import { DeployActivity } from "./deploy.ts";
import { BoardActivity } from "./board.ts";
import { PlaneActivity } from "./plane.ts";
import { GreetActivity } from "./greet.ts";
import { PhotoActivity } from "./photo.ts";
import { PhotoWallActivity } from "./photowall.ts";
import { PainelActivity, supremacyFromEnv } from "./painel.ts";
import { MegafoneActivity } from "./megafone.ts";
import { mesasAdmin } from "../mesas/admin.ts";

/** Pacote "escritorio": interações sociais do escritório. */
const create: ActivityFactory = (host) => {
  // A cabine dá a quem saiu na foto o bilhete para o mural de fotos da copa.
  const wall = new PhotoWallActivity(host);
  const admin = mesasAdmin(host.store, process.env, (id) => host.playerEmail?.(id));
  return [
    new GongActivity(host),
    new DeployActivity(host),
    new BoardActivity(host),
    new PlaneActivity(host),
    new GreetActivity(host),
    new PhotoActivity(host, Date.now, wall),
    wall,
    new PainelActivity(host, { ...admin, supremacy: supremacyFromEnv(process.env) }),
    new MegafoneActivity(host, admin),
  ];
};
export default create;
