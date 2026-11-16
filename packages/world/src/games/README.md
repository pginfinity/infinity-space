# Jogos

Cada jogo é um módulo com regras puras aqui (`packages/world/src/games/<jogo>.ts`), usado pelo servidor para validar jogadas e pelo cliente para desenhar o estado.

- Mesas de jogo são objetos do mapa com `gameId` (ex.: `arcade-xadrez-1`) e um tipo (`chess-table`, `connect4-table`...). `GAME_OF_TABLE` liga o tipo de mesa ao jogo. Cadeiras com o mesmo `gameId` e `gameSeat` (0, 1) são os lugares.
- Cliente → servidor: `{ t: "game", table, op, data }`. Servidor → todos: `{ t: "game", game: GameSnapshot }` sempre que o estado muda. Quem assiste recebe o mesmo estado de quem joga. O `welcome` traz o estado de todas as mesas.

## Operações (iguais para todos os jogos)

| op | data | regra |
|---|---|---|
| `sit` | `{ seat?: number }` | Lugar pedido (ou o primeiro vago). Precisa estar a até 3 m da mesa. A partida começa quando os lugares enchem. |
| `stand` | — | Levanta. No meio da partida é abandono: o outro vence (`reason: "left"`). Sair da sala faz o mesmo. |
| `move` | depende do jogo | Só quem está na vez; o servidor confere o lance. |
| `resign` | — | Desiste da partida em andamento. |
| `rematch` | `{ on?: boolean }` | Pede (ou retira) revanche. Com os dois de acordo, começa outra com os lados trocados. |

Lances (`move`): xadrez `{ from: "e2", to: "e4", promotion?: "q" \| "r" \| "b" \| "n" }` · Lig 4 `{ col: 0..6 }` · jogo da velha `{ cell: 0..8 }`.

## Estado (`GameSnapshot.state`)

Todo estado tem `turn` (lugar da vez), `winner`, `draw`, `over`, `reason`, `moves`, mais os dados da mesa (`TableMeta`): `rematch`, `round`, `names` (quem está sentado) e `players` (quem jogou a partida, mesmo depois de levantar).

- Xadrez (`ChessState`): `fen`, `history` (UCI), `san`, `last`, `check`, `lost`. Lugar 0 = brancas.
- Lig 4 (`Connect4State`): `grid[row * 7 + col]` (linha 0 no topo; -1 vazio, 0/1 lugar), `last`, `line`. Lugar 0 = laranja.
- Jogo da velha (`TicTacToeState`): `grid` (0 a 8), `last`, `line`. Lugar 0 = X. Mesa no mapa: `tictactoe-table` (Arcade).

## Cliente

- `apps/web/src/games/api.ts`: `openGame`, `closeGame`, `sendGame`, `useGamesUi().requestSeat(table, seat)` (anda até a cadeira, senta e avisa o servidor), `leaveSeat(table)`.
- `apps/web/src/games/boardTextures.ts`: `boardTexture(table)` devolve uma `THREE.CanvasTexture` (512 px, vista de cima) que se redesenha sozinha; `boardCanvas`/`onBoardRedraw` para o Pixi.
- Prévia sem servidor: `http://localhost:5173/src/games/preview.html`.
