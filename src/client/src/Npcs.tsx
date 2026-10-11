import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { NPCS, isStaff, npcPose } from "../../shared/npcs.ts";
import { settledPeople } from "../../shared/people.ts";
import { STORE_Y } from "../../shared/protocol.ts";
import { Actor, type ActorState } from "./gfx/Actor.tsx";
import { net } from "./net.ts";

// Staff and customers, drawn from the shared clock (see shared/npcs.ts and
// shared/storeday.ts), so everyone sees the same people in the same places,
// each doing what their role or purpose has them doing. Staff wear a cap and a
// badge in their role's colour. `?labels=1` shows what each is up to.
const LABELS = new URLSearchParams(location.search).has("labels");
// `?t=95` shows the store 95 seconds into its day, for a still of a moment
const AT = new URLSearchParams(location.search).get("t");

export function Npcs() {
  const root = useRef<Group>(null);
  const states = useRef<ActorState[]>(NPCS.map(() => ({ walking: false, mode: "idle", mood: "neutral" })));
  const shown = useRef(new Map<string, { x: number; z: number; ry: number }>());
  const [, bump] = useState(0);
  const intents = useRef<string[]>(NPCS.map(() => ""));
  const frames = useRef(0);

  useFrame(() => {
    const now = AT !== null ? Number(AT) * 1000 : net.serverNow();
    const settled = settledPeople(now).npc;
    root.current?.children.forEach((child, i) => {
      const def = NPCS[i];
      const raw = npcPose(def, now);
      child.visible = raw.present;
      if (!raw.present) {
        shown.current.delete(def.id); // when they come in again, they start where they are
        return;
      }
      // where they actually stand, after colliding with everyone else
      const at = settled.get(def.id) ?? raw;
      // ease towards the settled spot, so being pushed aside reads as a step
      // and not a snap (the first frame goes straight there)
      const k = shown.current.get(def.id);
      const nx = k ? k.x + (at.x - k.x) * 0.25 : at.x;
      const nz = k ? k.z + (at.z - k.z) * 0.25 : at.z;
      shown.current.set(def.id, { x: nx, z: nz, ry: raw.ry });
      child.position.set(nx, STORE_Y, nz);
      child.rotation.y = raw.ry;
      states.current[i] = { walking: raw.walking, mode: raw.mode, mood: raw.mood, seated: raw.seated, device: raw.device };
      intents.current[i] = raw.intent;
    });
    if (LABELS && ++frames.current % 20 === 0) bump((n) => n + 1);
  });

  const uniforms = useMemo(() => NPCS.map((n) => (isStaff(n) && n.cap ? { cap: n.cap, badge: n.cap } : undefined)), []);

  return (
    <group ref={root}>
      {NPCS.map((n, i) => (
        <group key={n.id} visible={false}>
          <Actor id={n.id} shirt={n.colour} uniform={uniforms[i]} getState={() => states.current[i]} />
          {LABELS && (
            <Html position={[0, 2.05, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
              <div
                style={{
                  background: "rgba(20,22,26,0.78)",
                  color: "#fff",
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  whiteSpace: "nowrap",
                  font: "11px system-ui, sans-serif",
                }}
              >
                <b>{n.id}</b>
                {n.purpose ? ` · wants ${n.purpose}` : n.specialty ? ` · ${n.specialty}` : ` · ${n.role}`}
                <br />
                {intents.current[i]}
              </div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}
