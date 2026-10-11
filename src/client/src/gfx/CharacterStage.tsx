import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { appearanceFor } from "../../../shared/appearance.ts";
import { avoidanceTurn, BEHAVIOURS, durationFor, pickBehaviour, pickMood, type Behaviour } from "../../../shared/behaviour.ts";
import { KINDS, layout, stepInteractions, type Active, type Directive, type SimAgent } from "../../../shared/interaction.ts";
import { separateFromPeople } from "../../../shared/world.ts";
import { BEARD_CHOICES, BODY_STYLES, buildCharacter, EXPRESSIONS, EYE_STYLES, FACE_SHAPES, poseCharacter, SHADINGS, type Character, type Mood } from "./character.ts";

// Dev only (`?stage=1`): a full-body person on a stage. New character gives a
// random person, Next expression cycles the face, Walk starts the walk cycle,
// and Crowd puts 40 of them in the room and reports what that costs to draw.

const SHIRTS = ["#2f62b5", "#4a7c59", "#b5503a", "#6b5b95", "#3a3d45", "#c9a24a", "#2a7f8a"];
const shirtFor = (id: string): string => SHIRTS[Math.floor(appearanceFor(id).faceWidth * 1000) % SHIRTS.length];

// `?speed=8` runs the crowd faster than real time, to see a long run quickly.
const SPEED = Number(new URLSearchParams(location.search).get("speed") ?? 1);

// A small seeded generator, so each person runs their own reproducible clock.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A person on the stage, as the interaction rules see them (x, z, plan,
// directive, nextConsider) plus their character and a one-off turn-to-face.
interface AgentState extends SimAgent {
  char: Character;
  snapHeading: number | null; // set to face instantly (scripted scenes)
}

interface PersonProps {
  char: Character;
  seed: number;
  offset?: number;
  expr: Mood; // the shared expression, when faces are not independent
  manual: Behaviour; // the behaviour chosen by hand, when not automatic
  walking: boolean;
  auto: boolean; // each person picks their own behaviours on their own timer
  independent: boolean; // each person changes their own expression
  roam: boolean; // walking moves them about the stage
  all: Character[]; // everyone on the stage, to steer around
  agent?: AgentState; // present in the crowd: an interaction can direct this person
}

function Person({ char, seed, offset = 0, expr, manual, walking, auto, independent, roam, all, agent }: PersonProps) {
  const rnd = useRef(rng(seed * 7919 + offset * 104729 + 13));
  const mood = useRef<Mood>({ ...expr });
  // `?phase=1.2` freezes a mid-stride, so a still picture can show the walk
  const frozen = new URLSearchParams(location.search).get("phase");
  const snapPose = new URLSearchParams(location.search).has("snap"); // no easing: for stills
  const clockAt = Number(new URLSearchParams(location.search).get("clock") ?? 0); // for stills of motion
  const t = useRef(offset * 3.1 + clockAt);
  const phase = useRef(frozen !== null ? Number(frozen) : offset * 2);
  const walk = useRef(frozen !== null ? 1 : 0);
  const mode = useRef<Behaviour>("idle");
  const nextBehaviour = useRef(-1); // pick at once, so people do not all start idle
  const exprAt = useRef<Mood>(EXPRESSIONS[0]);
  const nextExpr = useRef(-1);
  const heading = useRef(char.root.rotation.y);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05) * SPEED;
    t.current += dt;
    const r = rnd.current;
    if (agent && agent.snapHeading !== null) {
      heading.current = agent.snapHeading;
      char.root.rotation.y = heading.current;
      agent.snapHeading = null;
    }
    if (auto) {
      if (nextBehaviour.current < 0 || t.current >= nextBehaviour.current) {
        const b = pickBehaviour(r(), mode.current);
        mode.current = b;
        nextBehaviour.current = t.current + durationFor(b, r());
        const name = pickMood(b, r());
        exprAt.current = EXPRESSIONS.find((e) => e.name === name) ?? EXPRESSIONS[0];
      }
    } else {
      mode.current = manual;
    }
    if (!auto && independent) {
      if (nextExpr.current < 0 || t.current >= nextExpr.current) {
        exprAt.current = EXPRESSIONS[Math.floor(r() * EXPRESSIONS.length)];
        nextExpr.current = t.current + 2 + r() * 4;
      }
    }
    // an automatic person's mood follows their behaviour; otherwise their own
    // random one if faces are independent; otherwise the shared one
    let target: Mood = auto || independent ? exprAt.current : expr;
    let wantWalk = auto || manual !== "idle" ? mode.current === "walk" : walking;
    // an interaction takes over: walk to a place, face someone, play a part
    const dir = agent?.directive ?? null;
    let directed = false;
    if (dir) {
      directed = true;
      mode.current = dir.mode;
      nextBehaviour.current = -1; // pick afresh once it lets go
      if (dir.mood) target = EXPRESSIONS.find((e) => e.name === dir.mood) ?? target;
      const root = char.root;
      const x = root.position.x;
      const z = root.position.z;
      const turnTo = (tx: number, tz: number, rate: number): number => {
        const want = Math.atan2(-(tx - x), -(tz - z));
        const d = Math.atan2(Math.sin(want - heading.current), Math.cos(want - heading.current));
        heading.current += Math.max(-rate * dt, Math.min(rate * dt, d));
        return Math.abs(d);
      };
      wantWalk = false;
      if (dir.walkTo) {
        const dist = Math.hypot(dir.walkTo.x - x, dir.walkTo.z - z);
        if (dist > 0.12) {
          const off = turnTo(dir.walkTo.x, dir.walkTo.z, 5);
          wantWalk = true;
          if (off < 0.9) {
            const step = Math.min(dist, 1.15 * walk.current * dt);
            root.position.x += -Math.sin(heading.current) * step;
            root.position.z += -Math.cos(heading.current) * step;
          }
        } else if (dir.faceTo) {
          turnTo(dir.faceTo.x, dir.faceTo.z, 4);
        }
      } else if (dir.faceTo) {
        turnTo(dir.faceTo.x, dir.faceTo.z, 4);
      }
      root.rotation.y = heading.current;
    }
    if (frozen === null) {
      walk.current += ((wantWalk ? 1 : 0) - walk.current) * (1 - Math.exp(-6 * dt));
      phase.current += dt * (3 + walk.current * 2.4) * (walk.current > 0.05 ? 1 : 0);
    }
    // wander: walk forward, and turn back when near the edge of the stage
    if (roam && !directed && walk.current > 0.3) {
      const root = char.root;
      const x = root.position.x;
      const z = root.position.z;
      if (Math.abs(x) > 7 || z < -2 || z > 8.5) {
        // face the middle of the stage, turning a little each frame
        const want = Math.atan2(-(0 - x), -(3.2 - z));
        let d = want - heading.current;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        heading.current += Math.max(-1.6 * dt, Math.min(1.6 * dt, d));
      } else {
        // steer round anyone in the way (the collision pass below is the
        // backstop: bodies cannot overlap, but a walker should not need it)
        const others = all.filter((o) => o !== char).map((o) => ({ x: o.root.position.x, z: o.root.position.z }));
        heading.current += avoidanceTurn(x, z, heading.current, others) * 2.2 * dt;
      }
      root.rotation.y = heading.current;
      root.position.x += -Math.sin(heading.current) * 0.85 * walk.current * dt;
      root.position.z += -Math.cos(heading.current) * 0.85 * walk.current * dt;
    }
    const k = 1 - Math.exp(-9 * dt);
    const m = mood.current;
    for (const key of ["browY", "browTilt", "lid", "curve", "open", "width"] as const) m[key] += (target[key] - m[key]) * k;
    const blink = (t.current + offset * 0.7 + 1.7) % 3.4 < 0.12 ? 1.2 : 0; // eyes open at t = 0
    poseCharacter(char, { t: t.current, dt: snapPose ? 1 : dt, walk: walk.current, phase: phase.current, mode: directed ? (wantWalk ? "walk" : mode.current) : mode.current, seed: offset * 7 + seed }, m, blink);
  });
  return <primitive object={char.root} />;
}

// Runs interactions between the people on the stage. The decisions (who starts
// what, where everyone stands, what each does and when it ends) are all in
// shared/interaction.ts, the same function a spec runs for two simulated
// minutes; this only feeds it positions and hands the directives back.
function Interactions({ agents, enabled, scene, playAt, onSummary }: { agents: AgentState[]; enabled: boolean; scene: string | null; playAt: number; onSummary: (s: string) => void }) {
  const clock = useRef(0);
  const rand = useRef(rng(424242));
  const active = useRef<Active[]>([]);
  const sceneDone = useRef(false);
  const lastSummary = useRef("");
  useFrame((_, delta) => {
    const now = (clock.current += Math.min(delta, 0.05) * SPEED);
    for (const a of agents) {
      a.x = a.char.root.position.x;
      a.z = a.char.root.position.z;
    }
    // a scripted scene: a known interaction, already in place, for stills
    if (scene && !sceneDone.current && agents.length > 0) {
      sceneDone.current = true;
      const kind = scene as keyof typeof KINDS;
      if (KINDS[kind]) {
        const k = Math.min(agents.length, { chat: 2, handshake: 2, address: 4, applaud: 6, circle: 4 }[kind]);
        // gather them close first, so the layout is built from a tight group
        for (let i = 0; i < k; i++) {
          agents[i].char.root.position.set((i - (k - 1) / 2) * 0.55, 0, 1.5 + (i % 2) * 0.2);
          agents[i].x = agents[i].char.root.position.x;
          agents[i].z = agents[i].char.root.position.z;
        }
        const people = agents.slice(0, k).map((a) => ({ id: a.id, x: a.x, z: a.z, free: true }));
        const plan = { kind, members: people.map((p) => p.id), slots: layout(kind, people), duration: 12 };
        const ap: Active = { plan, state: "play", startedAt: now, t0: now - playAt };
        active.current.push(ap);
        plan.members.forEach((id, i) => {
          const a = agents[id];
          const sl = plan.slots[i];
          a.plan = ap;
          a.char.root.position.set(sl.x, 0, sl.z);
          a.snapHeading = Math.atan2(-(sl.faceX - sl.x), -(sl.faceZ - sl.z));
        });
      }
    }
    const step = stepInteractions(agents, active.current, now, rand.current, { enabled });
    active.current = step.active;
    for (const [what, list] of [["started", step.events.started], ["played", step.events.played], ["ended", step.events.ended], ["cancelled", step.events.cancelled]] as const) {
      for (const ap of list) console.log(`INTERACT ${what} t=${now.toFixed(1)} ${ap.plan.kind} [${ap.plan.members.join(",")}]`);
    }
    if (Math.floor(now * 2) !== Math.floor((now - Math.min(delta, 0.05) * SPEED) * 2)) {
      const counts = new Map<string, number>();
      for (const ap of active.current) counts.set(ap.plan.kind, (counts.get(ap.plan.kind) ?? 0) + 1);
      const text = counts.size === 0 ? "none right now" : [...counts].map(([k, n]) => `${k} ×${n}`).join(", ");
      if (text !== lastSummary.current) {
        lastSummary.current = text;
        onSummary(text);
      }
    }
  });
  return null;
}

// People are solid: after everyone has moved, each is pushed out of the ones
// before them, with the same rule the store uses (shared/world.ts).
function Collision({ people }: { people: Character[] }) {
  useFrame(() => {
    const placed: Array<{ x: number; z: number }> = [];
    for (const c of people) {
      const p = c.root.position;
      const q = separateFromPeople(p.x, p.z, placed);
      p.x = q.x;
      p.z = q.z;
      placed.push(q);
    }
  });
  return null;
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

function Camera({ crowd, close, near }: { crowd: boolean; close: boolean; near: boolean }) {
  const { camera } = useThree();
  const controls = useRef<{ target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null>(null);
  useEffect(() => {
    const ty = crowd ? (near ? 1.0 : 0.9) : close ? 1.5 : 0.88;
    const tz = crowd ? (near ? 1.5 : 3.6) : 0;
    if (crowd && near) camera.position.set(0, 2.3, -5.2);
    else if (crowd) camera.position.set(0, 4.2, -17);
    else if (close) camera.position.set(0, 1.52, -1.15);
    else camera.position.set(0, 1.1, -4.6);
    controls.current?.target.set(0, ty, tz);
    controls.current?.update();
    camera.lookAt(0, ty, tz);
  }, [crowd, close, near, camera]);
  return <OrbitControls ref={controls as never} enablePan={false} minDistance={0.8} maxDistance={16} />;
}

export function CharacterStage() {
  const [seed, setSeed] = useState(() => Number(new URLSearchParams(location.search).get("seed") ?? 1));
  const [ei, setEi] = useState(() => Number(new URLSearchParams(location.search).get("expr") ?? 0));
  const [walking, setWalking] = useState(() => new URLSearchParams(location.search).has("walk"));
  const [crowd, setCrowd] = useState(() => new URLSearchParams(location.search).has("crowd"));
  const [stats, setStats] = useState("");
  const [interact, setInteract] = useState(() => new URLSearchParams(location.search).has("interact"));
  const [summary, setSummary] = useState("none right now");
  const scene = new URLSearchParams(location.search).get("scene");
  const count = Number(new URLSearchParams(location.search).get("n") ?? 40);
  const near = new URLSearchParams(location.search).has("near");
  const playAt = Number(new URLSearchParams(location.search).get("playt") ?? 1.5);
  const [behaveIx, setBehaveIx] = useState(() => Number(new URLSearchParams(location.search).get("behave") ?? 0));
  const [auto, setAuto] = useState(() => new URLSearchParams(location.search).has("auto"));
  const [independent, setIndependent] = useState(() => new URLSearchParams(location.search).has("indep"));
  const behaviour = BEHAVIOURS[behaveIx % BEHAVIOURS.length];
  const [eyeIx, setEyeIx] = useState(() => Number(new URLSearchParams(location.search).get("eyes") ?? EYE_STYLES.indexOf("round")));
  const [bodyIx, setBodyIx] = useState(() => Number(new URLSearchParams(location.search).get("body") ?? 0));
  const [faceIx, setFaceIx] = useState(() => Number(new URLSearchParams(location.search).get("face") ?? 0));
  const [shadeIx, setShadeIx] = useState(() => Number(new URLSearchParams(location.search).get("shade") ?? SHADINGS.indexOf("toon")));
  const [beardIx, setBeardIx] = useState(() => Number(new URLSearchParams(location.search).get("beard") ?? 0));
  const beard = BEARD_CHOICES[beardIx % BEARD_CHOICES.length];
  const face = FACE_SHAPES[faceIx % FACE_SHAPES.length];
  const shading = SHADINGS[shadeIx % SHADINGS.length];
  const eyes = EYE_STYLES[eyeIx % EYE_STYLES.length];
  const body = BODY_STYLES[bodyIx % BODY_STYLES.length];
  const [close, setClose] = useState(() => new URLSearchParams(location.search).has("close"));
  const id = `person-${seed}`;
  const look = useMemo(() => appearanceFor(id), [id]);
  const single = useMemo(() => buildCharacter(look, shirtFor(id), { eyes, body, face, shading, beard }), [look, id, eyes, body, face, shading, beard]);
  const people = useMemo(() => {
    if (!crowd) return [];
    return Array.from({ length: count }, (_, i) => {
      const cid = `crowd-${seed}-${i}`;
      const c = buildCharacter(appearanceFor(cid), shirtFor(cid), { eyes, body, shading });
      // `?pack=1` stacks everyone on one spot, to show the collision pushing
      // them apart
      if (new URLSearchParams(location.search).has("pack")) c.root.position.set(((i * 7) % 5) * 0.01, 0, 3 + ((i * 3) % 7) * 0.01);
      else c.root.position.set(((i % 8) - 3.5) * 1.8, 0, Math.floor(i / 8) * 2.1 - 1);
      c.root.rotation.y = Math.PI * 0.08 * (i % 3 - 1);
      return c;
    });
  }, [crowd, seed, eyes, body, shading, count]);
  const agents = useMemo<AgentState[]>(() => people.map((c, i) => ({ id: i, char: c, directive: null, plan: null, nextConsider: 1 + (i % 7) * 0.6, snapHeading: null, x: c.root.position.x, z: c.root.position.z })), [people]);
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
      if (e.key === "g") setBeardIx((i) => i + 1);
      if (e.key === "v") setBehaveIx((i) => i + 1);
      if (e.key === "p") setAuto((v) => !v);
      if (e.key === "x") setIndependent((v) => !v);
      if (e.key === "i") setInteract((v) => !v);
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
          people.map((c, i) => (
            <Person key={`${seed}-${i}`} char={c} seed={seed} offset={i} expr={EXPRESSIONS[i % 2 === 0 ? 0 : 1]} manual="idle" walking={walking} auto={auto} independent={independent} roam all={people} agent={agents[i]} />
          ))
        ) : (
          <Person key={id} char={single} seed={seed} expr={expr} manual={behaviour} walking={walking} auto={false} independent={false} roam={false} all={[]} />
        )}
        {crowd && <Interactions agents={agents} enabled={interact} scene={scene} playAt={playAt} onSummary={setSummary} />}
        {crowd && <Collision people={people} />}
        <Camera crowd={crowd} close={close} near={near} />
        <Stats onStats={setStats} />
      </Canvas>
      <div style={{ position: "fixed", left: 16, top: 16, display: new URLSearchParams(location.search).get("ui") === "0" ? "none" : "flex", gap: 8, alignItems: "center", zIndex: 5, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => setSeed((s) => s + 1 + Math.floor(Math.random() * 1000))}>New character (N)</button>
        <button style={btn} onClick={() => setEi((i) => i + 1)}>Next expression (E)</button>
        <button style={btn} onClick={() => setWalking((v) => !v)}>{walking ? "Stand (W)" : "Walk (W)"}</button>
        <button style={btn} onClick={() => setCrowd((v) => !v)}>{crowd ? "Single (C)" : "Crowd of 40 (C)"}</button>
        {crowd ? (
          <>
            <button style={btn} onClick={() => setAuto((v) => !v)}>Behaviours: {auto ? "each their own" : "off"} (P)</button>
            <button style={btn} onClick={() => setIndependent((v) => !v)}>Expressions: {independent || auto ? "independent" : "shared"} (X)</button>
            <button style={btn} onClick={() => setInteract((v) => !v)}>Interactions: {interact ? "on" : "off"} (I)</button>
          </>
        ) : (
          <button style={btn} onClick={() => setBehaveIx((i) => i + 1)}>Behaviour: {behaviour} (V)</button>
        )}
        <button style={btn} onClick={() => setClose((v) => !v)}>{close ? "Full body (F)" : "Face close-up (F)"}</button>
        <button style={btn} onClick={() => setEyeIx((i) => i + 1)}>Eyes: {eyes} (O)</button>
        <button style={btn} onClick={() => setBodyIx((i) => i + 1)}>Body: {body} (B)</button>
        <button style={btn} onClick={() => setFaceIx((i) => i + 1)}>Face: {face} (S)</button>
        <button style={btn} onClick={() => setShadeIx((i) => i + 1)}>Shading: {shading} (T)</button>
        <button style={btn} onClick={() => setBeardIx((i) => i + 1)}>Beard: {beard === "auto" ? `auto (${look.beard})` : beard} (G)</button>
      </div>
      <div style={{ position: "fixed", left: 16, bottom: 16, fontSize: 13, color: "#111", lineHeight: 1.5, zIndex: 5 }}>
        {crowd ? (
          <div>
            <strong>crowd of {count}</strong> · interactions {interact ? "on" : "off"}: <strong>{summary}</strong> · behaviours {auto ? "each their own" : "off"} · expressions {independent || auto ? "independent" : "shared"} · {stats} · {(people[0]?.triangles ?? 0).toFixed(0)} triangles each, 1 mesh each
          </div>
        ) : (
          <>
            <div>
              <strong>{expr.name}</strong> · doing <strong>{behaviour}</strong> · eyes <strong>{eyes}</strong> · body <strong>{body}</strong> ({single.heads.toFixed(1)} heads) · face <strong>{single.face}</strong> · {shading} · seed {seed} · {stats} ({single.triangles.toFixed(0)} triangles in this person)
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
