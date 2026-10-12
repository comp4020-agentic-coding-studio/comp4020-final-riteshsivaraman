import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Euler, type Group, Quaternion, Vector3 } from "three";
import { gazeAt } from "../../../shared/gaze.ts";
import { lookFor, type LookChoice } from "../../../shared/look.ts";
import type { Behaviour } from "../../../shared/behaviour.ts";
import { buildCharacter, EXPRESSIONS, poseCharacter, type Mood } from "./character.ts";
import { Device } from "./Device.tsx";

// The real model a held device is (Ritesh, 2026-10-12: pair character
// actions with real objects, not an invented generic slab). One fixed
// model per kind for this pilot; varying it per character is a follow-up.
export const HELD_DEVICE: Record<"phone" | "tablet", { model: string; colour: string }> = {
  phone: { model: "iphone-18-pro", colour: "#d8d7d2" },
  tablet: { model: "ipad-mini", colour: "#2b2f36" },
};

// A person in the store, drawn as a character. The parent moves and turns the
// group; this poses the body from a small state: walking or not, what they are
// doing, and the mood to show. Used for staff and customers (from the shared
// timetable), mall walkers and other visitors.

export interface ActorState {
  walking: boolean;
  mode: Behaviour;
  mood: string;
  speed?: number; // m/s, to pace the legs; defaults to a normal walk
  seated?: boolean;
  device?: boolean;
  // a world point to look at (y is height above the floor), if any
  gaze?: { x: number; y: number; z: number };
}

// `?snap=1` skips the easing between poses, so a still shows the settled pose
const SNAP = new URLSearchParams(location.search).has("snap");
const tmp = new Vector3();
const quat = new Quaternion();
const euler = new Euler();

const SHIRTS = ["#2f62b5", "#4a7c59", "#b5503a", "#6b5b95", "#3a3d45", "#c9a24a", "#2a7f8a", "#c46f8a", "#6f8f4a"];

export function Actor({
  id,
  shirt,
  uniform,
  look,
  getState,
}: {
  id: string;
  shirt?: string;
  uniform?: { cap?: string; badge?: string };
  look?: LookChoice; // what a visitor chose; NPCs have none
  getState: () => ActorState;
}) {
  const lookKey = JSON.stringify(look ?? null);
  const char = useMemo(() => {
    // the base appearance is from the seed the visitor chose (so the entry
    // preview matches what others see), or from the id
    const appearance = lookFor(id, look);
    const colour = look?.shirt ?? shirt ?? SHIRTS[Math.floor(appearance.faceWidth * 1000) % SHIRTS.length];
    // staff carry a tablet, customers a phone
    return buildCharacter(appearance, colour, {
      uniform,
      device: uniform ? "tablet" : "phone",
      // everyone in the store is drawn the same way: toon body, round eyes
      body: "toon",
      eyes: "round",
      face: look?.face,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, shirt, uniform?.cap, uniform?.badge, lookKey]);
  const seed = useMemo(() => Array.from(id).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) % 1000, [id]);
  const t = useRef(seed * 0.37);
  const phase = useRef(seed * 0.11);
  const walk = useRef(0);
  const mood = useRef<Mood>({ ...EXPRESSIONS[0] });
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    t.current += dt;
    const s = getState();
    const want = s.walking ? 1 : 0;
    walk.current += (want - walk.current) * (1 - Math.exp(-7 * dt));
    const pace = s.speed !== undefined ? Math.min(1.6, Math.max(0.6, s.speed / 1.1)) : 1;
    phase.current += dt * (3 + walk.current * 2.4) * pace * (walk.current > 0.05 ? 1 : 0);
    const target = EXPRESSIONS.find((e) => e.name === s.mood) ?? EXPRESSIONS[0];
    const k = 1 - Math.exp(-8 * dt);
    const m = mood.current;
    for (const key of ["browY", "browTilt", "lid", "curve", "open", "width"] as const) m[key] += (target[key] - m[key]) * k;
    const blink = (t.current + seed * 0.013 + 1.7) % 3.4 < 0.12 ? 1.2 : 0;
    // the head: where the body stands and faces, in the world, against the point
    let gaze: { yaw: number; pitch: number } | undefined;
    if (s.gaze && char.root.parent) {
      char.root.parent.getWorldPosition(tmp);
      char.root.parent.getWorldQuaternion(quat);
      euler.setFromQuaternion(quat, "YXZ");
      gaze = gazeAt({ x: tmp.x, z: tmp.z, ry: euler.y }, s.gaze);
    }
    poseCharacter(char, { t: t.current, dt: SNAP ? 1 : dt, walk: walk.current, phase: phase.current, mode: s.walking ? "walk" : s.mode, seed, seated: s.seated, device: s.device, gaze }, m, blink);
  });
  const held = char.deviceKind ? HELD_DEVICE[char.deviceKind] : undefined;
  const devRef = useRef<Group>(null);
  // `char.bones.dev` already has a parent (the forearm bone) inside
  // `char.root`'s own hierarchy — rendering `<primitive object={...}>` for it
  // here would *reparent* it to this component's own output instead (R3F
  // attaches a primitive to its JSX parent on mount), tearing it out of the
  // skeleton. Attaching the held device imperatively, after both are
  // mounted, keeps the bone's existing parent and its pose-driven transform.
  useEffect(() => {
    const group = devRef.current;
    if (!group) return;
    char.bones.dev.add(group);
    return () => {
      char.bones.dev.remove(group);
    };
  }, [char]);
  return (
    <>
      <primitive object={char.root} />
      {held && (
        <group ref={devRef}>
          <Device kind={char.deviceKind === "tablet" ? "tablet" : "phone"} model={held.model} colour={held.colour} x={0} y={0} z={0} rotY={0} />
        </group>
      )}
    </>
  );
}
