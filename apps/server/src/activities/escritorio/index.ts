import type { ActivityFactory } from "../types.ts";
import { GongActivity } from "./gong.ts";
import { DeployActivity } from "./deploy.ts";
import { BoardActivity } from "./board.ts";
import { PlaneActivity } from "./plane.ts";
import { GreetActivity } from "./greet.ts";
import { PhotoActivity } from "./photo.ts";

/** Pacote "escritorio": interações sociais do escritório. */
const create: ActivityFactory = (host) => [
  new GongActivity(host),
  new DeployActivity(host),
  new BoardActivity(host),
  new PlaneActivity(host),
  new GreetActivity(host),
  new PhotoActivity(host),
];
export default create;
