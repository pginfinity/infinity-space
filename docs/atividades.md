# Atividades: como adicionar coisas interativas

Tudo que é interativo e tem estado compartilhado (gongo, mural, plantas, hockey, fliperamas, quiz) é uma **atividade**. O servidor guarda o estado e confere cada pedido; o cliente desenha e pede. A implementação de referência é o **gongo** (`escritorio/gong`): leia os três arquivos dele antes de começar.

## Onde fica cada coisa

Cada pacote tem uma pasta com o mesmo nome em três lugares. Criar a pasta com um `index` basta: servidor e cliente carregam sozinhos.

| Lado | Pasta | O que vai lá |
|---|---|---|
| Regras puras | `packages/world/src/activities/<pacote>/` | Constantes, tipos do estado, física e regras sem efeitos colaterais. Exporte pelo `index.ts` do pacote, com nomes prefixados (`GONG_`, `HOCKEY_`). Testes com vitest ao lado (`*.test.ts`). |
| Servidor | `apps/server/src/activities/<pacote>/` | `index.ts` com `export default (host) => Activity[]`. Uma classe por atividade. |
| Cliente | `apps/web/src/activities/<pacote>/` | `index.ts` que chama `registerActivity(...)`. Textos em `strings.ts`, sons em `sounds.json`. |

## Servidor (`apps/server/src/activities/types.ts`)

```ts
interface Activity {
  id: string;            // único: "gongo", "hockey-1"
  kind: string;          // diz ao cliente quem desenha: "gong", "airhockey"
  snapshot(): unknown;   // estado completo enviado a todos
  handle(from, op, data) // pedido de uma pessoa; data NÃO é confiável
  tick?(dt)              // 15 Hz; física mais rápida usa timer próprio (limpe em dispose)
  join?(id) / leave?(id) / dispose?()
}
```

O `host` oferece: `changed(this)` (manda o snapshot no fim do tique), `event(this, ev, data, { to, from })` (acontecimento pontual), `players()`, `playerName`, `playerPos`, `playerZone`, `near(id, ponto, metros)` (perto e sem parede no meio), `emote(id, e)`, `setHeld(id, item)`, `objects(tipo)`, `map`, `nav`, `zones` e `store`. Também: `hearers(id)` (quem ouve a pessoa agora, com a regra completa da sala: paredes, salas, palco, portas, roda fechada e sussurro; use para qualquer coisa que deva chegar só a quem ouve), `teleport(id, ponto)` (salto autorizado pela atividade, conferido pela sala) e `playerEmail(id)` (com login ligado, para conferir papéis pela conta e não pelo nome).

- **Um jogo por vez:** jogos com lugar implementam `seatLabel`, `inMatchFor` e `releaseSeat`, e chamam `host.claimSeat(id, this)` antes de sentar alguém: quem estava só esperando em outro jogo sai de lá; quem está no meio de uma partida recebe um aviso (`host.notify`).
- **Persistência:** `host.store.get(chave, padrão)` e `host.store.set(chave, valor)`. A chave começa pelo pacote (`"escritorio/gongo"`). Os arquivos JSON vão para `DATA_DIR`, que fica fora do Git.
- **Limite:** cada pessoa manda no máximo 90 pedidos por segundo para as atividades.
- **Rótulos na cena:** use o `Html` de `apps/web/src/scene/Html.tsx`, não o do drei (o do drei quebrava a troca de lente com `removeChild`).
- **Privacidade:** o que é "perto" segue `host.hearers`. O indicador de quem fala, no cliente, só acende para quem a pessoa ouve.
- **Estado grande ou frequente:** o snapshot vai inteiro a cada mudança. Física a 30 Hz vai por `event` (`"frame"`), só para quem joga ou assiste.

## Cliente (`apps/web/src/activities/registry.ts`)

```ts
registerActivity({
  name: "pacote/coisa",
  kinds: ["gong"],                 // eventos e estado que entende
  objects: ["gong"],               // assume a interação (E) desses tipos de objeto
  label: (o) => "Tocar o gongo",   // texto do botão de interação
  use: (o) => { ... },             // ao apertar E
  targets: () => [...],            // alvos que não são objetos: robô, outra pessoa, avião no chão
  onEvent: (e) => { ... },         // { id, kind, ev, data, from }
  Overlay: Componente,             // UI por cima do mundo (HTML)
  Scene: Componente,               // coisas no mundo (R3F), nas duas lentes
});
```

- **Estado:** `useAct<T>(id)` no React, `actState<T>(id)` fora dele (por exemplo, dentro de `useFrame`). `actsOfKind(kind)` lista todas as atividades de um tipo.
- **Pedido:** `sendAct(id, op, data)`.
- **Som:** `sfx(nome, { at, volume, range })` toca `/sfx/<nome>.mp3`. Enquanto o arquivo não existe, toca o sintetizado registrado com `registerSynth(nome, fn)`, ou um "plim". Com `at`, o volume cai com a distância e o som fica abafado atrás de parede. Cada som novo entra em `sounds.json` do pacote (prompt em inglês e duração), para os scripts locais gerarem depois.
- **Efeitos de avatar:** `setAvatarEffect(id, { ghost: true })` (de `avatar/effects.ts`) deixa o avatar como fantasma translúcido, só no cliente.
- **Relógio:** `serverNow()` (de `net/session.ts`) dá a hora do servidor, para contagens iguais para todos.
- **Objetos de parede no 2D:** quem desenha sobre um objeto de parede usa `useWallVisible(id)` (de `scene/wallFacing.ts`), porque no 2D o objeto de costas para a câmera some.
- **Pessoas:** `self`, `sampleRemote(id)` e `remoteIds()` vêm de `world/registry.ts`. Nomes e status ficam em `useApp` (`state/store.ts`). O campo `held` da pessoa é o item na mão; `note` é o status curto.
- **Avisos e cartões do lado esquerdo:** nada de posição fixa (`absolute left-3 top-[...]`), que um cobre o outro. Use `<InStack side="top-left" | "bottom-left" order={n}>` de `ui/HudStack.tsx`: a pilha de cima desce a partir do status; a de baixo sobe a partir das dicas de controle. Ordem atual em cima: presença (0), gravação (1), daily (2), primeiros passos (3), aviõezinhos (4); embaixo: item na mão (0), Orbi (1), última mesa (2).
- **Toast com complemento:** `toast(texto, ms, { sub })` (de `ui/toasts.ts`) mostra um complemento pequeno e apagado depois do texto.
- **Mensagens que não saem do cliente:** `registerChatInterceptor(fn)` (de `activities/chat/intercept.ts`); se `fn(texto)` devolver true, o campo limpa e nada vai para a rede.
- **Busca (Ctrl+K):** `registerPersonCommand` (ação por pessoa, ex.: "Mensagem para Ana") e `registerCommand` (ação geral, ex.: "Minha mesa", "Primeiros passos"), ambos de `presence/store.ts`.
- **Atalho novo:** acrescente na lista de atalhos (`onboarding/Shortcuts.tsx`, tecla ?). Se for algo essencial, pense se entra nos primeiros passos (`onboarding/steps.ts`).

## Regras da casa

- **Um mundo, duas lentes.** O que a `Scene` desenha aparece no 2D isométrico e no 3D. Teste nas duas.
- **Movimento sem React.** Nada que mexe a 60 fps passa pelo React: use `useFrame` e refs, sem alocar objetos por quadro.
- **Leve.** `InstancedMesh` quando houver muitas cópias e poucos draw calls. O escritório precisa rodar em PC fraco.
- **O servidor confere tudo.** Distância (`host.near`), vez, limites, tipos e textos (corte e limpe).
- **Presença, não vigilância.** Nenhuma métrica individual de tempo, atividade ou fala. Contador do time e ranking de jogo podem.
- **Jogos originais.** Nada de recriar jogo existente: nome, personagens, arte ou fases.
- **Textos em pt-BR, marca da `docs/marca.md`.** Laranja como único destaque por tela; o gradiente da estrela só em momentos especiais. Tokens de cor em `apps/web/src/styles.css`.
- **UI de ferramenta.** Densa e clara, operável por teclado (Esc fecha, foco visível, `aria-label`), sem padrão de landing page.
- **Móveis novos.** Tipo em `ObjectType` (`packages/world/src/map/types.ts`), entrada no `CATALOG`, modelo procedural em `apps/web/src/scene/furniture/` registrado no `MODELS` do `index.ts`, e posição no mapa (`map/estacao.ts`). Os testes do mapa (`world.test.ts`) precisam continuar passando.

## Próximas melhorias da base

Pedidas pelos pacotes, ao construir os jogos e interações:

- **Interação:** prioridade entre alvos, mais de uma ação por alvo, "segurar E", raio por tipo no catálogo e objetos sem `action` assumíveis por atividade.
- **Avatar:** `faceTowards(yaw)` no movimento e um ponto de ancoragem para balões acima da etiqueta de nome.
- **Áudio:** um contexto de áudio compartilhado entre `sfx`, jukebox e vozes.
- **TVs:** API para uma atividade ocupar a tela de uma TV (hoje cada pacote desenha um plano na frente).
- **Host:** `playerHeld(id)` e `flush()` imediato para timers próprios. (Chamar e teleportar já existem pelo pacote presença e por `host.teleport`.)
- **Portas:** readmitir pelo e-mail depois de uma reconexão (com o login ligado, o id muda mas a conta é a mesma).
