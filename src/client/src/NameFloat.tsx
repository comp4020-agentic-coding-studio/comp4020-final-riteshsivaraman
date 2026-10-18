import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3, type Group } from "three";
import { IntentBadge } from "./IntentBadge.tsx";
import { net } from "./net.ts";

// A name floating over a head, only for people close enough to be worth
// reading (Ritesh, 2026-10-19): it fades out between FADE_FROM and SHOW_RANGE
// metres, so a crowd across the shop is not a wall of names.
const SHOW_RANGE = 8;
const FADE_FROM = 5.5;

export function NameFloat({ id, name, npc, y }: { id: string; name: string; npc: boolean; y: number }) {
  const g = useRef<Group>(null);
  const el = useRef<HTMLDivElement>(null);
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (!g.current || !el.current) return;
    g.current.getWorldPosition(v);
    const d = Math.hypot(v.x - net.me.x, v.z - net.me.z);
    const o = d >= SHOW_RANGE ? 0 : d <= FADE_FROM ? 1 : (SHOW_RANGE - d) / (SHOW_RANGE - FADE_FROM);
    el.current.style.opacity = String(o);
    el.current.style.visibility = o === 0 ? "hidden" : "visible";
  });
  return (
    <group ref={g} position={[0, y, 0]}>
      <Html center distanceFactor={7} style={{ pointerEvents: "none" }}>
        <div ref={el} className={`name-float${npc ? "" : " player"}`}>
          <b>{name}</b>
          {npc && <i>NPC</i>}
          <IntentBadge id={id} />
        </div>
      </Html>
    </group>
  );
}
