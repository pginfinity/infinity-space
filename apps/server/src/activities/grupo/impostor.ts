import {
  IMP_CHAT_KEEP,
  IMP_CHAT_MAX,
  IMP_FIRST_TAG_MS,
  IMP_ID,
  IMP_KIND,
  IMP_MAX_PLAYERS,
  IMP_MEETING_MS,
  IMP_MIN_PLAYERS,
  IMP_REPORT_RANGE,
  IMP_RESULT_MS,
  IMP_TAG_COOLDOWN_MS,
  IMP_TAG_RANGE,
  IMP_TASK_MS,
  IMP_TASK_RANGE,
  IMP_TASKS_PER_PLAYER,
  IMP_ZONE,
  grupoClean,
  impPickImpostors,
  impPickTasks,
  impTally,
  impTaskSpots,
  impWinner,
  type ImpPlayer,
  type ImpRole,
  type ImpRoleEvent,
  type ImpState,
  type ImpTaskSpot,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const IDLE_MS = 10 * 60_000;

/**
 * Impostor na Estação.
 *
 * Operações: `join`, `leave`, `start`, `sync`, `taskStart {task}`, `taskDone {task}`, `tag {target}`,
 * `report {body}`, `emergency`, `chat {text}`, `vote {target}`, `again`, `end`.
 * Eventos: `role` e `task` (só para a pessoa), `tagged` (só para quem foi congelado),
 * `start`, `meeting`, `result` e `final` (para todos).
 */
export class ImpostorActivity implements Activity {
  readonly id = IMP_ID;
  readonly kind = IMP_KIND;
  private st: ImpState;
  private readonly spots: Map<string, ImpTaskSpot>;
  private readonly roles = new Map<string, ImpRole>();
  private readonly tasks = new Map<string, string[]>();
  private readonly done = new Map<string, Set<string>>();
  private readonly working = new Map<string, { task: string; at: number }>();
  private readonly nextTag = new Map<string, number>();
  private readonly votes = new Map<string, string>();
  private readonly lastChat = new Map<string, number>();
  private ends = 0;
  private touched = Date.now();

  constructor(private readonly host: ActivityHost) {
    this.spots = new Map(impTaskSpots(host.map, host.nav).map((s) => [s.id, s]));
    this.st = this.empty(0);
  }

  private empty(game: number): ImpState {
    return { phase: "idle", game, owner: null, players: [], impostors: 0, progress: { done: 0, total: 0 }, frozen: [], meeting: null, result: null, final: null, left: 0, duration: 0, emergencies: [] };
  }

  snapshot(): ImpState {
    const timed = this.st.phase === "meeting" || this.st.phase === "result";
    return { ...this.st, left: timed ? Math.max(0, this.ends - Date.now()) : 0 };
  }

  private player(id: string): ImpPlayer | undefined {
    return this.st.players.find((p) => p.id === id);
  }

  private inGame(): boolean {
    return this.st.phase === "playing" || this.st.phase === "meeting" || this.st.phase === "result";
  }

  private alive(id: string): boolean {
    const p = this.player(id);
    return !!p && p.alive && !p.away;
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    switch (op) {
      case "join":
        return this.enter(from);
      case "leave":
        return this.drop(from, false);
      case "start":
        return this.start(from);
      case "sync":
        return this.sendRole(from);
      case "taskStart":
        return this.taskStart(from, d.task);
      case "taskDone":
        return this.taskDone(from, d.task);
      case "tag":
        return this.tag(from, d.target);
      case "report":
        return this.report(from, d.body);
      case "emergency":
        if (this.st.phase === "playing" && this.alive(from) && !this.st.emergencies.includes(from)) {
          this.st.emergencies.push(from);
          this.meeting(from, "emergency", null);
        }
        return;
      case "chat":
        return this.chat(from, d.text);
      case "vote":
        return this.vote(from, d.target);
      case "again":
        return this.again(from);
      case "end":
        if (from === this.st.owner || (this.st.phase === "final" && this.player(from))) this.reset();
        return;
    }
  }

  // ---- sala ----------------------------------------------------------------------------------

  private enter(from: string): void {
    if (this.player(from) && !this.player(from)!.away) return;
    if (this.st.phase !== "idle" && this.st.phase !== "lobby") return;
    if (this.host.playerZone(from)?.id !== IMP_ZONE) return;
    if (this.st.phase === "idle") this.st = { ...this.empty(this.st.game + 1), phase: "lobby", owner: from };
    if (this.st.players.length >= IMP_MAX_PLAYERS) return;
    this.st.players = this.st.players.filter((p) => p.id !== from);
    this.st.players.push({ id: from, name: this.host.playerName(from) ?? "Alguém", alive: true, voted: false });
    if (!this.st.owner || !this.player(this.st.owner)) this.st.owner = from;
    this.touched = Date.now();
    this.host.changed(this);
  }

  private drop(id: string, gone: boolean): void {
    const p = this.player(id);
    if (!p) return;
    if (this.inGame() || (this.st.phase === "final" && gone)) {
      // No meio da partida ninguém some da lista: vira "saiu" (e conta como fora do jogo).
      p.away = true;
      p.alive = false;
      this.working.delete(id);
      // Todo mundo saiu: a sala fecha.
      if (this.st.players.every((x) => x.away)) return this.reset();
      if (this.st.phase === "meeting") this.maybeAllVoted();
      if (!this.inGame() || !this.checkWin()) this.host.changed(this);
    } else {
      this.st.players = this.st.players.filter((x) => x !== p);
      if (this.st.players.length === 0) return this.reset();
      this.host.changed(this);
    }
    if (this.st.owner === id) this.st.owner = this.st.players.find((x) => !x.away)?.id ?? null;
  }

  private start(from: string): void {
    if (this.st.phase !== "lobby" || from !== this.st.owner) return;
    const ids = this.st.players.filter((p) => !p.away).map((p) => p.id);
    if (ids.length < IMP_MIN_PLAYERS) return;
    const impostors = new Set(impPickImpostors(ids, Math.random));
    const spots = [...this.spots.values()];
    this.roles.clear();
    this.tasks.clear();
    this.done.clear();
    this.working.clear();
    this.nextTag.clear();
    const now = Date.now();
    for (const id of ids) {
      const role: ImpRole = impostors.has(id) ? "impostor" : "crew";
      this.roles.set(id, role);
      this.tasks.set(id, impPickTasks(spots, IMP_TASKS_PER_PLAYER, Math.random));
      this.done.set(id, new Set());
      if (role === "impostor") this.nextTag.set(id, now + IMP_FIRST_TAG_MS);
    }
    const crew = ids.length - impostors.size;
    this.st = { ...this.st, phase: "playing", impostors: impostors.size, progress: { done: 0, total: crew * IMP_TASKS_PER_PLAYER }, frozen: [], meeting: null, result: null, final: null, emergencies: [] };
    for (const p of this.st.players) Object.assign(p, { alive: !p.away, voted: false });
    this.touched = now;
    this.host.changed(this);
    this.host.event(this, "start", { game: this.st.game, impostors: impostors.size });
    for (const id of ids) this.sendRole(id);
  }

  private sendRole(to: string): void {
    const role = this.roles.get(to);
    if (!role || !this.inGame() && this.st.phase !== "final") return;
    const partners = role === "impostor" ? [...this.roles].filter(([id, r]) => r === "impostor" && id !== to).map(([id]) => this.player(id)?.name ?? "") : [];
    const ev: ImpRoleEvent = {
      game: this.st.game,
      role,
      partners,
      tasks: this.tasks.get(to) ?? [],
      done: [...(this.done.get(to) ?? [])],
      tagIn: role === "impostor" ? Math.max(0, (this.nextTag.get(to) ?? 0) - Date.now()) : 0,
    };
    this.host.event(this, "role", ev, { to: [to] });
  }

  private again(from: string): void {
    if (this.st.phase !== "final" || !this.player(from)) return;
    const players = this.st.players.filter((p) => !p.away).map((p) => ({ ...p, alive: true, voted: false }));
    const owner = players.some((p) => p.id === this.st.owner) ? this.st.owner : from;
    this.st = { ...this.empty(this.st.game + 1), phase: "lobby", owner, players };
    this.roles.clear();
    this.touched = Date.now();
    this.host.changed(this);
  }

  private reset(): void {
    this.st = this.empty(this.st.game);
    this.roles.clear();
    this.working.clear();
    this.votes.clear();
    this.host.changed(this);
  }

  // ---- tarefas -------------------------------------------------------------------------------

  private taskStart(from: string, task: unknown): void {
    if (this.st.phase !== "playing" || typeof task !== "string") return;
    const p = this.player(from);
    const spot = this.spots.get(task);
    if (!p || p.away || !spot || !this.tasks.get(from)?.includes(task) || this.done.get(from)?.has(task)) return;
    if (!this.host.near(from, spot.point, IMP_TASK_RANGE)) return;
    this.working.set(from, { task, at: Date.now() });
  }

  private taskDone(from: string, task: unknown): void {
    if (this.st.phase !== "playing" || typeof task !== "string") return;
    const w = this.working.get(from);
    const spot = this.spots.get(task);
    if (!w || w.task !== task || !spot) return;
    if (Date.now() - w.at < IMP_TASK_MS - 300 || !this.host.near(from, spot.point, IMP_TASK_RANGE)) return;
    this.working.delete(from);
    const set = this.done.get(from);
    if (!set || set.has(task)) return;
    set.add(task);
    // Tarefa de infiltrado é fachada: não conta para o time.
    if (this.roles.get(from) === "crew") this.st.progress.done++;
    this.host.event(this, "task", { task }, { to: [from] });
    if (!this.checkWin()) this.host.changed(this);
  }

  // ---- congelar e reportar -------------------------------------------------------------------

  private tag(from: string, target: unknown): void {
    if (this.st.phase !== "playing" || typeof target !== "string") return;
    if (this.roles.get(from) !== "impostor" || !this.alive(from) || !this.alive(target) || this.roles.get(target) !== "crew") return;
    const now = Date.now();
    if (now < (this.nextTag.get(from) ?? Infinity)) return;
    const at = this.host.playerPos(target);
    if (!at || !this.host.near(from, at, IMP_TAG_RANGE)) return;
    const p = this.player(target)!;
    p.alive = false;
    this.working.delete(target);
    this.st.frozen.push({ id: target, name: p.name, x: at.x, z: at.z });
    this.nextTag.set(from, now + IMP_TAG_COOLDOWN_MS);
    this.host.event(this, "tagged", { by: "?" }, { to: [target] });
    this.sendRole(from);
    if (!this.checkWin()) this.host.changed(this);
  }

  private report(from: string, body: unknown): void {
    if (this.st.phase !== "playing" || !this.alive(from) || typeof body !== "string") return;
    const f = this.st.frozen.find((x) => x.id === body);
    if (!f || !this.host.near(from, { x: f.x, z: f.z }, IMP_REPORT_RANGE)) return;
    this.meeting(from, "report", f.name);
  }

  // ---- reunião -------------------------------------------------------------------------------

  private meeting(by: string, reason: "report" | "emergency", body: string | null): void {
    this.votes.clear();
    this.working.clear();
    for (const p of this.st.players) p.voted = false;
    this.st.phase = "meeting";
    this.st.meeting = { by: this.player(by)?.name ?? "Alguém", reason, body, chat: [] };
    this.st.result = null;
    this.st.duration = IMP_MEETING_MS;
    this.ends = Date.now() + IMP_MEETING_MS;
    this.touched = Date.now();
    this.host.changed(this);
    this.host.event(this, "meeting", { by: this.st.meeting.by, reason, body });
  }

  private chat(from: string, raw: unknown): void {
    if (this.st.phase !== "meeting" || !this.st.meeting || !this.alive(from)) return;
    const now = Date.now();
    if (now - (this.lastChat.get(from) ?? 0) < 900) return;
    const text = grupoClean(raw, IMP_CHAT_MAX);
    if (!text) return;
    this.lastChat.set(from, now);
    this.st.meeting.chat = [...this.st.meeting.chat, { name: this.player(from)!.name, text }].slice(-IMP_CHAT_KEEP);
    this.host.changed(this);
  }

  private vote(from: string, target: unknown): void {
    if (this.st.phase !== "meeting" || !this.alive(from) || this.votes.has(from) || typeof target !== "string") return;
    if (target !== "skip" && !this.alive(target)) return;
    this.votes.set(from, target);
    this.player(from)!.voted = true;
    this.host.changed(this);
    this.maybeAllVoted();
  }

  private maybeAllVoted(): void {
    if (this.st.phase !== "meeting") return;
    const alive = this.st.players.filter((p) => p.alive && !p.away);
    if (alive.every((p) => this.votes.has(p.id))) this.resolve();
  }

  private resolve(): void {
    const valid = new Map([...this.votes].filter(([id]) => this.alive(id)));
    const { ejected, tie } = impTally(valid);
    const p = ejected ? this.player(ejected) : undefined;
    if (p) p.alive = false;
    this.st.phase = "result";
    this.st.result = { ejected: p?.name ?? null, wasImpostor: p ? this.roles.get(p.id) === "impostor" : null, tie };
    this.st.frozen = [];
    this.st.duration = IMP_RESULT_MS;
    this.ends = Date.now() + IMP_RESULT_MS;
    this.touched = Date.now();
    this.host.changed(this);
    this.host.event(this, "result", this.st.result);
  }

  private checkWin(): boolean {
    let crew = 0;
    let imps = 0;
    for (const p of this.st.players) {
      if (!p.alive || p.away) continue;
      if (this.roles.get(p.id) === "impostor") imps++;
      else crew++;
    }
    const w = impWinner({ crew, impostors: imps }, this.st.progress);
    if (!w) return false;
    this.finish(w);
    return true;
  }

  private finish(winner: ImpRole): void {
    const impostors = [...this.roles].filter(([, r]) => r === "impostor").map(([id]) => this.player(id)?.name ?? "");
    this.st.phase = "final";
    this.st.final = { winner, impostors };
    this.st.meeting = null;
    this.touched = Date.now();
    for (const p of this.st.players) if (!p.away && this.roles.get(p.id) === winner) this.host.emote(p.id, "dance");
    this.host.changed(this);
    this.host.event(this, "final", this.st.final);
  }

  tick(): void {
    const now = Date.now();
    const ph = this.st.phase;
    if (ph === "meeting" && now >= this.ends) this.resolve();
    else if (ph === "result" && now >= this.ends) {
      if (this.checkWin()) return;
      this.st.phase = "playing";
      this.st.meeting = null;
      // Depois da reunião, os infiltrados esperam um pouco antes de congelar de novo.
      for (const [id, r] of this.roles) if (r === "impostor") this.nextTag.set(id, Math.max(this.nextTag.get(id) ?? 0, now + IMP_FIRST_TAG_MS));
      this.host.changed(this);
      for (const [id, r] of this.roles) if (r === "impostor") this.sendRole(id);
    } else if ((ph === "lobby" || ph === "final") && now - this.touched > IDLE_MS) this.reset();
  }

  leave(id: string): void {
    this.lastChat.delete(id);
    this.drop(id, true);
  }
}
