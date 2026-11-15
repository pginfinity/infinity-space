/**
 * Teste de fumaça do servidor do mundo: dois clientes entram, um anda, o outro vê, um sai.
 * Uso: com o servidor rodando, `npx tsx apps/server/scripts/smoke.ts [ws://localhost:2567/ws]`
 */
import { Packr } from "msgpackr";
import WebSocket from "ws";
import { PROTOCOL_VERSION, DEFAULT_LOOK, type ServerMsg, type ClientMsg } from "@infinity/world";

const url = process.argv[2] ?? "ws://localhost:2567/ws";
const packr = new Packr({ useRecords: false });

function client(name: string): Promise<{ ws: WebSocket; you: string; inbox: ServerMsg[]; send: (m: ClientMsg) => void; spawn: { x: number; z: number } }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox: ServerMsg[] = [];
    const send = (m: ClientMsg) => ws.send(packr.pack(m));
    ws.on("open", () => send({ t: "hello", v: PROTOCOL_VERSION, name, look: DEFAULT_LOOK, lens: "2d" }));
    ws.on("message", (raw) => {
      const msg = packr.unpack(raw as Buffer) as ServerMsg;
      inbox.push(msg);
      if (msg.t === "welcome") {
        const p = msg.poses.find((x) => x[0] === msg.you)!;
        resolve({ ws, you: msg.you, inbox, send, spawn: { x: p[1], z: p[2] } });
      }
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error(`${name}: sem welcome em 3 s`)), 3000);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "✔" : "✘"} ${label}`);
  if (!ok) process.exitCode = 1;
};

const a = await client("Ana");
const b = await client("Bruno");
await sleep(150);
check(a.inbox.some((m) => m.t === "join" && m.player.id === b.you), "Ana recebeu a entrada do Bruno");

a.send({ t: "pose", x: a.spawn.x, z: a.spawn.z - 0.5, yaw: 0, anim: 1 });
await sleep(250);
check(
  b.inbox.some((m) => m.t === "poses" && m.list.some((p) => p[0] === a.you && Math.abs(p[2] - (a.spawn.z - 0.5)) < 0.01)),
  "Bruno viu a Ana andar",
);

a.send({ t: "pose", x: 0, z: 0, yaw: 0, anim: 1 });
await sleep(150);
check(a.inbox.some((m) => m.t === "correct"), "servidor recusou a Ana teleportando para dentro da escultura");

a.send({ t: "info", patch: { status: "focus", name: "Ana Paula" } });
await sleep(150);
check(b.inbox.some((m) => m.t === "info" && m.id === a.you && m.patch.status === "focus"), "Bruno viu o status da Ana mudar");

a.ws.close();
await sleep(200);
check(b.inbox.some((m) => m.t === "leave" && m.id === a.you), "Bruno viu a Ana sair");
b.ws.close();
await sleep(100);
process.exit();
