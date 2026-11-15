import { AccessToken } from "livekit-server-sdk";

/**
 * Integração com o LiveKit (áudio, vídeo e tela).
 * Em desenvolvimento usa o servidor local em modo --dev (chave devkey/secret).
 */

export const RTC = {
  /** Endereço que o navegador usa para conectar. */
  publicUrl: process.env.LIVEKIT_PUBLIC_URL ?? "ws://localhost:7880",
  apiKey: process.env.LIVEKIT_API_KEY ?? "devkey",
  apiSecret: process.env.LIVEKIT_API_SECRET ?? "secret",
  room: process.env.LIVEKIT_ROOM ?? "infinity-space",
};

/** Token de quem já está dentro do escritório (a identidade é o id da pessoa na sala do mundo). */
export async function rtcToken(identity: string, name: string): Promise<string> {
  const at = new AccessToken(RTC.apiKey, RTC.apiSecret, { identity, name, ttl: "8h" });
  at.addGrant({
    room: RTC.room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return at.toJwt();
}
