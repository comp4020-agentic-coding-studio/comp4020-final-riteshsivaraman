import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { appearanceFor } from "../../../shared/appearance.ts";
import { BODY_STYLES, buildCharacter, EXPRESSIONS, EYE_STYLES, FACE_SHAPES, poseCharacter, SHADINGS, type Character, type Mood } from "./character.ts";

// Dev only (`?stage=1`): a full-body person on a stage. New character gives a
// random person, Next expression cycles the face, Walk starts the walk cycle,
// and Crowd puts 40 of them in the room and reports what that costs to draw.

const SHIRTS = ["#2f62b5", "#4a7c59", "#b5503a", "#6b5b95", "#3a3d45", "#c9a24a", "#2a7f8a"];
const shirtFor = (id: string): string => SHIRTS[Math.floor(appearanceFor(id).faceWidth * 1000) % SHIRTS.length];

function Person({ char, expr, walking, offset = 0 }: { char: Character; expr: Mood; walking: boolean; offset?: number }) {
  const mood = useRef<Mood>({ ...expr });
  // `?phase=1.2` freezes a mid-stride, so a still picture can show the walk
  const frozen = new URLSearchParams(location.search).get("phase");
  const t = useRef(offset * 3.1);
  const phase = useRef(frozen !== null ? Number(frozen) : offset * 2);
  const walk = useRef(frozen !== null ? 1 : 0);
  const sway = useRef(0);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    t.current += dt;
    if (frozen === null) {
      walk.current += ((walking ? 1 : 0) - walk.current) * (1 - Math.exp(-6 * dt));
      phase.current += dt * (3 + walk.current * 2.4) * (walk.current > 0.05 ? 1 : 0);
    }
    const k = 1 - Math.exp(-9 * dt);
    const m = mood.current;
    for (const key of ["browY", "browTilt", "lid", "curve", "open", "width"] as const) m[key] += (expr[key] - m[key]) * k;
    const blink = (t.current + offset + 1.7) % 3.4 < 0.12 ? 1.2 : 0; // eyes open at t = 0
    poseCharacter(char, { t: t.current, walk: walk.current, phase: phase.current, mode: "idle", seed: offset * 7 }, m, blink);
    sway.current += dt;
  });
  return <primitive object={char.root} />;
}

function Stats({ onStats }: { onStats: (s: string) => void }) {
  const { gl } = useThree();
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 3 || frames.current % 20 === 0) {
      onStats(`${gl.info.render.calls} draw calls · ${(gl.info.render.triangles / 1000).toFixed(1)}k triangles`);
    }
  });
  return null;
}

function Camera({ crowd, close }: { crowd: boolean; close: boolean }) {
  const { camera } = useThree();
  const controls = useRef<{ target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null>(null);
  useEffect(() => {
    const ty = crowd ? 0.9 : close ? 1.5 : 0.88;
    const tz = crowd ? 3 : 0;
    if (crowd) camera.position.set(0, 2.6, -9);
    else if (close) camera.position.set(0, 1.52, -1.15);
    else camera.position.set(0, 1.1, -4.6);
    controls.current?.target.set(0, ty, tz);
    controls.current?.update();
    camera.lookAt(0, ty, tz);
  }, [crowd, close, camera]);
  return <OrbitControls ref={controls as never} enablePan={false} minDistance={0.8} maxDistance={16} />;
}

export function CharacterStage() {
  const [seed, setSeed] = useState(() => Number(new URLSearchParams(location.search).get("seed") ?? 1));
  const [ei, setEi] = useState(() => Number(new URLSearchParams(location.search).get("expr") ?? 0));
  const [walking, setWalking] = useState(() => new URLSearchParams(location.search).has("walk"));
  const [crowd, setCrowd] = useState(() => new URLSearchParams(location.search).has("crowd"));
  const [stats, setStats] = useState("");
  const [eyeIx, setEyeIx] = useState(() => Number(new URLSearchParams(location.search).get("eyes") ?? 0));
  const [bodyIx, setBodyIx] = useState(() => Number(new URLSearchParams(location.search).get("body") ?? 0));
  const [faceIx, setFaceIx] = useState(() => Number(new URLSearchParams(location.search).get("face") ?? 0));
  const [shadeIx, setShadeIx] = useState(() => Number(new URLSearchParams(location.search).get("shade") ?? 0));
  const face = FACE_SHAPES[faceIx % FACE_SHAPES.length];
  const shading = SHADINGS[shadeIx % SHADINGS.length];
  const eyes = EYE_STYLES[eyeIx % EYE_STYLES.length];
  const body = BODY_STYLES[bodyIx % BODY_STYLES.length];
  const [close, setClose] = useState(() => new URLSearchParams(location.search).has("close"));
  const id = `person-${seed}`;
  const look = useMemo(() => appearanceFor(id), [id]);
  const single = useMemo(() => buildCharacter(look, shirtFor(id), { eyes, body, face, shading }), [look, id, eyes, body, face, shading]);
  const people = useMemo(() => {
    if (!crowd) return [];
    return Array.from({ length: 40 }, (_, i) => {
      const cid = `crowd-${seed}-${i}`;
      const c = buildCharacter(appearanceFor(cid), shirtFor(cid), { eyes, body, shading });
      c.root.position.set(((i % 8) - 3.5) * 1.1, 0, Math.floor(i / 8) * 1.4 - 1);
      c.root.rotation.y = Math.PI * 0.08 * (i % 3 - 1);
      return c;
    });
  }, [crowd, seed, eyes, body, shading]);
  const expr = EXPRESSIONS[ei % EXPRESSIONS.length];
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === "n") setSeed((s) => s + 1 + Math.floor(Math.random() * 1000));
      if (e.key === "e") setEi((i) => i + 1);
      if (e.key === "w") setWalking((v) => !v);
      if (e.key === "c") setCrowd((v) => !v);
      if (e.key === "f") setClose((v) => !v);
      if (e.key === "o") setEyeIx((i) => i + 1);
      if (e.key === "b") setBodyIx((i) => i + 1);
      if (e.key === "s") setFaceIx((i) => i + 1);
      if (e.key === "t") setShadeIx((i) => i + 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const btn = { font: "inherit", fontSize: 14, padding: "8px 14px", borderRadius: 8, border: "1px solid #7a8088", background: "#fff", cursor: "pointer" } as const;
  return (
    <>
      <Canvas camera={{ fov: 30, near: 0.05, far: 60, position: [0, 1.0, -3.4] }} dpr={[1, 1.5]} gl={{ antialias: true }} style={{ position: "fixed", inset: 0 }}>
        <color attach="background" args={["#c9ccd0"]} />
        <hemisphereLight args={["#ffffff", "#9aa0a6", 1.2]} />
        <directionalLight position={[-2, 4, -3]} intensity={1.5} />
        <directionalLight position={[3, 1.5, -1]} intensity={0.5} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#9ea2a8" roughness={0.9} />
        </mesh>
        {crowd ? (
          people.map((c, i) => <Person key={`${seed}-${i}`} char={c} expr={EXPRESSIONS[i % 2 === 0 ? 0 : 1]} walking={walking} offset={i} />)
        ) : (
          <Person key={id} char={single} expr={expr} walking={walking} />
        )}
        <Camera crowd={crowd} close={close} />
        <Stats onStats={setStats} />
      </Canvas>
      <div style={{ position: "fixed", left: 16, top: 16, display: new URLSearchParams(location.search).get("ui") === "0" ? "none" : "flex", gap: 8, alignItems: "center", zIndex: 5, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => setSeed((s) => s + 1 + Math.floor(Math.random() * 1000))}>New character (N)</button>
        <button style={btn} onClick={() => setEi((i) => i + 1)}>Next expression (E)</button>
        <button style={btn} onClick={() => setWalking((v) => !v)}>{walking ? "Stand (W)" : "Walk (W)"}</button>
        <button style={btn} onClick={() => setCrowd((v) => !v)}>{crowd ? "Single (C)" : "Crowd of 40 (C)"}</button>
        <button style={btn} onClick={() => setClose((v) => !v)}>{close ? "Full body (F)" : "Face close-up (F)"}</button>
        <button style={btn} onClick={() => setEyeIx((i) => i + 1)}>Eyes: {eyes} (O)</button>
        <button style={btn} onClick={() => setBodyIx((i) => i + 1)}>Body: {body} (B)</button>
        <button style={btn} onClick={() => setFaceIx((i) => i + 1)}>Face: {face} (S)</button>
        <button style={btn} onClick={() => setShadeIx((i) => i + 1)}>Shading: {shading} (T)</button>
      </div>
      <div style={{ position: "fixed", left: 16, bottom: 16, fontSize: 13, color: "#111", lineHeight: 1.5, zIndex: 5 }}>
        {crowd ? (
          <div>
            <strong>crowd of 40</strong> · {stats} · {(people[0]?.triangles ?? 0).toFixed(0)} triangles each, 1 mesh each
          </div>
        ) : (
          <>
            <div>
              <strong>{expr.name}</strong> · eyes <strong>{eyes}</strong> · body <strong>{body}</strong> ({single.heads.toFixed(1)} heads) · face <strong>{single.face}</strong> · {shading} · seed {seed} · {stats} ({single.triangles.toFixed(0)} triangles in this person)
            </div>
            <div>
              height {(1.72 * look.height).toFixed(2)} m · build {look.build.toFixed(2)} · shoulder:hip {look.shoulderHip.toFixed(2)} · hair {look.hairStyle} · head {look.faceWidth.toFixed(2)} wide, jaw {look.jaw.toFixed(2)}
            </div>
          </>
        )}
      </div>
    </>
  );
}
