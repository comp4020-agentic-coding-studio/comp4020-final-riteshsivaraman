import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { appearanceFor } from "../../../shared/appearance.ts";
import type { Behaviour } from "../../../shared/behaviour.ts";
import { buildCharacter, EXPRESSIONS, poseCharacter, type Mood } from "./character.ts";

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
}

// `?snap=1` skips the easing between poses, so a still shows the settled pose
const SNAP = new URLSearchParams(location.search).has("snap");

const SHIRTS = ["#2f62b5", "#4a7c59", "#b5503a", "#6b5b95", "#3a3d45", "#c9a24a", "#2a7f8a", "#c46f8a", "#6f8f4a"];

export function Actor({
  id,
  shirt,
  uniform,
  getState,
}: {
  id: string;
  shirt?: string;
  uniform?: { cap?: string; badge?: string };
  getState: () => ActorState;
}) {
  const char = useMemo(() => {
    const look = appearanceFor(id);
    const colour = shirt ?? SHIRTS[Math.floor(look.faceWidth * 1000) % SHIRTS.length];
    // staff carry a tablet, customers a phone
    return buildCharacter(look, colour, { uniform, device: uniform ? "tablet" : "phone" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, shirt, uniform?.cap, uniform?.badge]);
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
    poseCharacter(char, { t: t.current, dt: SNAP ? 1 : dt, walk: walk.current, phase: phase.current, mode: s.walking ? "walk" : s.mode, seed, seated: s.seated, device: s.device }, m, blink);
  });
  return <primitive object={char.root} />;
}
