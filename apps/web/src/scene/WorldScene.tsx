import type { Lens } from "@infinity/world";
import { Station } from "./Station.tsx";
import { Avatars } from "./Avatars.tsx";
import { Space } from "./Space.tsx";
import { ScreenTVs } from "./ScreenTVs.tsx";

/** O mundo: luzes, espaço, estação e pessoas. A lente só muda a câmera e o tratamento da imagem. */
export function WorldScene({ lens }: { lens: Lens }) {
  return (
    <>
      <hemisphereLight args={["#D8E8FF", "#2A3550", 1.15]} />
      <directionalLight position={[28, 46, 22]} intensity={1.7} color="#FFF1DE" />
      <directionalLight position={[-24, 18, -16]} intensity={0.35} color="#8FD0FF" />
      <ambientLight intensity={0.18} />
      <Space />
      <Station lens={lens} />
      <Avatars />
      <ScreenTVs />
    </>
  );
}
