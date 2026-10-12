import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { appearanceFor } from "../../../shared/appearance.ts";
import { BEHAVIOURS, BETWEEN_INTERACTIONS, durationFor, pickBehaviour, pickMood, type Behaviour } from "../../../shared/behaviour.ts";
import { KINDS, layout, stepInteractions, zoneOf, type Active, type SimAgent } from "../../../shared/interaction.ts";
import { freePoint, goalBlocked, headingTo, pushOutOfHard, stepWalker, type Obstacle, type Walker } from "../../../shared/steering.ts";
import { separateFromPeople } from "../../../shared/world.ts";
import { BEARD_CHOICES, BODY_STYLES, buildCharacter, EXPRESSIONS, EYE_STYLES, FACE_SHAPES, poseCharacter, SHADINGS, type Character, type Mood } from "./character.ts";
import { Device } from "./Device.tsx";
import { HELD_DEVICE } from "./Actor.tsx";

// Dev only (`?stage=1`): a full-body person on a stage. New character gives a
// random person, Next expression cycles the face, Walk starts the walk cycle,
// and Crowd puts 40 of them in the room and reports what that costs to draw.

const SHIRTS = ["#2f62b5", "#4a7c59", "#b5503a", "#6b5b95", "#3a3d45", "#c9a24a", "#2a7f8a"];
const shirtFor = (id: string): string => SHIRTS[Math.floor(appearanceFor(id).faceWidth * 1000) % SHIRTS.length];

// One fixed arena, whatever the number of people: the slider reveals people in
// it, it does not change the space. Tables and a counter stand in it, for
// people to walk round.
const MAX_PEOPLE = 60;
const ARENA = { minX: -8, maxX: 8, minZ: -1.5, maxZ: 10 };
const STATIC_OBSTACLES: Obstacle[] = [
  { kind: "disc", x: -4.5, z: 3.0, r: 0.8, hard: true },
  { kind: "disc", x: 4.2, z: 5.2, r: 0.8, hard: true },
  { kind: "disc", x: 0.5, z: 1.4, r: 0.6, hard: true },
  { kind: "rect", minX: -2.2, maxX: 2.2, minZ: 7.0, maxZ: 7.8, hard: true },
];
const PERSON_R = 0.32;

type CrowdMode = "all" | "social" | "solo" | "off";
const CROWD_MODES: CrowdMode[] = ["all", "social", "solo", "off"];
const CROWD_LABEL: Record<CrowdMode, string> = {
  all: "everything",
  social: "interactions only",
  solo: "solo behaviours only",
  off: "nothing (standing)",
};

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
  roamGoal: { x: number; z: number } | null;
  zonesOf: () => Obstacle[]; // the ground other interactions are using
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
  socialOnly: boolean; // between interactions they only stand about and wander
  roam: boolean; // walking moves them about the stage
  agents: AgentState[]; // everyone on the stage (the crowd), to walk round
  agent?: AgentState; // present in the crowd: an interaction can direct this person
  count: number; // how many of the pool are on the stage
}

function Person({ char, seed, offset = 0, expr, manual, walking, auto, independent, socialOnly, roam, agents, agent, count }: PersonProps) {
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
  const walker = useRef<Walker>({ x: 0, z: 0, heading: 0 });
  const progressAt = useRef(0);
  const bestDist = useRef(Infinity);
  useFrame((_, delta) => {
    if (agent && agent.id >= count) return; // not on the stage: costs nothing
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
        const b = pickBehaviour(r(), mode.current, socialOnly ? BETWEEN_INTERACTIONS : undefined);
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
    }
    // everything that is in the way: tables, other people, and the ground other
    // people's interactions are using. (Members of the same interaction do not
    // avoid each other: they are walking to stand together.)
    const obstacleList = (): Obstacle[] => {
      const out: Obstacle[] = [...STATIC_OBSTACLES, ...(agent ? agent.zonesOf() : [])];
      for (const o of agents) {
        if (o === agent || o.id >= count) continue;
        if (agent?.plan && o.plan === agent.plan) continue;
        out.push({ kind: "disc", x: o.char.root.position.x, z: o.char.root.position.z, r: PERSON_R });
      }
      return out;
    };
    const root = char.root;
    if (agent && (directed || (roam && wantWalk))) {
      const w: Walker = walker.current;
      w.x = root.position.x;
      w.z = root.position.z;
      w.heading = heading.current;
      const obs = obstacleList();
      let goal: { walkTo?: { x: number; z: number }; faceTo?: { x: number; z: number } } = {};
      if (dir) {
        goal = { walkTo: dir.walkTo, faceTo: dir.faceTo };
      } else {
        // wander: a waypoint that is clear of everything, and another when it
        // is reached, blocked, or not getting any closer
        const g = agent.roamGoal;
        const stuck = g && t.current - progressAt.current > 3.5;
        if (!g || Math.hypot(g.x - w.x, g.z - w.z) < 0.5 || goalBlocked(g, obs.filter((o) => o.hard)) || stuck) {
          agent.roamGoal = freePoint(r, ARENA, obs.filter((o) => o.hard), 0.9) ?? { x: 0, z: 3 };
          bestDist.current = Infinity;
          progressAt.current = t.current;
        }
        const gg = agent.roamGoal!;
        const dd = Math.hypot(gg.x - w.x, gg.z - w.z);
        if (dd < bestDist.current - 0.25) {
          bestDist.current = dd;
          progressAt.current = t.current;
        }
        goal = { walkTo: gg };
      }
      const res = stepWalker(w, dt, goal, obs);
      root.position.x = w.x;
      root.position.z = w.z;
      heading.current = w.heading;
      root.rotation.y = w.heading;
      wantWalk = res.moving;
    } else if (dir) {
      wantWalk = false;
    }
    if (directed && !wantWalk) {
      // standing: face whoever or whatever they are meant to
      const w: Walker = walker.current;
      w.x = root.position.x;
      w.z = root.position.z;
      w.heading = heading.current;
      if (dir?.faceTo) stepWalker(w, dt, { faceTo: dir.faceTo }, []);
      heading.current = w.heading;
      root.rotation.y = w.heading;
    }
    if (frozen === null) {
      walk.current += ((wantWalk ? 1 : 0) - walk.current) * (1 - Math.exp(-6 * dt));
      phase.current += dt * (3 + walk.current * 2.4) * (walk.current > 0.05 ? 1 : 0);
    }
    const k = 1 - Math.exp(-9 * dt);
    const m = mood.current;
    for (const key of ["browY", "browTilt", "lid", "curve", "open", "width"] as const) m[key] += (target[key] - m[key]) * k;
    const blink = (t.current + offset * 0.7 + 1.7) % 3.4 < 0.12 ? 1.2 : 0; // eyes open at t = 0
    poseCharacter(char, { t: t.current, dt: snapPose ? 1 : dt, walk: walk.current, phase: phase.current, mode: directed ? (wantWalk ? "walk" : mode.current) : mode.current, seed: offset * 7 + seed }, m, blink);
  });
  const held = char.deviceKind ? HELD_DEVICE[char.deviceKind] : undefined;
  const devRef = useRef<Group>(null);
  // see Actor.tsx: a `<primitive>` here would reparent the bone itself, so
  // the held device is attached imperatively instead.
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
          <group position={[0.01, 0.1, 0.02]} rotation={[-1.7, 0, 0.25]}>
            <Device kind={char.deviceKind === "tablet" ? "tablet" : "phone"} model={held.model} colour={held.colour} x={0} y={0} z={0} rotY={0} />
          </group>
        </group>
      )}
    </>
  );
}

// Runs interactions between the people on the stage. The decisions (who starts
// what, where everyone stands, what each does and when it ends) are all in
// shared/interaction.ts, the same function a spec runs for two simulated
// minutes; this only feeds it positions and hands the directives back.
function Interactions({ agents, count, zonesRef, enabled, scene, playAt, onSummary }: { agents: AgentState[]; count: number; zonesRef: { current: Array<{ ap: Active; disc: Obstacle }> }; enabled: boolean; scene: string | null; playAt: number; onSummary: (s: string) => void }) {
  const clock = useRef(0);
  const rand = useRef(rng(424242));
  const active = useRef<Active[]>([]);
  const sceneDone = useRef(false);
  const lastSummary = useRef("");
  const lastCount = useRef(count);
  useFrame((_, delta) => {
    const now = (clock.current += Math.min(delta, 0.05) * SPEED);
    // the people on the stage are the first `count`; if that changes, start
    // the interactions afresh rather than leave someone half-way through one
    if (count !== lastCount.current) {
      lastCount.current = count;
      active.current = [];
      for (const a of agents) {
        a.plan = null;
        a.directive = null;
        a.roamGoal = null;
      }
    }
    for (const a of agents) {
      a.x = a.char.root.position.x;
      a.z = a.char.root.position.z;
    }
    // a scripted scene: a known interaction, already in place, for stills
    if (scene && !sceneDone.current && agents.length > 0) {
      sceneDone.current = true;
      const kind = scene as keyof typeof KINDS;
      if (KINDS[kind]) {
        const k = Math.min(agents.length, { chat: 2, handshake: 2, address: 4, applaud: 6, circle: 4, sitdown: 2 }[kind]);
        // gather them close first, so the layout is built from a tight group
        for (let i = 0; i < k; i++) {
          agents[i].char.root.position.set((i - (k - 1) / 2) * 0.55, 0, 4.8 + (i % 2) * 0.2);
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
    const step = stepInteractions(agents.slice(0, count), active.current, now, rand.current, { enabled });
    active.current = step.active;
    zonesRef.current = active.current.map((ap) => ({ ap, disc: zoneOf(ap.plan) }));
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
function Collision({ people, count }: { people: Character[]; count: number }) {
  useFrame(() => {
    const placed: Array<{ x: number; z: number }> = [];
    for (const c of people.slice(0, count)) {
      const p = c.root.position;
      let q = separateFromPeople(p.x, p.z, placed);
      q = pushOutOfHard(q.x, q.z, STATIC_OBSTACLES); // a shove cannot put anyone in a table
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
    const tz = crowd ? (near ? 4.8 : 4.2) : 0;
    if (crowd && near) camera.position.set(0, 2.4, -1.9);
    else if (crowd) camera.position.set(0, 10, -17);
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
  // What the crowd does: everything, only things with each other, only things
  // alone, or nothing. (The old ?auto and ?interact flags still pick one.)
  const [crowdMode, setCrowdMode] = useState<CrowdMode>(() => {
    const q = new URLSearchParams(location.search);
    const m = q.get("mode") as CrowdMode | null;
    if (m && CROWD_MODES.includes(m)) return m;
    if (q.has("auto") && q.has("interact")) return "all";
    if (q.has("interact")) return "social";
    if (q.has("auto")) return "solo";
    return "off";
  });
  const auto = crowdMode !== "off";
  const interact = crowdMode === "all" || crowdMode === "social";
  const socialOnly = crowdMode === "social";
  const [summary, setSummary] = useState("none right now");
  const scene = new URLSearchParams(location.search).get("scene");
  const [count, setCount] = useState(() => Math.max(1, Math.min(MAX_PEOPLE, Number(new URLSearchParams(location.search).get("n") ?? 24))));
  const zonesRef = useRef<Array<{ ap: Active; disc: Obstacle }>>([]);
  const near = new URLSearchParams(location.search).has("near");
  const playAt = Number(new URLSearchParams(location.search).get("playt") ?? 1.5);
  const [behaveIx, setBehaveIx] = useState(() => Number(new URLSearchParams(location.search).get("behave") ?? 0));
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
  const single = useMemo(() => buildCharacter(look, shirtFor(id), { eyes, body, face, shading, beard, device: "phone" }), [look, id, eyes, body, face, shading, beard]);
  // The whole pool is built once (60 people, one mesh each); the slider only
  // decides how many are on the stage. They are scattered through one fixed
  // arena, clear of the tables and of each other.
  const people = useMemo(() => {
    if (!crowd) return [];
    const r = rng(seed * 131 + 7);
    const spots: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < MAX_PEOPLE; i++) {
      let p = { x: 0, z: 4 };
      for (let tries = 0; tries < 60; tries++) {
        const q = freePoint(r, ARENA, STATIC_OBSTACLES, 1.0, 1) ?? p;
        if (spots.every((o) => Math.hypot(o.x - q.x, o.z - q.z) > 1.2)) {
          p = q;
          break;
        }
        p = q;
      }
      spots.push(p);
    }
    const packed = new URLSearchParams(location.search).has("pack");
    return Array.from({ length: MAX_PEOPLE }, (_, i) => {
      const cid = `crowd-${seed}-${i}`;
      const c = buildCharacter(appearanceFor(cid), shirtFor(cid), { eyes, body, shading });
      // `?pack=1` stacks everyone on one spot, to show the collision pushing
      // them apart
      if (packed) c.root.position.set(((i * 7) % 5) * 0.01, 0, 4 + ((i * 3) % 7) * 0.01);
      else c.root.position.set(spots[i].x, 0, spots[i].z);
      c.root.rotation.y = r() * Math.PI * 2;
      return c;
    });
  }, [crowd, seed, eyes, body, shading]);
  const agents = useMemo<AgentState[]>(
    () =>
      people.map((c, i) => {
        const a: AgentState = {
          id: i,
          char: c,
          directive: null,
          plan: null,
          nextConsider: 1 + (i % 7) * 0.6,
          snapHeading: null,
          roamGoal: null,
          x: c.root.position.x,
          z: c.root.position.z,
          zonesOf: () => [],
        };
        // the ground other people's interactions are using (hard: nobody walks in)
        a.zonesOf = () => zonesRef.current.filter((z) => z.ap !== a.plan).map((z) => z.disc);
        return a;
      }),
    [people],
  );
  // only the first `count` are on the stage
  useEffect(() => {
    people.forEach((c, i) => {
      c.root.visible = i < count;
    });
  }, [people, count]);
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
      if (e.key === "m") setCrowdMode((m) => CROWD_MODES[(CROWD_MODES.indexOf(m) + 1) % CROWD_MODES.length]);
      if (e.key === "x") setIndependent((v) => !v);
      if (e.key === "+" || e.key === "=") setCount((c) => Math.min(MAX_PEOPLE, c + 4));
      if (e.key === "-" || e.key === "_") setCount((c) => Math.max(1, c - 4));
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
            <Person key={`${seed}-${i}`} char={c} seed={seed} offset={i} expr={EXPRESSIONS[i % 2 === 0 ? 0 : 1]} manual="idle" walking={walking} auto={auto} independent={independent} socialOnly={socialOnly} roam agents={agents} agent={agents[i]} count={count} />
          ))
        ) : (
          <Person key={id} char={single} seed={seed} expr={expr} manual={behaviour} walking={walking} auto={false} independent={false} socialOnly={false} roam={false} agents={[]} count={MAX_PEOPLE} />
        )}
        {crowd && <Interactions agents={agents} count={count} zonesRef={zonesRef} enabled={interact} scene={scene} playAt={playAt} onSummary={setSummary} />}
        {crowd && <Collision people={people} count={count} />}
        {crowd && STATIC_OBSTACLES.map((o, i) => (o.kind === "disc" ? (
          <mesh key={i} position={[o.x, 0.45, o.z]}>
            <cylinderGeometry args={[o.r, o.r, 0.9, 20]} />
            <meshStandardMaterial color="#c9a56e" roughness={0.6} />
          </mesh>
        ) : (
          <mesh key={i} position={[(o.minX + o.maxX) / 2, 0.55, (o.minZ + o.maxZ) / 2]}>
            <boxGeometry args={[o.maxX - o.minX, 1.1, o.maxZ - o.minZ]} />
            <meshStandardMaterial color="#b89358" roughness={0.6} />
          </mesh>
        )))}
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
            <button style={btn} onClick={() => setCrowdMode((m) => CROWD_MODES[(CROWD_MODES.indexOf(m) + 1) % CROWD_MODES.length])}>Crowd does: {CROWD_LABEL[crowdMode]} (M)</button>
            <button style={btn} onClick={() => setIndependent((v) => !v)}>Expressions: {independent || auto ? "independent" : "shared"} (X)</button>
            <label style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 8, cursor: "default" }}>
              People
              <input type="range" min={1} max={MAX_PEOPLE} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 160 }} />
              <strong style={{ minWidth: 22, textAlign: "right" }}>{count}</strong>
            </label>
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
            <strong>{count} people</strong> · crowd does <strong>{CROWD_LABEL[crowdMode]}</strong> · interactions now: <strong>{summary}</strong> · expressions {independent || auto ? "independent" : "shared"} · {stats} · {(people[0]?.triangles ?? 0).toFixed(0)} triangles each, 1 mesh each
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
