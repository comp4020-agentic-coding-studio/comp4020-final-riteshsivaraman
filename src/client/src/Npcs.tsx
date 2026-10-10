import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { NPCS, isStaff, npcPose } from "../../shared/npcs.ts";
import { settledPeople } from "../../shared/people.ts";
import { STORE_Y } from "../../shared/protocol.ts";
import { TABLES } from "../../shared/world.ts";
import { Person, type PersonState } from "./Person.tsx";
import { net } from "./net.ts";

// Staff and customers, drawn from the shared clock (see shared/npcs.ts), so
// everyone sees the same people in the same places. Staff wear a cap and a
// badge, coloured by role, until they get told apart properly.
export function Npcs() {
  const root = useRef<Group>(null);
  const states = useRef<PersonState[]>(NPCS.map(() => ({ speed: 0, mode: "idle" })));
  const shown = useRef(new Map<string, { x: number; z: number }>());

  useFrame(() => {
    const now = net.serverNow();
    const settled = settledPeople(now).npc;
    root.current?.children.forEach((child, i) => {
      const def = NPCS[i];
      const raw = npcPose(def, now);
      // where they actually stand, after colliding with everyone else
      const at = settled.get(def.id) ?? raw;
      const p = { ...raw, x: at.x, z: at.z };
      const ahead = npcPose(def, now + 120);
      const speed = p.walking ? Math.hypot(ahead.x - p.x, ahead.z - p.z) / 0.12 : 0;
      let ry = p.ry;
      let mode: PersonState["mode"] = "idle";
      if (def.working) {
        mode = "work";
      } else if (!p.walking && def.role === "customer") {
        // stopped beside a table: turn to it and take a look at the products
        let best = TABLES[0];
        let bestD = Infinity;
        for (const t of TABLES) {
          const d = Math.hypot(t.x - p.x, t.z - p.z);
          if (d < bestD) {
            bestD = d;
            best = t;
          }
        }
        ry = Math.atan2(-(best.x - p.x), -(best.z - p.z));
        mode = "observe";
      }
      // ease towards the settled spot, so being pushed aside reads as a step
      // and not a snap (the first frame goes straight there)
      const k = shown.current.get(def.id);
      const nx = k ? k.x + (p.x - k.x) * 0.25 : p.x;
      const nz = k ? k.z + (p.z - k.z) * 0.25 : p.z;
      shown.current.set(def.id, { x: nx, z: nz });
      child.position.set(nx, STORE_Y, nz);
      child.rotation.y = ry;
      states.current[i] = { speed, mode };
    });
  });

  return (
    <group ref={root}>
      {NPCS.map((n, i) => (
        <group key={n.id}>
          <Person
            id={n.id}
            shirt={n.colour}
            cap={isStaff(n) ? n.cap : undefined}
            getState={() => states.current[i]}
          />
        </group>
      ))}
    </group>
  );
}
