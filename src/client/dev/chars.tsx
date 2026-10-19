import { Canvas } from "@react-three/fiber";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { HAIR_COLOURS, HAIR_FOR, SHIRT_COLOURS, SKIN_TONES, type LookChoice } from "../../shared/look.ts";
import type { Gender } from "../../shared/names.ts";
import { Actor } from "../src/gfx/Actor.tsx";

// Dev only: a grid of generated characters, to check by eye how the
// customisation looks (`/dev/chars.html?n=6&rot=0.4&zoom=1`). Rolls a look the
// way the entry screen does, from fixed seeds so a screenshot is repeatable.
const q = new URLSearchParams(location.search);
const N = Number(q.get("n") ?? 6);
const ROT = Number(q.get("rot") ?? 0.35);
const ZOOM = Number(q.get("zoom") ?? 1);
const prand = (n: number): number => {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(l: readonly T[], r: number): T => l[Math.floor(r * l.length) % l.length];

function roll(gender: Gender, i: number): LookChoice {
  const r = (k: number): number => prand(i * 31 + k + (gender === "male" ? 1000 : 0));
  return {
    seed: `seed-${gender}-${i}`,
    gender,
    hairStyle: pick(HAIR_FOR[gender], r(1)),
    hairColour: pick(HAIR_COLOURS, r(2)),
    skin: pick(SKIN_TONES, r(3)),
    shirt: pick(SHIRT_COLOURS, r(4)),
    beard: gender === "male" && r(5) < 0.35 ? pick(["stubble", "moustache", "goatee", "full"] as const, r(6)) : "none",
  };
}

const state = { walking: false, mode: "idle" as const, mood: "smile" };

function Grid() {
  const people = useMemo(() => {
    const out: Array<{ look: LookChoice; x: number; y: number }> = [];
    for (let i = 0; i < N; i++) {
      out.push({ look: roll("female", i), x: (i - (N - 1) / 2) * 0.9, y: 0.55 });
      out.push({ look: roll("male", i), x: (i - (N - 1) / 2) * 0.9, y: -0.55 });
    }
    return out;
  }, []);
  return (
    <>
      <hemisphereLight args={["#ffffff", "#a7adb5", 1.3]} />
      <directionalLight position={[-2, 4, 3]} intensity={1.4} />
      <directionalLight position={[2, 2, 4]} intensity={0.7} />
      {people.map((p, i) => (
        <group key={i} position={[p.x, p.y - 0.95, 0]} rotation={[0, Math.PI + ROT, 0]} scale={0.55}>
          <Actor id={p.look.seed!} look={p.look} getState={() => state} />
        </group>
      ))}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Canvas camera={{ position: [0, 0.2, 5.2 / ZOOM], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.2, 0)} gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <Grid />
    </Canvas>
  </StrictMode>,
);
