import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { clsx } from "clsx";
import {
  BellRing,
  Box,
  DoorOpen,
  LocateFixed,
  Map as MapIcon,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PictureInPicture2,
  Route,
  Search,
  Settings2,
  UserRoundCog,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import type { Status } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { setCam, setMic, startShare, stopShare, useMedia } from "../media/rtc.ts";
import { guideItems } from "../ui/guide.ts";
import { STATUS_COLOR } from "../world/theme.ts";
import { sampleRemote } from "../world/registry.ts";
import { placeName } from "../world/zoneLabel.ts";
import { world } from "../world/world.ts";
import { AvatarFace } from "../ui/AvatarFace.tsx";
import { askFollow, callPerson, callWait, goToPerson, goToPlace, goToRoom, stopFollowing } from "./actions.ts";
import { commandList, personCommandList, usePresence } from "./store.ts";
import { setMyStatus } from "./status.ts";
import { rank } from "./search.ts";
import { T } from "./strings.ts";
import { canPip, openPip, usePip } from "./pip.ts";

/**
 * Busca e comandos (Ctrl+K / Cmd+K): pessoas (ir até, chamar, seguir, mensagem quando houver),
 * salas, lugares do guia e ações (lente, microfone, câmera, tela, ajustes, status).
 * Setas navegam, Enter executa, Esc fecha; a busca ignora acentos.
 */

type Group = "people" | "actions" | "rooms" | "places";
const GROUPS: Group[] = ["people", "actions", "rooms", "places"];

interface Cmd {
  id: string;
  group: Group;
  label: string;
  hint?: string;
  keywords?: string;
  icon: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  /** Rótulo do Enter na linha ativa ("Ir até"). */
  enter?: string;
  /** Só aparece quando há algo digitado (ações por pessoa: "Chamar Ana"). */
  onlyQuery?: boolean;
  run(): void;
}

export function openPalette(): void {
  usePresence.setState({ paletteOpen: true });
}

export function closePalette(): void {
  usePresence.setState({ paletteOpen: false });
}

/** Pede ao HUD para abrir os ajustes (opcionalmente rolando até a seção Presença). */
export function openSettings(section?: "presenca"): void {
  if (section) usePresence.setState({ focusSettings: true });
  window.dispatchEvent(new CustomEvent("infinity:settings", { detail: { section } }));
}

export function Palette() {
  const open = usePresence((s) => s.paletteOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyK") {
        e.preventDefault();
        if (e.repeat) return;
        usePresence.setState((s) => ({ paletteOpen: !s.paletteOpen }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Fecha na hora (sem animação de saída): reabrir logo em seguida sempre monta uma paleta nova.
  return open ? <PaletteDialog /> : null;
}

function PaletteDialog() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const cmds = useCommands();
  const shown = useMemo(() => (query.trim() ? rank(cmds, query).slice(0, 60) : cmds.filter((c) => !c.onlyQuery)), [cmds, query]);
  const enabled = shown.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);
  const current = shown[active];

  // Foco no campo ao abrir; devolve ao que estava focado ao fechar.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => input.current?.focus(), 20);
    return () => {
      window.clearTimeout(t);
      if (before && before !== document.body && before.isConnected) before.focus();
    };
  }, []);

  useEffect(() => setActive(enabled[0] ?? 0), [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  /** Setas dão a volta na lista; PageUp/PageDown param nas pontas. */
  const move = (delta: number, wrap = true) => {
    if (!enabled.length) return;
    const pos = enabled.indexOf(active);
    const raw = pos < 0 ? 0 : pos + delta;
    const next = wrap ? (raw + enabled.length) % enabled.length : Math.max(0, Math.min(enabled.length - 1, raw));
    setActive(enabled[next]!);
  };
  const run = (c: Cmd | undefined) => {
    if (!c || c.disabled) return;
    closePalette();
    c.run();
  };

  const optId = (i: number) => `presenca-cmd-${i}`;
  let lastGroup: Group | null = null;

  return (
    <motion.div
      className="pointer-events-auto absolute inset-0 z-40 flex items-start justify-center bg-deep/45 px-3 pt-[12vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.14 }}
      onPointerDown={(e) => e.target === e.currentTarget && closePalette()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={T.palette.title}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="flex max-h-[min(72vh,620px)] w-[min(600px,100%)] flex-col overflow-hidden rounded-[var(--radius-panel)] border border-offwhite/10 bg-space shadow-2xl"
        onKeyDown={(e) => {
          // Nada daqui vaza para os atalhos do mundo (Esc de outros painéis, emotes...).
          e.stopPropagation();
          if (e.key === "ArrowDown") move(1);
          else if (e.key === "ArrowUp") move(-1);
          else if (e.key === "PageDown") move(8, false);
          else if (e.key === "PageUp") move(-8, false);
          else if (e.key === "Enter") run(current);
          else if (e.key === "Escape") closePalette();
          else if ((e.ctrlKey || e.metaKey) && e.code === "KeyK") closePalette();
          else if (e.key === "Tab") {
            e.preventDefault();
            move(e.shiftKey ? -1 : 1);
            return;
          } else return;
          e.preventDefault();
        }}
      >
        <div className="flex items-center gap-3 border-b border-offwhite/8 px-4">
          <Search className="size-4 shrink-0 text-slate" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={T.palette.placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="presenca-cmds"
            aria-activedescendant={current ? optId(active) : undefined}
            aria-autocomplete="list"
            aria-label={T.palette.title}
            spellCheck={false}
            autoComplete="off"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-offwhite placeholder:text-slate/80 focus:outline-none"
          />
          <kbd className="hidden rounded-md bg-offwhite/8 px-1.5 py-0.5 font-sans text-[10px] text-slate sm:block">Esc</kbd>
        </div>

        <ul ref={list} id="presenca-cmds" role="listbox" aria-label={T.palette.title} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {shown.length === 0 && (
            <li role="presentation" className="px-3 py-8 text-center">
              <p className="text-sm text-offwhite/90">{T.palette.empty}</p>
              <p className="mt-1 text-xs text-slate">{T.palette.emptyHint}</p>
            </li>
          )}
          {shown.map((c, i) => {
            const header = !query.trim() && c.group !== lastGroup;
            lastGroup = c.group;
            return [
              header && (
                <li key={`h-${c.group}`} role="presentation" className="label-caps px-2.5 pb-1 pt-2.5 first:pt-1">
                  {T.palette.groups[c.group]}
                </li>
              ),
              <li
                key={c.id}
                id={optId(i)}
                data-index={i}
                role="option"
                aria-selected={i === active}
                aria-disabled={c.disabled || undefined}
                onPointerMove={() => !c.disabled && i !== active && setActive(i)}
                onClick={() => run(c)}
                className={clsx(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2",
                  i === active ? "bg-offwhite/10" : "hover:bg-offwhite/5",
                  c.disabled && "cursor-default opacity-45",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-offwhite/6 text-offwhite/85">{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-offwhite">{c.label}</span>
                  {c.hint && <span className="block truncate text-xs text-slate">{c.hint}</span>}
                </span>
                {c.shortcut && <kbd className="rounded-md bg-offwhite/8 px-1.5 py-0.5 font-display text-[10px] font-bold text-offwhite/80">{c.shortcut}</kbd>}
                {i === active && c.enter ? (
                  <span className="hidden shrink-0 text-[11px] text-slate sm:block">{c.enter} ↵</span>
                ) : (
                  query.trim() && <span className="hidden shrink-0 text-[11px] text-slate sm:block">{T.palette.groups[c.group]}</span>
                )}
              </li>,
            ];
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-offwhite/8 px-4 py-2 text-[11px] text-slate pointer-coarse:hidden">
          <span>
            <kbd className="font-sans">↑↓</kbd> {T.palette.keys.move}
          </span>
          <span>
            <kbd className="font-sans">Enter</kbd> {T.palette.keys.run}
          </span>
          <span>
            <kbd className="font-sans">Esc</kbd> {T.palette.keys.close}
          </span>
          <span className="ml-auto hidden truncate sm:block">{T.palette.typeHint}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

const CAN_SHARE = typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
const STATUSES: Status[] = ["available", "listening", "focus", "away"];

/** Lista de comandos do momento (refeita quando muda gente, mídia, lente ou seguir). */
function useCommands(): Cmd[] {
  const players = useApp((s) => s.players);
  const selfId = useApp((s) => s.selfId);
  const lens = useApp((s) => s.lens);
  const media = useMedia((s) => s.status);
  const mic = useMedia((s) => s.mic);
  const cam = useMedia((s) => s.cam);
  const screen = useMedia((s) => s.screen);
  const pipContent = usePip((s) => s.content);
  const following = usePresence((s) => s.following);
  const status = players[selfId ?? ""]?.status ?? "available";

  return useMemo(() => {
    const out: Cmd[] = [];
    const icon = "size-4";

    // Pessoas.
    const others = Object.values(players)
      .filter((p) => p.id !== selfId)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    for (const p of others) {
      const pos = sampleRemote(p.id);
      const where = pos ? placeName(pos) : "";
      out.push({
        id: `p:${p.id}`,
        group: "people",
        label: p.name,
        hint: [T.status[p.status], where].filter(Boolean).join(" · "),
        enter: T.palette.go,
        keywords: `pessoa ir ate ${where}`,
        icon: <AvatarFace look={p.look} size={28} className="rounded-lg" />,
        run: () => goToPerson(p.id),
      });
      out.push({ id: `p:${p.id}:go`, group: "people", label: T.person.goTo(p.name), icon: <Users className={icon} />, onlyQuery: true, run: () => goToPerson(p.id) });
      const wait = callWait();
      out.push({
        id: `p:${p.id}:call`,
        group: "people",
        label: T.call.actionOf(p.name),
        hint: wait > 0 ? T.call.wait(wait) : undefined,
        keywords: "chamar",
        icon: <BellRing className={icon} />,
        onlyQuery: true,
        run: () => callPerson(p.id),
      });
      const isLeader = following?.leader === p.id;
      out.push({
        id: `p:${p.id}:follow`,
        group: "people",
        label: isLeader ? T.follow.stopOf(p.name) : T.follow.actionOf(p.name),
        keywords: "seguir",
        icon: <Route className={icon} />,
        onlyQuery: true,
        run: () => (isLeader ? stopFollowing() : askFollow(p.id)),
      });
      for (const extra of personCommandList()) {
        out.push({ id: `p:${p.id}:${extra.key}`, group: "people", label: extra.label(p.name), keywords: "mensagem conversa chat", icon: <MessageSquare className={icon} />, onlyQuery: true, run: () => extra.run(p.id) });
      }
    }

    // Ações.
    const noMedia = media !== "on";
    if (following) out.push({ id: "a:unfollow", group: "actions", label: T.follow.stopOf(following.name), shortcut: "Esc", icon: <Route className={icon} />, run: stopFollowing });
    out.push({
      id: "a:lens",
      group: "actions",
      label: lens === "3d" ? T.palette.lens2d : T.palette.lens3d,
      keywords: "lente visao 2d 3d trocar",
      shortcut: "L",
      icon: lens === "3d" ? <MapIcon className={icon} /> : <Box className={icon} />,
      run: () => useApp.getState().setLens(lens === "3d" ? "2d" : "3d"),
    });
    out.push({
      id: "a:mic",
      group: "actions",
      label: mic ? T.palette.micOff : T.palette.micOn,
      hint: noMedia ? T.palette.mediaOff : undefined,
      keywords: "microfone mic audio voz mudo",
      shortcut: "M",
      disabled: noMedia,
      icon: mic ? <MicOff className={icon} /> : <Mic className={icon} />,
      run: () => void setMic(!mic),
    });
    out.push({
      id: "a:cam",
      group: "actions",
      label: cam ? T.palette.camOff : T.palette.camOn,
      hint: noMedia ? T.palette.mediaOff : undefined,
      keywords: "camera video webcam",
      shortcut: "V",
      disabled: noMedia,
      icon: cam ? <VideoOff className={icon} /> : <Video className={icon} />,
      run: () => void setCam(!cam),
    });
    if (CAN_SHARE) {
      if (screen) out.push({ id: "a:share-stop", group: "actions", label: T.palette.shareStop, keywords: "tela compartilhar parar", icon: <MonitorUp className={icon} />, run: () => void stopShare() });
      else {
        out.push({ id: "a:share-doc", group: "actions", label: T.palette.shareDoc, keywords: "tela compartilhar apresentar codigo planilha", disabled: noMedia, icon: <MonitorUp className={icon} />, run: () => void startShare("document", false) });
        out.push({ id: "a:share-video", group: "actions", label: T.palette.shareVideo, keywords: "tela compartilhar apresentar animacao", disabled: noMedia, icon: <MonitorUp className={icon} />, run: () => void startShare("video", false) });
      }
    }
    if (canPip() && pipContent) out.push({ id: "a:pip", group: "actions", label: T.palette.pip, keywords: "pip flutuante video janela", icon: <PictureInPicture2 className={icon} />, run: () => void openPip() });
    out.push({ id: "a:settings", group: "actions", label: T.palette.settings, keywords: "configuracoes dispositivos microfone camera som ruido", icon: <Settings2 className={icon} />, run: () => openSettings() });
    out.push({ id: "a:presence", group: "actions", label: T.palette.presence, keywords: "ausente inatividade automatico status presenca", icon: <UserRoundCog className={icon} />, run: () => openSettings("presenca") });
    for (const s of STATUSES) {
      out.push({
        id: `a:status:${s}`,
        group: "actions",
        label: T.palette.status(T.status[s]!),
        hint: s === status ? T.palette.current : undefined,
        keywords: "status presenca mudar",
        icon: <span className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />,
        run: () => setMyStatus(s),
      });
    }
    out.push({ id: "a:map", group: "actions", label: T.palette.map, keywords: "guia minimapa estacao", icon: <MapIcon className={icon} />, run: () => window.dispatchEvent(new Event("infinity:map")) });
    out.push({ id: "a:recenter", group: "actions", label: T.palette.recenter, keywords: "camera centralizar", icon: <LocateFixed className={icon} />, run: () => window.dispatchEvent(new Event("infinity:recenter")) });
    out.push({ id: "a:people", group: "actions", label: T.palette.people, keywords: "pessoas online lista", icon: <Users className={icon} />, run: () => useApp.getState().togglePeople(true) });
    // Ações de outros pacotes (mesas, primeiros passos...).
    for (const c of commandList()) {
      const Icon = c.icon;
      out.push({ id: `a:x:${c.key}`, group: "actions", label: c.label, hint: c.hint, keywords: c.keywords, shortcut: c.shortcut, icon: <Icon className={icon} />, run: c.run });
    }

    // Salas.
    for (const z of world().map.zones) {
      if (!z.listed || z.kind === "stage") continue;
      out.push({
        id: `r:${z.id}`,
        group: "rooms",
        label: z.name,
        hint: [z.team, T.palette.roomKind[z.kind]].filter((x) => x && x !== z.name).join(" · ") || undefined,
        keywords: `sala ir ate ${z.team ?? ""}`,
        enter: T.palette.go,
        icon: <DoorOpen className={icon} style={{ color: z.theme?.accent }} />,
        run: () => goToRoom(z),
      });
    }

    // Lugares do guia (Quiz, Copa, Jukebox...).
    for (const g of guideItems()) {
      if (!g.spots.length) continue;
      const Icon = g.icon;
      out.push({ id: `g:${g.key}`, group: "places", label: g.label, hint: [g.hint, g.room].filter(Boolean).join(" · "), keywords: `${g.group} lugar ir ate ${g.room}`, enter: T.palette.go, icon: <Icon className={icon} />, run: () => goToPlace(g) });
    }

    return out.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
  }, [players, selfId, lens, media, mic, cam, screen, pipContent, following, status]);
}

/** Atalho para quem não tem teclado: botão da doca. */
export function PaletteButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openPalette} aria-label={T.palette.open} title={T.palette.open} className={className} data-tour-target="pessoas">
      <Search className="size-[18px]" />
    </button>
  );
}

