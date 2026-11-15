/** Raio do avatar no chão, em metros. */
export const AVATAR_RADIUS = 0.28;
/** Espessura das paredes, em metros. */
export const WALL_THICKNESS = 0.15;
/** Velocidade de caminhada e de corrida (Shift), em m/s. */
export const WALK_SPEED = 3.6;
export const RUN_SPEED = 6.4;
/** Tamanho da célula da grade de navegação, em metros. */
export const NAV_CELL = 0.25;
/** Frequência com que o cliente envia a própria pose e o servidor retransmite. */
export const POSE_HZ = 15;
/** Atraso de interpolação dos avatares remotos (ms). Maior = mais suave, menor = mais imediato. */
export const INTERP_DELAY_MS = 120;
