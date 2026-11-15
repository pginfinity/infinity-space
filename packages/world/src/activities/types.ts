/**
 * Atividades: tudo que é interativo e tem estado compartilhado no escritório (gongo, mural,
 * plantas, hockey, fliperamas, quiz...). O servidor guarda o estado e valida os pedidos;
 * o cliente desenha e pede.
 *
 * Fluxo:
 * - cliente → servidor: `{ t: "act", id, op, data }`
 * - servidor → todos (ou alguns): `{ t: "act", act: { id, kind, state } }` (estado completo)
 * - servidor → todos (ou alguns): `{ t: "actev", id, ev, data, from }` (acontecimento pontual)
 */

export interface ActSnapshot {
  /** Id único da atividade (ex.: "gongo", "mural", "hockey-1"). */
  id: string;
  /** Tipo (ex.: "gong", "board", "airhockey"): diz ao cliente quem desenha. */
  kind: string;
  state: unknown;
}
