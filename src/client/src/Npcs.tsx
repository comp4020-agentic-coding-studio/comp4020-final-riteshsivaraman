import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { engagedMoment, rejoinMoment } from "../../shared/engage.ts";
import { NPCS, isStaff, npcPose } from "../../shared/npcs.ts";
import { settledPeople } from "../../shared/people.ts";
import { STORE_Y } from "../../shared/protocol.ts";
import { Actor, type ActorState } from "./gfx/Actor.tsx";
import { net, talkMs } from "./net.ts";
import { NameFloat } from "./NameFloat.tsx";
import { NPC_NAME } from "../../shared/duty.ts";
import { npcLook } from "../../shared/look.ts";

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
    // real visitors are obstacles too, so an NPC visually gives way instead
    // of gliding straight through someone standing in its path
    const visitors = [net.me, ...[...net.remotes.values()].map((r) => ({ x: r.x, z: r.z }))];
    const settled = settledPeople(now, visitors).npc;
    root.current?.children.forEach((child, i) => {
      const def = NPCS[i];
      let raw: { x: number; z: number; ry: number; walking: boolean; present: boolean; mode: ActorState["mode"]; mood: string; seated: boolean; device: boolean; intent: string; gaze?: { x: number; y: number; z: number } } = npcPose(def, now);
      // a person holds this post today: the NPC is not on
      if (net.offDuty.has(def.id)) raw = { ...raw, present: false };
      // with a visitor (they walk over and talk), or walking back to the day
      const eng = net.engaged.get(def.id);
      const rel = net.released.get(def.id);
      let direct = false;
      if (eng && (raw.present || eng.lead)) {
        const m = engagedMoment(def.id, eng, now);
        raw = { ...m, present: true };
        // in a conversation with you they talk only while a line of theirs is on screen, for as long as it takes to say
        if (eng.visitorId === net.you?.id && !eng.pending && !m.walking && m.mode === "talk") {
          // (a specialist is spoken to by a stand-in customer: their line is the newest in the chat)
          const line = net.staffConv?.log.at(-1);
          const speaking = net.staffConv
            ? line?.who === "customer" && Date.now() - net.staffAt < talkMs(line.text.length)
            : net.turn?.awaiting === "customer" && Date.now() - net.turnAt < talkMs(net.turn.say.length);
          raw = { ...raw, mode: speaking ? "talk" : "idle" };
        }
        direct = true;
      } else if (rel && raw.present) {
        const m = rejoinMoment(def.id, rel, now);
        if (m) {
          raw = { ...m, present: true };
          direct = true;
        } else net.released.delete(def.id);
      }
      // a table someone is sitting at is taken: no timetable regular sits down on top of them
      if (raw.present && !direct && raw.seated) {
        const taken = [...net.seats.values(), ...[...net.engaged.values()].filter((e) => e.seated && e.lead).map((e) => ({ x: e.lead!.x, z: e.lead!.z }))];
        if (taken.some((t) => Math.hypot(t.x - raw.x, t.z - raw.z) < 0.9)) raw = { ...raw, present: false };
      }
      child.visible = raw.present;
      if (!raw.present) {
        shown.current.delete(def.id); // when they come in again, they start where they are
        return;
      }
      // where they actually stand, after colliding with everyone else (not
      // while they are being served: they are exactly where the visitor is)
      const at = direct ? raw : (settled.get(def.id) ?? raw);
      // ease towards the settled spot, so being pushed aside reads as a step
      // and not a snap (the first frame goes straight there)
      const k = shown.current.get(def.id);
      const nx = k ? k.x + (at.x - k.x) * 0.25 : at.x;
      const nz = k ? k.z + (at.z - k.z) * 0.25 : at.z;
      shown.current.set(def.id, { x: nx, z: nz, ry: raw.ry });
      child.position.set(nx, STORE_Y, nz);
      child.rotation.y = raw.ry;
      states.current[i] = { walking: raw.walking, mode: raw.mode, mood: raw.mood, seated: raw.seated, device: raw.device, gaze: raw.gaze };
      intents.current[i] = raw.intent;
    });
    if (LABELS && ++frames.current % 20 === 0) bump((n) => n + 1);
  });

  // a person called Priya is drawn as a woman, one called Theo as a man
  const looks = useMemo(() => NPCS.map((n) => npcLook(n.id, NPC_NAME[n.id])), []);
  const uniforms = useMemo(() => NPCS.map((n) => (isStaff(n) && n.cap ? { cap: n.cap, badge: n.cap } : undefined)), []);

  return (
    <group ref={root}>
      {NPCS.map((n, i) => (
        <group key={n.id} visible={false}>
          <Actor id={n.id} shirt={n.colour} uniform={uniforms[i]} look={looks[i]} getState={() => states.current[i]} />
          <NameFloat id={n.id} name={NPC_NAME[n.id] ?? n.id} npc y={2.05} />
          {LABELS && (
            <Html position={[0, 2.35, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
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
