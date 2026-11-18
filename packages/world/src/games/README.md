# Jogos

Cada jogo é um módulo com regras puras aqui (`packages/world/src/games/<jogo>.ts`), usado pelo servidor para validar jogadas e pelo cliente para desenhar o estado.

- Mesas de jogo são objetos do mapa com `gameId` (ex.: `arcade-xadrez-1`) e um tipo (`chess-table`, `connect4-table`...). `GAME_OF_TABLE` liga o tipo de mesa ao jogo. Cadeiras com o mesmo `gameId` e `gameSeat` (0, 1, 2, 3) são os lugares.
- Cliente → servidor: `{ t: "game", table, op, data }`. Servidor → cada pessoa: `{ t: "game", game: GameSnapshot }` sempre que o estado muda. O `welcome` traz o estado de todas as mesas.
- **Visão por pessoa (informação escondida).** Nos jogos sem segredo (xadrez, Lig 4, velha, damas) todo mundo recebe o mesmo estado. Nos jogos com `view` (dominó e truco), o servidor manda a cada pessoa a própria visão: quem joga vê a própria mão; quem assiste vê só quantas pedras ou cartas cada um tem; monte e semente do embaralhamento nunca saem do servidor. O `welcome` também vai com a visão de quem entra. O cliente não precisa fazer nada: o `state` que chega já é o que ele pode ver.

## Lugares e começo da partida

- `GameRules.seats`: quantos lugares a mesa tem. `players`: com quantas pessoas a partida pode acontecer (ausente = só com a mesa cheia). Ex.: dominó `[2, 3, 4]`, truco `[2, 4]`.
- Com a mesa cheia, a partida começa sozinha. Com menos gente (mas numa quantidade aceita), quem está sentado começa pela op `start`.
- `create({ seated, seed, round })`: lugares ocupados, semente sorteada pelo servidor e número da partida. Jogos de lugares fixos ignoram tudo. Sem `seated`, os jogos de lugares variáveis devolvem a mesa vazia (nada distribuído).
- `move(state, seat, data, seed)`: o servidor manda uma semente nova a cada lance (o truco embaralha a mão seguinte com ela).
- Revanche: nos jogos de dois lugares, troca os lados. Com `keepSeats` (dominó, truco), todo mundo fica onde está e o próprio jogo passa a vez de começar para outra pessoa pelo `round`.

## Operações (iguais para todos os jogos)

| op | data | regra |
|---|---|---|
| `sit` | `{ seat?: number }` | Lugar pedido (ou o primeiro vago). Precisa estar a até 3 m da mesa. A partida começa quando os lugares enchem. |
| `start` | — | Mesas de vários lugares: quem está sentado começa com quem já sentou, se a quantidade vale para o jogo. |
| `stand` | — | Levanta. No meio da partida é abandono: o outro lado vence (`reason: "left"`; nas mesas de vários lugares, `quit` diz quem saiu). Sair da sala faz o mesmo. |
| `move` | depende do jogo | Só quem está na vez (`turn`) ou entre quem pode responder (`acting`); o servidor confere o lance. |
| `resign` | — | Desiste da partida em andamento. |
| `rematch` | `{ on?: boolean }` | Pede (ou retira) revanche. Com todos os sentados de acordo, começa outra. |

Lances (`move`):

- Xadrez `{ from: "e2", to: "e4", promotion?: "q" | "r" | "b" | "n" }` · Lig 4 `{ col: 0..6 }` · jogo da velha `{ cell: 0..8 }`.
- Damas `{ path: [casa, ...paradas] }`: casas de 0 (a8) a 63 (h1); numa captura em sequência, cada casa onde a peça para.
- Dominó `{ play: pedra, end?: 0 | 1 }` (ponta esquerda ou direita; obrigatória só quando a pedra serve nas duas pontas com números diferentes), `{ draw: true }` (compra até achar uma pedra que sirva) ou `{ pass: true }` (sem pedra e sem monte).
- Truco `{ play: posição na mão }`, `{ truco: true }` (pede truco, seis, nove ou doze, conforme o valor), `{ answer: "accept" | "run" | "raise" }` (a outra dupla responde) e `{ eleven: "play" | "run" }` (mão de onze).

## Estado (`GameSnapshot.state`)

Todo estado tem `turn` (lugar da vez), `winner`, `draw`, `over`, `reason`, `moves`, e às vezes `winners` (duplas: os dois parceiros), `acting` (outros lugares que podem agir agora) e `quit` (quem desistiu ou saiu). Mais os dados da mesa (`TableMeta`): `rematch`, `round`, `names` (quem está sentado) e `players` (quem jogou a partida, mesmo depois de levantar).

- Xadrez (`ChessState`): `fen`, `history` (UCI), `san`, `last`, `check`, `lost`. Lugar 0 = brancas.
- Lig 4 (`Connect4State`): `grid[row * 7 + col]` (linha 0 no topo; -1 vazio, 0/1 lugar), `last`, `line`. Lugar 0 = laranja.
- Jogo da velha (`TicTacToeState`): `grid` (0 a 8), `last`, `line`. Lugar 0 = X. Mesa no mapa: `tictactoe-table` (Arcade).
- Damas (`CheckersState`), regras brasileiras: `board` (64 casas: 0 vazia, 1/2 pedra/dama das Claras, 3/4 pedra/dama das Escuras), `last` (`path` e `captured`), `kingMoves` (lances seguidos só de damas), `seen` (posições para a repetição), `lost`. Lugar 0 = Claras (começam). Captura obrigatória com lei da maioria, pedra captura para trás, dama voa, promoção só se o lance termina na última linha; empate com 20 lances seguidos só de damas ou a mesma posição três vezes. `checkersMoves(state)` dá os lances legais. Mesa: `checkers-table` (café).
- Dominó (`DominoState`), duplo-seis, de 2 a 4: `active` (quem joga, na ordem), `teamOf` (com 4, duplas 0+2 e 1+3; senão -1), `hands` (**escondido**: na visão de cada um, só a própria mão; as outras vêm `null`; no fim, todas à mostra para contar), `counts`, `stock` (**nunca sai do servidor**: vem `[]`), `stockCount`, `chain` (fileira da esquerda para a direita: `{ tile, a, b, by }`), `ends`, `opener` (maior bucha, que abre), `last`, `pips` (pontos na mão no fim). Fim por batida (`reason: "domino"`) ou tranca (`"locked"`: menos pontos vence; duplas somam). `DOMINO_TILES[id]` dá os números de cada pedra. Mesa: `domino-table` (café, quatro lugares).
- Truco (`TrucoState`), paulista, baralho espanhol de 40 cartas (carta = `naipe * 10 + valor`, valores em `TRUCO_RANKS`: 4 5 6 7 Q J K A 2 3; naipes em `TRUCO_SUITS`: ouros, espadas, copas, paus), de 2 ou 4: `active`, `teamOf`, `score`, `hand` (número da mão), `dealer`, `hands` (**escondido**: só a própria mão; na mão de onze a dupla vê a do parceiro; na mão de ferro ninguém vê nem a própria), `counts`, `vira`, `manilha`, `table` (vaza em andamento), `tricks` (dupla que levou cada vaza, -1 empate), `prevTrick`, `lead`, `stake` (1, 3, 6, 9, 12), `raise` (pedido esperando resposta), `raisedBy`, `eleven`, `deciding`, `iron`, `lastHand`. A semente (`seed`) fica só no servidor. Partida até 12 (`reason: "score"`). Mesa: `cards-table` (café, quatro lugares).

## Cliente

- `apps/web/src/games/api.ts`: `openGame`, `closeGame`, `sendGame`, `useGamesUi().requestSeat(table, seat)` (anda até a cadeira, senta e avisa o servidor), `leaveSeat(table)`.
- `apps/web/src/games/boardTextures.ts`: `boardTexture(table)` devolve uma `THREE.CanvasTexture` (512 px, vista de cima) que se redesenha sozinha; `boardCanvas`/`onBoardRedraw` para o Pixi. Cada pessoa desenha a partir da própria visão, então nada escondido vai parar no tampo.
- `apps/web/src/games/tableArt.ts`: arte própria (cartas com naipes espanhóis, pedras, peças de damas e a cobrinha do dominó), usada pelo painel e pela textura.
- Mesas de mais de dois lugares (`seats > 2`) usam outro arranjo no painel: lugares em grade, botão "Começar partida" e revanche com todos.
- Prévia sem servidor: `http://localhost:5173/src/games/preview.html` (`?mesa=domino-1`, `?eu=bruno`; a barra troca quem você é e mostra a visão dessa pessoa).
