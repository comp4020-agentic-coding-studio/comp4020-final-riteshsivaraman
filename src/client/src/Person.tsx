import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { CanvasTexture } from "three";
import { appearanceFor } from "../../shared/appearance.ts";
import type { Group } from "three";

// A simple, lean, human-shaped figure built from primitives, with a walk
// cycle and a few idle poses. Placeholder until real character design; the
// parent positions and turns it, and says how fast it is moving and what it is
// doing through `getState`. Faces -z, like everything else here.

export type Mode = "idle" | "observe" | "work";

export type Mood = "neutral" | "smile" | "curious" | "focused" | "surprised" | "worried";

export interface PersonState {
  speed: number; // metres per second
  mode: Mode;
  mood?: Mood; // face; if left out it follows what they are doing
}

// What each expression does to the face. brow: height (m) and the tilt of
// each brow (radians, positive raises the outer end... see below); curve is
// the mouth corners (positive up, a smile; negative down); open is how far the
// mouth is open.
interface Face {
  browY: number;
  browL: number;
  browR: number;
  browLY: number;
  browRY: number;
  curve: number;
  open: number;
  width: number;
}
const FACES: Record<Mood, Face> = {
  neutral: { browY: 0, browL: 0, browR: 0, browLY: 0, browRY: 0, curve: 0.05, open: 0, width: 1 },
  smile: { browY: 0.004, browL: -0.12, browR: 0.12, browLY: 0, browRY: 0, curve: 0.55, open: 0.0, width: 1.25 },
  curious: { browY: 0.004, browL: 0, browR: 0, browLY: 0.01, browRY: -0.004, curve: 0.12, open: 0, width: 0.8 },
  focused: { browY: -0.008, browL: 0.35, browR: -0.35, browLY: 0, browRY: 0, curve: 0, open: 0, width: 0.7 },
  surprised: { browY: 0.016, browL: 0, browR: 0, browLY: 0, browRY: 0, curve: 0, open: 1, width: 0.5 },
  worried: { browY: 0.006, browL: -0.45, browR: 0.45, browLY: 0, browRY: 0, curve: -0.4, open: 0, width: 0.9 },
};

let blob: CanvasTexture | null = null;
function personBlob(): CanvasTexture {
  if (blob) return blob;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, "rgba(15,18,24,0.5)");
  r.addColorStop(1, "rgba(15,18,24,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  blob = new CanvasTexture(canvas);
  return blob;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function Person({
  id,
  shirt,
  cap,
  getState,
}: {
  id: string;
  shirt: string;
  cap?: string; // staff cap colour; a cap and badge mark staff for now
  getState: () => PersonState;
}) {
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const root = useRef<Group>(null);
  const browL = useRef<Group>(null);
  const browR = useRef<Group>(null);
  const mouthL = useRef<Group>(null);
  const mouthR = useRef<Group>(null);
  const mouthMid = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const face = useRef<Face>({ ...FACES.neutral });
  const blinkAt = useRef(2 + (id.length % 5));
  const phase = useRef(0);
  const clock = useRef(0);
  // body shape, skin and trousers come from the id (shared/appearance.ts)
  const look = appearanceFor(id);
  const { skin, pants } = look;

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    clock.current += dt;
    const t = clock.current;
    const { speed, mode } = getState();
    const walk = clamp01(speed / 1.4);
    phase.current += dt * (3 + speed * 2.4) * (walk > 0.05 ? 1 : 0);
    const s = Math.sin(phase.current);

    // walk cycle: opposite legs and arms swing, a small bob on each step
    const leg = s * 0.75 * walk;
    const arm = s * 0.6 * walk;
    if (legL.current) legL.current.rotation.x = leg;
    if (legR.current) legR.current.rotation.x = -leg;
    if (root.current) root.current.position.y = Math.abs(s) * 0.035 * walk;

    // poses (negative x rotation: lean or look forward and down; positive: an
    // arm swung forward)
    let lean = 0;
    let headPitch = 0;
    let headYaw = 0;
    let aL = -arm;
    let aR = arm;
    if (walk < 0.05) {
      aL = 0.08;
      aR = 0.08;
      if (mode === "observe") {
        // looking at a product: lean in, head down, a hand up to the chin
        lean = -0.28 + Math.sin(t * 0.8) * 0.02;
        headPitch = -0.38;
        aR = 1.25;
        aL = 0.25;
      } else if (mode === "work") {
        // at a bench: leaning over it, both hands busy
        lean = -0.22;
        headPitch = -0.45;
        aL = 1.05 + Math.sin(t * 5) * 0.08;
        aR = 1.05 + Math.sin(t * 5 + 1.7) * 0.08;
      } else {
        // standing: a slow look around
        headYaw = Math.sin(t * 0.55 + id.length) * 0.45;
        aL = 0.12 + Math.sin(t * 1.1) * 0.03;
        aR = 0.12;
      }
    }
    // expression: the mood asked for, else one that fits what they are doing
    const wanted: Mood =
      getState().mood ??
      (walk > 0.05 ? "neutral" : mode === "observe" ? "curious" : mode === "work" ? "focused" : cap ? "smile" : "neutral");
    const target = FACES[wanted];
    const f = face.current;
    const k = 1 - Math.exp(-8 * dt);
    for (const key of Object.keys(target) as Array<keyof Face>) f[key] += (target[key] - f[key]) * k;
    // a slow, small smile now and then keeps a still person from looking painted
    const idleSmile = walk < 0.05 && wanted === "neutral" ? Math.max(0, Math.sin(t * 0.3 + id.length)) * 0.35 : 0;
    const curve = f.curve + idleSmile;
    if (browL.current) {
      browL.current.rotation.z = f.browL;
      browL.current.position.y = 0.052 + f.browY + f.browLY;
    }
    if (browR.current) {
      browR.current.rotation.z = f.browR;
      browR.current.position.y = 0.052 + f.browY + f.browRY;
    }
    if (mouthL.current) {
      mouthL.current.rotation.z = -curve;
      mouthL.current.position.y = -0.047 + curve * 0.006;
      mouthL.current.scale.x = f.width * (1 - f.open * 0.9);
    }
    if (mouthR.current) {
      mouthR.current.rotation.z = curve;
      mouthR.current.position.y = -0.047 + curve * 0.006;
      mouthR.current.scale.x = f.width * (1 - f.open * 0.9);
    }
    if (mouthMid.current) mouthMid.current.scale.set(0.4 + f.open * 0.9, 0.2 + f.open * 2.4, 1);
    // blink: eyes close for a moment every few seconds
    if (t > blinkAt.current) {
      if (t > blinkAt.current + 0.12) blinkAt.current = t + 2.5 + ((id.charCodeAt(0) + Math.floor(t)) % 4);
      if (eyes.current) eyes.current.scale.y = 0.1;
    } else if (eyes.current) eyes.current.scale.y = 1;

    if (armL.current) armL.current.rotation.x = aL;
    if (armR.current) armR.current.rotation.x = aR;
    if (torso.current) torso.current.rotation.x += (lean - torso.current.rotation.x) * 0.15;
    if (head.current) {
      head.current.rotation.x += (headPitch - head.current.rotation.x) * 0.15;
      head.current.rotation.y += (headYaw - head.current.rotation.y) * 0.1;
    }
  });

  return (
    <group ref={root} scale={[look.height * look.build, look.height, look.height * look.build]}>
      {/* a soft shadow on the floor under them */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.42, 20]} />
        <meshBasicMaterial map={personBlob()} transparent depthWrite={false} />
      </mesh>
      {/* legs, pivoting at the hips */}
      {[
        { ref: legL, x: -0.09 },
        { ref: legR, x: 0.09 },
      ].map((l) => (
        <group key={l.x} ref={l.ref} position={[l.x, 0.9, 0]}>
          <mesh position={[0, -0.44, 0]}>
            <capsuleGeometry args={[0.065, 0.68, 4, 8]} />
            <meshStandardMaterial color={pants} roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.86, -0.03]}>
            <boxGeometry args={[0.1, 0.06, 0.2]} />
            <meshStandardMaterial color="#e9e9e9" roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* upper body, pivoting at the hips so it can lean */}
      <group ref={torso} position={[0, 0.9, 0]}>
        <mesh position={[0, 0.3, 0]} scale={[1, 1, 0.66]}>
          <capsuleGeometry args={[0.16, 0.36, 4, 10]} />
          <meshStandardMaterial color={shirt} roughness={0.75} />
        </mesh>
        {[
          { ref: armL, x: -0.23 },
          { ref: armR, x: 0.23 },
        ].map((a) => (
          <group key={a.x} ref={a.ref} position={[a.x, 0.52, 0]}>
            <mesh position={[0, -0.27, 0]}>
              <capsuleGeometry args={[0.042, 0.46, 4, 8]} />
              <meshStandardMaterial color={shirt} roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.57, 0]}>
              <sphereGeometry args={[0.045, 8, 6]} />
              <meshStandardMaterial color={skin} roughness={0.7} />
            </mesh>
          </group>
        ))}
        {/* neck and head */}
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[0.05, 0.055, 0.1, 8]} />
          <meshStandardMaterial color={skin} roughness={0.7} />
        </mesh>
        <group ref={head} position={[0, 0.74, 0]} scale={look.headScale}>
          <mesh>
            <sphereGeometry args={[0.115, 16, 12]} />
            <meshStandardMaterial color={skin} roughness={0.65} />
          </mesh>
          {/* face: eyes, brows and mouth, which change with the expression */}
          <group ref={eyes} position={[0, 0.022, -0.104]}>
            {[-0.04, 0.04].map((x) => (
              <mesh key={x} position={[x, 0, 0]}>
                <sphereGeometry args={[0.0155, 8, 6]} />
                <meshStandardMaterial color="#1b1b1f" roughness={0.3} />
              </mesh>
            ))}
          </group>
          <group ref={browL} position={[-0.04, 0.052, -0.103]}>
            <mesh>
              <boxGeometry args={[0.04, 0.008, 0.01]} />
              <meshStandardMaterial color="#3a2a1f" roughness={0.8} />
            </mesh>
          </group>
          <group ref={browR} position={[0.04, 0.052, -0.103]}>
            <mesh>
              <boxGeometry args={[0.04, 0.008, 0.01]} />
              <meshStandardMaterial color="#3a2a1f" roughness={0.8} />
            </mesh>
          </group>
          <group ref={mouthL} position={[-0.016, -0.047, -0.105]}>
            <mesh>
              <boxGeometry args={[0.03, 0.007, 0.008]} />
              <meshStandardMaterial color="#7a2f2f" roughness={0.6} />
            </mesh>
          </group>
          <group ref={mouthR} position={[0.016, -0.047, -0.105]}>
            <mesh>
              <boxGeometry args={[0.03, 0.007, 0.008]} />
              <meshStandardMaterial color="#7a2f2f" roughness={0.6} />
            </mesh>
          </group>
          <group ref={mouthMid} position={[0, -0.047, -0.106]} scale={[0.4, 0.2, 1]}>
            <mesh>
              <boxGeometry args={[0.03, 0.012, 0.008]} />
              <meshStandardMaterial color="#4a1a1a" roughness={0.6} />
            </mesh>
          </group>
          {/* nose, so you can tell which way they are looking */}
          <mesh position={[0, 0.0, -0.118]}>
            <boxGeometry args={[0.04, 0.05, 0.04]} />
            <meshStandardMaterial color={skin} roughness={0.65} />
          </mesh>
          {cap && (
            <>
              <mesh position={[0, 0.09, 0]}>
                <cylinderGeometry args={[0.12, 0.125, 0.07, 14]} />
                <meshStandardMaterial color={cap} roughness={0.6} />
              </mesh>
              <mesh position={[0, 0.06, -0.12]}>
                <boxGeometry args={[0.16, 0.015, 0.1]} />
                <meshStandardMaterial color={cap} roughness={0.6} />
              </mesh>
            </>
          )}
        </group>
        {cap && (
          <mesh position={[0.1, 0.42, -0.11]}>
            <boxGeometry args={[0.1, 0.13, 0.015]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        )}
      </group>
    </group>
  );
}
