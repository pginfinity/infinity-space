import { fork, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REC_EMPTY_MS, REC_ID, REC_KIND, REC_MAX_MS, recGroup, recordable, type RecSession, type RecState } from "@infinity/world";
import type { Activity, ActivityHost } from "../activities/types.ts";
import { DATA_DIR } from "../store.ts";
import { RTC, recorderToken } from "../rtc.ts";
import { driveConfigured, uploadToDrive } from "./drive.ts";
import { cleanLine, MAX_LINES, meetStamp, transcriptText, type Line } from "./transcript.ts";

const here = dirname(fileURLToPath(import.meta.url));
const WORKER = join(here, "worker.ts");
const DIR = join(DATA_DIR, "gravacoes");
const PENDING_KEY = "gravacoes/pendentes";
const TZ = process.env.TZ_DISPLAY ?? "America/Sao_Paulo";
/** Depois de terminar, o aviso some em 3 minutos. */
const LINGER_MS = 3 * 60 * 1000;

function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const p = createRequire(import.meta.url)("ffmpeg-static") as string | null;
    if (p && existsSync(p)) return p;
  } catch {
    // sem o pacote: usa o do sistema
  }
  return "ffmpeg";
}

interface Pending {
  file: string;
  name: string;
  description: string;
  /** Transcrição: vira Google Doc no Drive. */
  doc?: boolean;
}

interface Live {
  session: RecSession;
  worker: ChildProcess | null;
  file: string;
  participants: Set<string>;
  /** Falas transcritas pelos navegadores de quem está na sala. */
  lines: Line[];
  emptySince: number | null;
  endedAt: number;
}

/** O que a sala do mundo oferece ao gravador. */
export interface RecordingRoom {
  /** Ids de quem está agora num grupo de salas. */
  membersIn(group: string): string[];
}

/**
 * Gravação de reuniões (atividade "gravacao").
 * Operações: `start` (grava a sala onde a pessoa está), `stop` (encerra a gravação da sala onde a pessoa está),
 * `fala` `{ text }` (frase da própria pessoa, transcrita pelo navegador dela, para a transcrição).
 * Eventos: `started` e `finished` `{ group, room, by?, link?, note? }` para quem está na sala.
 */
export class RecordingActivity implements Activity {
  readonly id = REC_ID;
  readonly kind = REC_KIND;
  private readonly live = new Map<string, Live>();
  private retryTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly host: ActivityHost,
    private readonly room: RecordingRoom,
  ) {
    mkdirSync(DIR, { recursive: true });
    // Gravações que ficaram salvas sem Drive: tenta enviar agora e a cada 10 minutos.
    this.retryTimer = setInterval(() => void this.retryPending(), 10 * 60 * 1000);
    void this.retryPending();
  }

  /** Este grupo de salas está sendo gravado? (o servidor libera as vozes dele para o gravador) */
  isRecording(group: string): boolean {
    const s = this.live.get(group)?.session.status;
    return s === "starting" || s === "recording";
  }

  snapshot(): RecState {
    const sessions: Record<string, RecSession> = {};
    for (const [g, l] of this.live) sessions[g] = l.session;
    return { sessions };
  }

  handle(from: string, op: string, data?: unknown): void {
    const zone = this.host.playerZone(from);
    if (!recordable(zone)) return;
    const group = recGroup(zone);
    if (op === "start") this.start(from, group, zone.name);
    if (op === "stop" && this.isRecording(group)) this.stop(group);
    if (op === "fala") this.say(from, group, data);
  }

  /** Frase de quem está na sala gravada, enquanto grava. */
  private say(from: string, group: string, data: unknown): void {
    const l = this.live.get(group);
    const text = cleanLine(data);
    if (!l || l.session.status !== "recording" || !text || l.lines.length >= MAX_LINES) return;
    l.lines.push({ at: Date.now() - l.session.startedAt, name: this.host.playerName(from) ?? "Alguém", text });
  }

  tick(): void {
    const now = Date.now();
    for (const [group, l] of this.live) {
      if (this.isRecording(group)) {
        const members = this.room.membersIn(group);
        for (const id of members) {
          const n = this.host.playerName(id);
          if (n) l.participants.add(n);
        }
        if (members.length === 0) l.emptySince ??= now;
        else l.emptySince = null;
        if ((l.emptySince && now - l.emptySince > REC_EMPTY_MS) || now - l.session.startedAt > REC_MAX_MS) this.stop(group);
      } else if (l.endedAt && now - l.endedAt > LINGER_MS) {
        this.live.delete(group);
        this.host.changed(this);
      }
    }
  }

  dispose(): void {
    clearInterval(this.retryTimer);
    for (const group of this.live.keys()) if (this.isRecording(group)) this.stop(group);
  }

  private start(from: string, group: string, roomName: string): void {
    if (this.isRecording(group) || this.live.get(group)?.session.status === "saving") return;
    const by = this.host.playerName(from) ?? "Alguém";
    const startedAt = Date.now();
    const file = join(DIR, `${group}-${stamp(startedAt)}.ogg`);
    const session: RecSession = { group, room: roomName, status: "starting", startedAt, by };
    const l: Live = { session, worker: null, file, participants: new Set([by]), lines: [], emptySince: null, endedAt: 0 };
    this.live.set(group, l);
    this.host.changed(this);

    const worker = fork(WORKER, [], { execArgv: ["--import", "tsx"], stdio: ["ignore", "inherit", "inherit", "ipc"] });
    l.worker = worker;
    worker.on("message", (m: { t: string; message?: string; ms?: number }) => {
      if (m.t === "ready") {
        session.status = "recording";
        this.host.changed(this);
        this.host.event(this, "started", { group, room: roomName, by }, { to: this.room.membersIn(group) });
        console.log(`[gravação] ${roomName}: começou (por ${by})`);
      } else if (m.t === "error") {
        console.error(`[gravação] ${roomName}: ${m.message}`);
        session.note = "O gravador falhou. Tente de novo.";
      } else if (m.t === "stopped") {
        void this.finish(l, m.ms ?? 0);
      }
    });
    worker.on("exit", (code) => {
      l.worker = null;
      if (session.status === "starting" || session.status === "recording") {
        // Saiu sem avisar: guarda o que já foi gravado.
        void this.finish(l, Date.now() - startedAt, code !== 0);
      }
    });
    void recorderToken(group).then((token) =>
      worker.send({ t: "start", url: RTC.internalUrl, token, file, ffmpeg: ffmpegPath() }),
    );
  }

  private stop(group: string): void {
    const l = this.live.get(group);
    if (!l) return;
    if (l.session.status === "starting" || l.session.status === "recording") {
      l.session.status = "saving";
      this.host.changed(this);
      if (l.worker?.connected) l.worker.send({ t: "stop" });
      else void this.finish(l, Date.now() - l.session.startedAt);
    }
  }

  private async finish(l: Live, ms: number, crashed = false): Promise<void> {
    if (l.endedAt) return;
    l.endedAt = Date.now();
    const s = l.session;
    s.status = "saving";
    this.host.changed(this);
    const ok = existsSync(l.file) && statSync(l.file).size > 1024;
    if (!ok) {
      s.status = "error";
      s.note = crashed ? "O gravador caiu antes de salvar." : "Nada foi gravado (ninguém falou?).";
      this.host.changed(this);
      return;
    }
    const name = `${s.room} · ${human(s.startedAt, "file")}.ogg`;
    const minutes = Math.max(1, Math.round(ms / 60000));
    const description = `Gravação do Infinity Space. ${s.room}, ${human(s.startedAt, "long")} (${minutes} min). Participantes: ${[...l.participants].join(", ")}. Iniciada por ${s.by}.`;
    const to = this.room.membersIn(s.group);
    const doc = l.lines.length ? this.saveTranscript(l, description) : null;
    if (driveConfigured()) {
      try {
        const up = await uploadToDrive(l.file, { name, description });
        s.status = "uploaded";
        s.link = up.link;
        console.log(`[gravação] ${s.room}: enviada ao Drive (${up.id})`);
      } catch (e) {
        console.error(`[gravação] ${s.room}: envio ao Drive falhou:`, e);
        this.addPending({ file: l.file, name, description });
        s.status = "saved";
        s.note = "Salva no servidor. O envio ao Drive será tentado de novo.";
      }
    } else {
      this.addPending({ file: l.file, name, description });
      s.status = "saved";
      s.note = "Salva no servidor. Vai para o Drive assim que a conta do Google for configurada.";
    }
    if (doc && driveConfigured()) {
      await uploadToDrive(doc.file, doc).catch((e) => {
        console.error(`[gravação] ${s.room}: transcrição não foi ao Drive:`, e);
        this.addPending(doc);
      });
    } else if (doc) this.addPending(doc);
    this.host.changed(this);
    this.host.event(this, "finished", { group: s.group, room: s.room, link: s.link, note: s.note }, { to });
  }

  /** Grava a transcrição ao lado do áudio, com o nome que o Portal de Reuniões reconhece. */
  private saveTranscript(l: Live, description: string): Pending {
    const s = l.session;
    const name = `Infinity Space · ${s.room} - ${meetStamp(s.startedAt, TZ)} - Transcrição`;
    const file = l.file.replace(/\.ogg$/, ".txt");
    writeFileSync(file, transcriptText(name, [...l.participants], l.lines));
    return { file, name, description, doc: true };
  }

  private addPending(p: Pending): void {
    const list = this.host.store.get<Pending[]>(PENDING_KEY, []);
    this.host.store.set(PENDING_KEY, [...list.filter((x) => x.file !== p.file), p]);
  }

  private async retryPending(): Promise<void> {
    if (!driveConfigured()) return;
    const list = this.host.store.get<Pending[]>(PENDING_KEY, []);
    if (!list.length) return;
    const left: Pending[] = [];
    for (const p of list) {
      if (!existsSync(p.file)) continue;
      try {
        await uploadToDrive(p.file, p);
        console.log(`[gravação] pendente enviada: ${p.name}`);
      } catch {
        left.push(p);
      }
    }
    this.host.store.set(PENDING_KEY, left);
  }
}

function stamp(at: number): string {
  return new Date(at).toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

function human(at: number, style: "file" | "long"): string {
  const d = new Date(at);
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return style === "file" ? `${date.replace(/\//g, "-")} ${time.replace(":", "h")}` : `${date} às ${time}`;
}
