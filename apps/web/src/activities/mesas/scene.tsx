import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { MESAS_LABEL_RANGE, mesasDeskOf, mesasKey, mesasOwner, type MapObject, type MesasDesk, type MesasItem } from "@infinity/world";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { serverNow } from "../../net/session.ts";
import { remoteIds, sampleRemote, self } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { desks, unread, useMesas, useMesasState, useMyKey } from "./state.ts";
import { ITEM_SCALE, itemParts, layoutOf, localOn, noteParts, plateParts } from "./items.ts";
import { selfNear } from "./shared.ts";
import { T } from "./strings.ts";

/**
 * As mesas no mundo (iguais nas duas lentes):
 * - objetos pessoais de quem está com a mesa (InstancedMesh por peça, matrizes só quando o estado muda);
 * - plaquinha nas mesas ocupadas (azul = check-in do dia, dourada = fixa);
 * - bilhete na sua mesa quando há recado novo (só no seu cliente: o recado é privado);
 * - de perto, a etiqueta "Ocupada · Ana" (HTML, só para as mesas a poucos metros).
 */
export function MesasScene() {
  return (
    <>
      <DeskObjects />
      <DeskTags />
    </>
  );
}

const PLATE_CHECKIN = new THREE.Color("#46AFE3");
const PLATE_FIXED = new THREE.Color("#E8B44A");
/** Plaquinha um pouco maior que a real, para ler de longe (e no pixel art). */
const PLATE_SCALE = 1.35;

let objIndex: Map<string, MapObject> | null = null;
function deskObject(id: string): MapObject | undefined {
  objIndex ??= new Map(world().map.objects.map((o) => [o.id, o]));
  return objIndex.get(id);
}

interface Pool {
  meshes: THREE.InstancedMesh[];
}

/** Cópias desenhadas de cada peça (para os testes conferirem que os objetos aparecem no mundo). */
export const drawn = new Map<string, number>();

const _desk = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _m = new THREE.Matrix4();

function DeskObjects() {
  const s = useMesasState();
  const key = useMyKey();
  const priv = useMesas((u) => u.priv);
  const seenV = useMesas((u) => u.seen); // "vistos" mudaram: o bilhete some
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.name = "mesas:objetos";
    return g;
  }, []);
  const pools = useRef(new Map<string, Pool>());
  const cap = desks().length;

  /** Malhas instanciadas de uma peça (criadas na primeira vez que alguém escolhe o objeto). */
  const pool = (name: string, parts: ReturnType<typeof itemParts>, capacity = cap): Pool => {
    let p = pools.current.get(name);
    if (!p) {
      p = {
        meshes: parts.map((part) => {
          const m = new THREE.InstancedMesh(part.geometry, part.material, capacity);
          m.count = 0;
          m.visible = false;
          m.name = `mesas:${name}:${part.bucket}`;
          m.renderOrder = part.bucket === "t1" ? 0 : 2;
          group.add(m);
          return m;
        }),
      };
      pools.current.set(name, p);
    }
    return p;
  };

  useEffect(
    () => () => {
      // Geometria e material são compartilhados (cache do pacote e dos móveis): só as instâncias saem.
      for (const p of pools.current.values()) for (const m of p.meshes) m.dispose();
      pools.current.clear();
      drawn.clear();
      group.clear();
    },
    [group],
  );

  useEffect(() => {
    const now = serverNow();
    const lists = new Map<string, THREE.Matrix4[]>();
    const push = (name: string, m: THREE.Matrix4) => {
      const l = lists.get(name);
      if (l) l.push(m.clone());
      else lists.set(name, [m.clone()]);
    };
    const plateColors: THREE.Color[] = [];
    if (s) {
      for (const d of desks()) {
        const owner = mesasOwner(s, d.id, now);
        if (!owner) continue;
        const o = deskObject(d.id);
        if (!o) continue;
        objectMatrix(o, _desk);
        const L = layoutOf(d.type);
        const [px, pz, pr] = L.plate;
        push("@placa", _m.multiplyMatrices(_desk, localOn(px, L.h, pz, pr, PLATE_SCALE, _local)));
        plateColors.push(owner.fixed ? PLATE_FIXED : PLATE_CHECKIN);
        // Objetos só na mesa atual da pessoa (check-in de hoje; senão, a fixa).
        const k = mesasKey(owner.name);
        if (mesasDeskOf(s, k, now) !== d.id) continue;
        (s.items[k] ?? []).forEach((it: MesasItem, i) => {
          const slot = L.slots[i];
          if (!slot) return;
          push(it, _m.multiplyMatrices(_desk, localOn(slot[0], L.h, slot[1], slot[2], ITEM_SCALE, _local)));
        });
      }
      // Bilhete de recado novo: só na sua mesa, só no seu cliente.
      const mine = key ? mesasDeskOf(s, key, now) : null;
      const d = desks().find((x) => x.id === mine);
      const o = d && deskObject(d.id);
      if (d && o && priv && unread(priv.inbox).length > 0) {
        const L = layoutOf(d.type);
        objectMatrix(o, _desk);
        push("@bilhete", _m.multiplyMatrices(_desk, localOn(L.note[0], L.h + 0.001, L.note[1], 0.2, 1.3, _local)));
      }
    }
    // Escreve nas malhas (as que não aparecem mais ficam com zero cópias).
    const names = new Set([...[...pools.current.keys()].map((k) => (k.startsWith("@placa") ? "@placa" : k)), ...lists.keys()]);
    for (const name of names) {
      const mats = lists.get(name) ?? [];
      const exists = pools.current.has(name === "@placa" ? "@placa-face" : name);
      if (!mats.length && !exists) continue;
      const parts = name === "@placa" ? null : name === "@bilhete" ? noteParts() : itemParts(name as MesasItem);
      const p = name === "@placa" ? plates(pool, cap) : pool(name, parts!, name === "@bilhete" ? 1 : cap);
      drawn.set(name, mats.length);
      for (const mesh of p.meshes) {
        const n = Math.min(mats.length, mesh.instanceMatrix.count);
        for (let i = 0; i < n; i++) mesh.setMatrixAt(i, mats[i]!);
        mesh.count = n;
        mesh.visible = n > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (name === "@placa" && mesh.userData.face) {
          for (let i = 0; i < n; i++) mesh.setColorAt(i, plateColors[i]!);
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        if (n > 0) mesh.computeBoundingSphere();
      }
    }
  }, [s, key, priv, cap, seenV]);

  return <primitive object={group} />;
}

/** Plaquinha: face colorida por instância + base escura. */
function plates(pool: (name: string, parts: ReturnType<typeof itemParts>, capacity?: number) => Pool, cap: number): Pool {
  const { face, base } = plateParts();
  const f = pool("@placa-face", face, cap);
  const b = pool("@placa-base", base, cap);
  for (const m of f.meshes) {
    m.userData.face = true;
    if (!m.instanceColor) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  }
  return { meshes: [...f.meshes, ...b.meshes] };
}

// ---- etiquetas de perto -------------------------------------------------------------------

interface Tag {
  d: MesasDesk;
  text: string;
  kind: "checkin" | "fixed" | "mine";
}

const _pose = { x: 0, z: 0, yaw: 0, anim: "idle" as const } as { x: number; z: number; yaw: number; anim: string };

/** Alguém sentado na cadeira da mesa (a etiqueta do avatar já diz quem é). */
function seatTaken(d: MesasDesk): boolean {
  if (self.anim === "sit" && Math.hypot(self.x - d.seat.x, self.z - d.seat.z) < 0.4) return true;
  const now = performance.now();
  for (const id of remoteIds()) {
    const r = sampleRemote(id, now, _pose as never);
    if (r && r.anim === "sit" && Math.hypot(r.x - d.seat.x, r.z - d.seat.z) < 0.4) return true;
  }
  return false;
}

function DeskTags() {
  const s = useMesasState();
  const key = useMyKey();
  const [tags, setTags] = useState<Tag[]>([]);
  const sig = useRef("");
  useEffect(() => {
    const scan = () => {
      const now = serverNow();
      const out: Tag[] = [];
      if (s) {
        for (const d of desks()) {
          const owner = mesasOwner(s, d.id, now);
          if (!owner) continue;
          if (Math.hypot(d.pos.x - self.x, d.pos.z - self.z) > MESAS_LABEL_RANGE || !selfNear(d.pos, MESAS_LABEL_RANGE)) continue;
          if (seatTaken(d)) continue;
          const mine = !!key && mesasKey(owner.name) === key;
          out.push({ d, kind: mine ? "mine" : owner.fixed ? "fixed" : "checkin", text: mine ? T.yours : `${owner.fixed ? T.fixedTag : T.busy} · ${owner.name}` });
        }
      }
      const next = out.map((t) => `${t.d.id}:${t.text}`).join("|");
      if (next !== sig.current) {
        sig.current = next;
        setTags(out);
      }
    };
    scan();
    const id = window.setInterval(scan, 350);
    return () => window.clearInterval(id);
  }, [s, key]);

  return (
    <>
      {tags.map((t) => (
        <Html key={t.d.id} position={[t.d.pos.x, layoutOf(t.d.type).h + 0.66, t.d.pos.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-space/80 px-2 py-0.5 text-[10px] font-medium text-offwhite/90 shadow-md ring-1 ring-offwhite/10"
            data-mesa-etiqueta={t.d.id}
          >
            <span className="size-1.5 rounded-full" style={{ background: t.kind === "fixed" ? "#E8B44A" : t.kind === "mine" ? "#00B7FF" : "#46AFE3" }} aria-hidden />
            {t.text}
          </div>
        </Html>
      ))}
    </>
  );
}
