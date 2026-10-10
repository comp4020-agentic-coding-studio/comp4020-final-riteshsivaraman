import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

// A simple, lean, human-shaped figure built from primitives, with a walk
// cycle and a few idle poses. Placeholder until real character design; the
// parent positions and turns it, and says how fast it is moving and what it is
// doing through `getState`. Faces -z, like everything else here.

export type Mode = "idle" | "observe" | "work";

export interface PersonState {
  speed: number; // metres per second
  mode: Mode;
}

const SKIN_TONES = ["#f1c9a5", "#d9a679", "#b9835a", "#8d5a3b", "#5e3b27"];
const PANTS = ["#2b2f3a", "#3a3d45", "#4a4036", "#2f3e52"];

// stable pick from a string, so a person keeps their look
function hashPick<T>(s: string, list: T[], salt = 0): T {
  let h = salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
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
  const phase = useRef(0);
  const clock = useRef(0);
  const skin = hashPick(id, SKIN_TONES);
  const pants = hashPick(id, PANTS, 7);

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
    if (armL.current) armL.current.rotation.x = aL;
    if (armR.current) armR.current.rotation.x = aR;
    if (torso.current) torso.current.rotation.x += (lean - torso.current.rotation.x) * 0.15;
    if (head.current) {
      head.current.rotation.x += (headPitch - head.current.rotation.x) * 0.15;
      head.current.rotation.y += (headYaw - head.current.rotation.y) * 0.1;
    }
  });

  return (
    <group ref={root}>
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
        <group ref={head} position={[0, 0.74, 0]}>
          <mesh>
            <sphereGeometry args={[0.115, 16, 12]} />
            <meshStandardMaterial color={skin} roughness={0.65} />
          </mesh>
          {/* nose, so you can tell which way they are looking */}
          <mesh position={[0, -0.01, -0.12]}>
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
