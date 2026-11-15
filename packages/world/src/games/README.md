# Jogos

Cada jogo é um módulo com regras puras aqui (`packages/world/src/games/<jogo>.ts`), usado pelo servidor para validar jogadas e pelo cliente para desenhar o estado.

- Mesas de jogo são objetos do mapa com `gameId` (ex.: `arcade-xadrez-1`) e um tipo (`chess-table`, `connect4-table`...).
- Cliente → servidor: `{ t: "game", table, op, data }` (ex.: `op: "sit"`, `op: "move"`).
- Servidor → todos: `{ t: "game", game: GameSnapshot }` sempre que o estado muda. Quem assiste recebe o mesmo estado de quem joga.
- O `welcome` traz o estado de todas as mesas.
