import { AccessToken } from "livekit-server-sdk";
import { recIdentity } from "@infinity/world";

/**
 * Integração com o LiveKit (áudio, vídeo e tela).
 * Em desenvolvimento usa o servidor local em modo --dev (chave devkey/secret).
 */

export const RTC = {
  /** Endereço que o navegador usa para conectar. */
  publicUrl: process.env.LIVEKIT_PUBLIC_URL ?? "ws://localhost:7880",
  /** Endereço que o próprio servidor usa (o gravador). Na VPS, o LiveKit local. */
  internalUrl: process.env.LIVEKIT_INTERNAL_URL ?? process.env.LIVEKIT_PUBLIC_URL ?? "ws://localhost:7880",
  apiKey: process.env.LIVEKIT_API_KEY ?? "devkey",
  apiSecret: process.env.LIVEKIT_API_SECRET ?? "secret",
  room: process.env.LIVEKIT_ROOM ?? "infinity-space",
};

/**
 * Token de quem já está dentro do escritório (a identidade é o id da pessoa na sala do mundo).
 * Sem nome: o convidado de uma reunião também entra no LiveKit e veria o nome de todos os conectados.
 */
export async function rtcToken(identity: string, room = RTC.room): Promise<string> {
  const at = new AccessToken(RTC.apiKey, RTC.apiSecret, { identity, ttl: "8h" });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return at.toJwt();
}

/** Token do gravador de uma sala: oculto, só escuta, nada publica. */
export async function recorderToken(group: string): Promise<string> {
  const at = new AccessToken(RTC.apiKey, RTC.apiSecret, { identity: recIdentity(group), name: "Gravador", ttl: "5h" });
  at.addGrant({ room: RTC.room, roomJoin: true, canPublish: false, canSubscribe: true, canPublishData: false, hidden: true, recorder: true });
  return at.toJwt();
}
