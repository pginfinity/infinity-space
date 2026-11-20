import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ORBI_ASK_MAX, ZoneIndex, buildStationMap, type Zone } from "@infinity/world";
import { FakeHost } from "../arcade/fakehost.ts";
import { ORBI_TEXT, OrbiAskActivity, type AskFn } from "./orbiAsk.ts";

const MAP = buildStationMap();
const ZONES = new ZoneIndex(MAP.zones);
const OFFICE = MAP.zones.find((z) => z.kind === "office")!;

class Host extends FakeHost {
  override readonly map = MAP;
  emails = new Map<string, string>();
  override playerZone(id: string): Zone | undefined {
    const p = this.pos.get(id);
    return p ? ZONES.zoneAt(p) : undefined;
  }
  playerEmail(id: string): string | undefined {
    return this.emails.get(id);
  }
}

type Params = Parameters<AskFn>[0];
const NOW = Date.UTC(2026, 10, 20, 15, 0);
const dir = mkdtempSync(join(tmpdir(), "space-orbi-"));
const put = (name: string, text: string, ageMs = 60_000) => {
  writeFileSync(join(dir, name), text);
  const t = new Date(NOW - ageMs);
  utimesSync(join(dir, name), t, t);
};
put("eclipse-2026-11-20-12-00.txt", "Infinity Space · Sala Eclipse - Transcrição\nParticipantes: Ana, Bia\n\nTranscrição\nAna: decidimos lançar na sexta\n");
put(`${OFFICE.group ?? OFFICE.id}-2026-11-20-11-00.txt`, "Suíte\nParticipantes: Diretor\n\nTranscrição\nDiretor: assunto da diretoria\n");
put("eclipse-2026-11-01-10-00.txt", "Velha\nParticipantes: Ana\n\nTranscrição\nAna: reunião antiga\n", 9 * 24 * 60 * 60 * 1000);
put("eclipse-2026-11-20-13-00.ogg", "áudio");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("perguntas ao Orbi", () => {
  let host: Host;
  let calls: Params[];
  let reply: Awaited<ReturnType<AskFn>> | Error;
  let act: OrbiAskActivity;
  const answers = () => host.events.filter((e) => e.ev === "answer");

  beforeEach(() => {
    host = new Host();
    host.add("ana", "Ana", { x: -20, z: -1 });
    host.add("bia", "Bia", { x: 0, z: -5.5 });
    calls = [];
    reply = { stop_reason: "end_turn", content: [{ type: "text", text: "A Ana está na Sala Eclipse.", citations: null }] };
    const ask: AskFn = async (p) => {
      calls.push(p);
      if (reply instanceof Error) throw reply;
      return reply;
    };
    act = new OrbiAskActivity(host, ask, dir, () => NOW);
  });

  it("pergunta ao Claude com quem está online e as reuniões gravadas, e responde só para quem perguntou", async () => {
    act.handle("bia", "ask", { q: "  onde está   a Ana? " });
    await vi.waitFor(() => expect(answers()).toHaveLength(1));
    expect(answers()[0]).toEqual({ ev: "answer", data: { q: "onde está a Ana?", text: "A Ana está na Sala Eclipse." }, to: ["bia"] });
    const [p] = calls;
    expect(p).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "low" }, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    const system = p!.system as Array<{ text: string; cache_control?: unknown }>;
    expect(system[1]!.cache_control).toEqual({ type: "ephemeral" });
    // Só a reunião recente de sala de reunião: diretoria, gravação velha e áudio ficam de fora.
    expect(system[1]!.text).toContain("decidimos lançar na sexta");
    expect(system[1]!.text).not.toContain("diretoria");
    expect(system[1]!.text).not.toContain("reunião antiga");
    const user = p!.messages[0]!.content as string;
    expect(user).toContain("- Ana: Sala Eclipse");
    expect(user).toContain("Pergunta de Bia: onde está a Ana?");
  });

  it("recusa e erro viram resposta educada; pergunta vazia é ignorada e a longa é cortada", async () => {
    reply = { stop_reason: "refusal", content: [{ type: "text", text: "não leia isto", citations: null }] };
    act.handle("ana", "ask", { q: "x".repeat(ORBI_ASK_MAX + 50) });
    act.handle("bia", "ask", { q: "   " });
    act.handle("bia", "ask", null);
    await vi.waitFor(() => expect(answers()).toHaveLength(1));
    expect(answers()[0]!.data).toEqual({ q: "x".repeat(ORBI_ASK_MAX), text: ORBI_TEXT.refused });
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    reply = new Error("rede");
    act.handle("ana", "ask", { q: "e agora?" });
    await vi.waitFor(() => expect(answers()).toHaveLength(2));
    expect(answers()[1]!.data).toEqual({ q: "e agora?", text: ORBI_TEXT.failed });
    expect(calls).toHaveLength(2);
  });

  it("uma pergunta de cada vez e no máximo 8 a cada 10 minutos por conta", async () => {
    host.emails.set("ana", "ana@x");
    act.handle("ana", "ask", { q: "1" });
    act.handle("ana", "ask", { q: "ignorada, a primeira ainda não voltou" });
    await vi.waitFor(() => expect(answers()).toHaveLength(1));
    for (let i = 2; i <= 8; i++) {
      act.handle("ana", "ask", { q: String(i) });
      await vi.waitFor(() => expect(answers()).toHaveLength(i));
    }
    // Reconectou com outro id: a conta é a mesma.
    host.add("ana2", "Ana", { x: -20, z: -1 });
    host.emails.set("ana2", "ana@x");
    act.handle("ana2", "ask", { q: "9" });
    expect(answers().at(-1)).toEqual({ ev: "answer", data: { q: "9", text: ORBI_TEXT.limit }, to: ["ana2"] });
    expect(calls).toHaveLength(8);
  });
});
