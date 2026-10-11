import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Color, IcosahedronGeometry, type Group, type Mesh } from "three";
import { appearanceFor, type Appearance } from "../../../shared/appearance.ts";
import { buildHead } from "./head-geo.ts";

// Dev only (`?stage=1`): a bust on a stage. New character gives a random
// person (shape, face, hair, skin), Next expression cycles the face. Nothing
// here is the final body; it is for judging the head, its range and its moods.

interface Expression {
  name: string;
  browY: number; // metres, up
  browTilt: number; // radians; inner ends up is positive
  lid: number; // how far the upper lid is down; negative is wide open
  curve: number; // mouth corners, positive up
  open: number; // 0 closed, 1 open
  width: number;
}
const EXPRESSIONS: Expression[] = [
  { name: "neutral", browY: 0, browTilt: 0, lid: 0.18, curve: 0.3, open: 0, width: 1 },
  { name: "smile", browY: 0.002, browTilt: 0.06, lid: 0.4, curve: 0.85, open: 0, width: 1.25 },
  { name: "curious", browY: 0.006, browTilt: 0.1, lid: 0.08, curve: 0.2, open: 0, width: 0.9 },
  { name: "focused", browY: -0.003, browTilt: -0.28, lid: 0.45, curve: 0.05, open: 0, width: 0.85 },
  { name: "surprised", browY: 0.01, browTilt: 0.05, lid: -0.15, curve: 0, open: 1, width: 0.65 },
  { name: "worried", browY: 0.004, browTilt: 0.4, lid: 0.25, curve: -0.35, open: 0, width: 0.9 },
];

const SHIRTS = ["#2f62b5", "#4a7c59", "#b5503a", "#6b5b95", "#3a3d45", "#c9a24a", "#2a7f8a"];
const shirtFor = (a: Appearance): string => SHIRTS[Math.floor(a.faceWidth * 1000) % SHIRTS.length];

function Figure({ look, expr }: { look: Appearance; expr: Expression }) {
  const head = useMemo(
    () =>
      buildHead(
        { width: look.faceWidth, jaw: look.jaw, brow: look.brow, nose: look.noseSize, cheek: look.cheek, chin: look.chin },
        look.hairStyle,
        look.hairColour,
        look.skin,
      ),
    [look],
  );
  const body = useMemo(() => new IcosahedronGeometry(1, 1), []);
  const hairBack = useMemo(() => new IcosahedronGeometry(1, 1), []);
  const browL = useRef<Mesh>(null);
  const browR = useRef<Mesh>(null);
  const lidL = useRef<Mesh>(null);
  const lidR = useRef<Mesh>(null);
  const mouth = useRef<Group>(null);
  const mouthMid = useRef<Mesh>(null);
  const sway = useRef<Group>(null);
  const cur = useRef({ ...expr });
  const clock = useRef(0);
  const skin = useMemo(() => new Color(look.skin), [look.skin]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    clock.current += dt;
    const k = 1 - Math.exp(-9 * dt);
    const c = cur.current;
    for (const key of ["browY", "browTilt", "lid", "curve", "open", "width"] as const) c[key] += (expr[key] - c[key]) * k;
    // a quick blink every few seconds, so the stare is never fixed
    const blink = clock.current % 3.4 < 0.12 ? 1.2 : 0;
    const lid = Math.min(1.35, c.lid + blink);
    for (const r of [lidL, lidR]) if (r.current) r.current.rotation.x = -lid;
    if (browL.current) {
      browL.current.rotation.z = -c.browTilt;
      browL.current.position.y = 0.032 + c.browY;
    }
    if (browR.current) {
      browR.current.rotation.z = c.browTilt;
      browR.current.position.y = 0.032 + c.browY;
    }
    // the mouth is an arc: its width is the mouth, its height follows the curve
    // (a smile up, a frown down), and it is never quite flat
    const mw = look.mouthWidth * c.width;
    const bend = Math.abs(c.curve) < 0.06 ? 0.06 : c.curve;
    if (mouth.current) mouth.current.scale.set(mw * (1 - c.open * 0.5), bend * (1 - c.open * 0.6), 1);
    if (mouthMid.current) mouthMid.current.scale.set(0.5 + c.open * 1.0, 0.1 + c.open * 2.4, 1);
    if (sway.current) sway.current.rotation.y = Math.sin(clock.current * 0.45) * 0.35;
  });

  const eyeX = 0.034 * look.eyeSpacing * look.faceWidth;
  const eyeR = 0.0105 * look.eyeSize;
  const shoulderW = 0.2 * look.build * (0.75 + 0.35 * look.shoulderHip);
  const shirt = shirtFor(look);
  const browColour = useMemo(() => new Color(look.browColour).multiplyScalar(0.8), [look.browColour, skin]);
  return (
    <group ref={sway} scale={look.headScale}>
      {/* the head, and its hair painted on */}
      <mesh geometry={head}>
        <meshStandardMaterial vertexColors flatShading roughness={0.85} />
      </mesh>
      {/* neck and shoulders, faceted too */}
      <mesh position={[0, -0.125, 0.004]}>
        <cylinderGeometry args={[0.044, 0.05, 0.07, 8]} />
        <meshStandardMaterial color={look.skin} flatShading roughness={0.85} />
      </mesh>
      <mesh geometry={body} position={[0, -0.235, 0.006]} scale={[shoulderW, 0.11, 0.09]}>
        <meshStandardMaterial color={shirt} flatShading roughness={0.85} />
      </mesh>
      {look.hairStyle === "long" && (
        <mesh geometry={hairBack} position={[0, -0.09, 0.07]} scale={[0.086, 0.15, 0.04]}>
          <meshStandardMaterial color={look.hairColour} flatShading roughness={0.85} />
        </mesh>
      )}
      {look.hairStyle === "bun" && (
        <mesh geometry={hairBack} position={[0, 0.095, 0.075]} scale={0.04}>
          <meshStandardMaterial color={look.hairColour} flatShading roughness={0.85} />
        </mesh>
      )}
      {/* ears */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.081 * look.faceWidth, -0.012, 0.006]} scale={[0.4, 1, 0.75]}>
          <icosahedronGeometry args={[0.026, 1]} />
          <meshStandardMaterial color={look.skin} flatShading roughness={0.85} />
        </mesh>
      ))}
      {/* eyes: white, iris, pupil, a highlight, and a lid that comes down */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * eyeX, 0.002, -0.0825]}>
          <mesh>
            <sphereGeometry args={[eyeR, 12, 8]} />
            <meshStandardMaterial color="#f4f2ee" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, -eyeR * 0.78]}>
            <sphereGeometry args={[eyeR * 0.62, 10, 8]} />
            <meshStandardMaterial color={look.eyeColour} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, -eyeR * 1.15]}>
            <sphereGeometry args={[eyeR * 0.3, 8, 6]} />
            <meshStandardMaterial color="#14110f" roughness={0.3} />
          </mesh>
          <mesh position={[s * eyeR * 0.22, eyeR * 0.28, -eyeR * 1.3]}>
            <sphereGeometry args={[eyeR * 0.14, 6, 5]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh ref={s < 0 ? lidL : lidR}>
            <sphereGeometry args={[eyeR * 1.08, 12, 6, 0, Math.PI * 2, 0, 0.95]} />
            <meshStandardMaterial color={look.skin} roughness={0.85} flatShading />
          </mesh>
        </group>
      ))}
      {/* brows, in the hair colour but softened, a little curved by tilt */}
      {[-1, 1].map((s) => (
        <mesh key={s} ref={s < 0 ? browL : browR} position={[s * eyeX, 0.032, -0.0875]}>
          <boxGeometry args={[0.036 * look.eyeSize, 0.007 * (0.7 + look.brow * 0.5), 0.009]} />
          <meshStandardMaterial color={browColour} roughness={0.9} />
        </mesh>
      ))}
      {/* mouth: an arc, and a dark opening that grows for surprise */}
      <group ref={mouth} position={[0, -0.0625, -0.0845]}>
        <mesh position={[0, 0.024, 0]} rotation={[0, 0, -Math.PI / 2 - 0.6]}>
          <torusGeometry args={[0.024, 0.0034, 5, 12, 1.2]} />
          <meshStandardMaterial color="#c0605c" roughness={0.6} flatShading />
        </mesh>
      </group>
      <mesh ref={mouthMid} position={[0, -0.0645, -0.0842]}>
        <sphereGeometry args={[0.008, 8, 6]} />
        <meshStandardMaterial color="#4a1c20" roughness={0.6} />
      </mesh>
    </group>
  );
}

export function CharacterStage() {
  const [seed, setSeed] = useState(() => Number(new URLSearchParams(location.search).get("seed") ?? 1));
  const [ei, setEi] = useState(() => Number(new URLSearchParams(location.search).get("expr") ?? 0));
  const look = useMemo(() => appearanceFor(`person-${seed}`), [seed]);
  const expr = EXPRESSIONS[ei % EXPRESSIONS.length];
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === "n") setSeed((s) => s + 1 + Math.floor(Math.random() * 1000));
      if (e.key === "e") setEi((i) => i + 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const btn = { font: "inherit", fontSize: 14, padding: "8px 14px", borderRadius: 8, border: "1px solid #7a8088", background: "#fff", cursor: "pointer" } as const;
  return (
    <>
      <Canvas camera={{ fov: 28, near: 0.05, far: 20, position: [0, -0.02, -0.95] }} dpr={[1, 1.5]} gl={{ antialias: true }} style={{ position: "fixed", inset: 0 }}>
        <color attach="background" args={["#c9ccd0"]} />
        <hemisphereLight args={["#ffffff", "#9aa0a6", 1.2]} />
        <directionalLight position={[-1.2, 1.4, -2]} intensity={1.5} />
        <directionalLight position={[1.5, 0.4, -1]} intensity={0.5} />
        <Figure look={look} expr={expr} />
        <OrbitControls target={[0, -0.08, 0]} enablePan={false} minDistance={0.4} maxDistance={2} />
      </Canvas>
      <div style={{ position: "fixed", left: 16, top: 16, display: "flex", gap: 8, alignItems: "center", zIndex: 5 }}>
        <button style={btn} onClick={() => setSeed((s) => s + 1 + Math.floor(Math.random() * 1000))}>New character (N)</button>
        <button style={btn} onClick={() => setEi((i) => i + 1)}>Next expression (E)</button>
      </div>
      <div style={{ position: "fixed", left: 16, bottom: 16, fontSize: 13, color: "#111", lineHeight: 1.5, zIndex: 5 }}>
        <div>
          <strong>{expr.name}</strong> · {EXPRESSIONS.length} expressions · seed {seed}
        </div>
        <div>
          height {(1.7 * look.height).toFixed(2)} m · build {look.build.toFixed(2)} · shoulder:hip {look.shoulderHip.toFixed(2)} · hair {look.hairStyle} · head {look.faceWidth.toFixed(2)} wide, jaw {look.jaw.toFixed(2)}
        </div>
      </div>
    </>
  );
}
