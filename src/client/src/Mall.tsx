import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { CanvasTexture, DoubleSide, RepeatWrapping, SRGBColorSpace } from "three";
import type { Group } from "three";
import { CEILING, FLOOR, STORE_Y } from "../../shared/protocol.ts";
import { MALL, ROUTES, routePose } from "../../shared/mall.ts";
import { Actor, type ActorState } from "./gfx/Actor.tsx";
import { settledPeople } from "../../shared/people.ts";
import { net } from "./net.ts";

// The mall around the store, which is on the first floor: a walkway outside
// the glass with a balustrade, the atrium void down to the ground-floor
// concourse (shopfronts under the walkway and opposite), the opposite
// first-floor walkway, and an atrium roof. Plain geometry and flat colour,
// like the store. The people come from the shared route model
// (shared/mall.ts), drawn at server time.

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Pale stone with diagonal bands, a loose echo of the chevron paving.
function paving(depth: number): CanvasTexture {
  const tex = canvasTexture(256, 256, (g) => {
    g.fillStyle = "#cdd0d4";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#b3b7bc";
    for (let i = -256; i < 512; i += 64) {
      g.save();
      g.translate(i, 0);
      g.rotate(Math.PI / 4);
      g.fillRect(0, -64, 20, 512);
      g.restore();
    }
    g.fillStyle = "#e3e5e8";
    for (let i = -256; i < 512; i += 64) {
      g.save();
      g.translate(i + 32, 0);
      g.rotate(Math.PI / 4);
      g.fillRect(0, -64, 8, 512);
      g.restore();
    }
  });
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set((MALL.maxX - MALL.minX) / 6, depth / 6);
  return tex;
}

function signTexture(text: string, bg: string): CanvasTexture {
  return canvasTexture(256, 64, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = "#ffffff";
    g.font = "bold 30px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, 34);
  });
}

const SHOPS: Array<[string, string]> = [
  ["CAFE", "#7a4a2b"],
  ["SHOES", "#2f4b7c"],
  ["BOOKS", "#3d6b4f"],
  ["TOYS", "#b5483a"],
  ["OPTICAL", "#4a4a7a"],
  ["PHARMACY", "#2e7d6b"],
  ["BAKERY", "#a8742c"],
  ["GIFTS", "#8a3d6b"],
];

// One shopfront: a facade, a lit window onto a dim interior, and a sign.
function Shopfront({
  x,
  z,
  y,
  width,
  height,
  label,
  colour,
  facing,
}: {
  x: number;
  z: number;
  y: number;
  width: number;
  height: number;
  label: string;
  colour: string;
  facing: 1 | -1; // 1 faces +z (into the concourse from the far row), -1 faces -z
}) {
  const map = useMemo(() => signTexture(label, colour), [label, colour]);
  const window = useMemo(() => {
    let h = 7;
    for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const r = (k: number): number => {
      const t = Math.sin((h + k * 97) * 12.9898) * 43758.5453;
      return t - Math.floor(t);
    };
    const tones = ["#e9d7c3", "#d3e1ea", "#e5d0dc", "#d9e5cf", "#f0e2b8", "#cfd6e8"];
    const picks = ["#c0392b", "#2e86ab", "#d98e04", "#6c4f9c", "#2f9e8f", "#444b55", "#e8e1d4"];
    const mannequin = r(1) < 0.5;
    const n = Math.max(2, Math.min(5, Math.floor((width - 2) / 1.6)));
    const items = Array.from({ length: n }, (_, k) => ({
      x: ((k + 0.5) / n - 0.5) * (width - 2.6),
      mannequin: mannequin && k % 2 === 0,
      colour: picks[Math.floor(r(k + 3) * picks.length)],
      w: 0.25 + r(k + 9) * 0.35,
      h: 0.25 + r(k + 15) * 0.5,
    }));
    return { back: tones[Math.floor(r(2) * tones.length)], items };
  }, [label, width]);
  const rot = facing === 1 ? 0 : Math.PI;
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, 0.3]} />
        <meshStandardMaterial color="#d3d6da" />
      </mesh>
      {/* window onto a lit interior: a tinted back wall, a warm light strip,
          frame bars, and a few things on display (different in every shop) */}
      <mesh position={[0, height * 0.4, 0.17]}>
        <planeGeometry args={[width - 1.2, height * 0.55]} />
        <meshBasicMaterial color="#f3ead6" toneMapped={false} />
      </mesh>
      <mesh position={[0, height * 0.4, 0.18]}>
        <planeGeometry args={[width - 1.8, height * 0.45]} />
        <meshBasicMaterial color={window.back} toneMapped={false} />
      </mesh>
      <mesh position={[0, height * 0.4 + height * 0.2, 0.19]}>
        <planeGeometry args={[width - 2.2, 0.08]} />
        <meshBasicMaterial color="#fff6dc" toneMapped={false} />
      </mesh>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * (width - 1.2) / 2, height * 0.4, 0.2]}>
          <boxGeometry args={[0.08, height * 0.55, 0.06]} />
          <meshStandardMaterial color="#8d9399" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {window.items.map((it, k) => (
        <group key={k} position={[it.x, height * 0.4 - height * 0.2, 0.3]}>
          <mesh position={[0, 0.12, 0]}>
            <boxGeometry args={[0.7, 0.24, 0.5]} />
            <meshStandardMaterial color="#e9e4da" roughness={0.7} />
          </mesh>
          {it.mannequin ? (
            <>
              <mesh position={[0, 0.8, 0]}>
                <cylinderGeometry args={[0.2, 0.26, 0.9, 10]} />
                <meshStandardMaterial color={it.colour} roughness={0.8} />
              </mesh>
              <mesh position={[0, 1.4, 0]}>
                <sphereGeometry args={[0.13, 10, 8]} />
                <meshStandardMaterial color="#d8d2c8" roughness={0.6} />
              </mesh>
            </>
          ) : (
            <mesh position={[0, 0.24 + it.h / 2, 0]}>
              <boxGeometry args={[it.w, it.h, 0.3]} />
              <meshStandardMaterial color={it.colour} roughness={0.5} />
            </mesh>
          )}
        </group>
      ))}
      {/* sign band */}
      <mesh position={[0, height * 0.86, 0.17]}>
        <planeGeometry args={[Math.min(5, width - 1), 1.1]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}

// A round fountain: a stone basin, still blue water, and a short jet.
function Fountain({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[1.6, 1.7, 0.5, 28]} />
        <meshStandardMaterial color="#b9bdc2" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.46, 0]}>
        <cylinderGeometry args={[1.45, 1.45, 0.06, 28]} />
        <meshStandardMaterial color="#5aa7c7" roughness={0.1} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.04, 0.09, 0.9, 8]} />
        <meshStandardMaterial color="#cfe9f5" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// A potted palm: a ribbed trunk and a crown of long leaves.
function Palm({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.55, 0.45, 0.6, 12]} />
        <meshStandardMaterial color="#8d9399" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.08, 0.14, 2.8, 8]} />
        <meshStandardMaterial color="#7a5a3a" roughness={0.9} />
      </mesh>
      {Array.from({ length: 7 }, (_, k) => (
        <mesh key={k} position={[Math.cos((k / 7) * Math.PI * 2) * 0.5, 3.1, Math.sin((k / 7) * Math.PI * 2) * 0.5]} rotation={[Math.sin((k / 7) * Math.PI * 2) * 0.9, 0, -Math.cos((k / 7) * Math.PI * 2) * 0.9]}>
          <coneGeometry args={[0.18, 1.5, 5]} />
          <meshStandardMaterial color="#4f8a4c" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// A planter: a squat box with a rounded clump of foliage.
function Planter({ x, z, y = 0 }: { x: number; z: number; y?: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.0, 0.6, 1.0]} />
        <meshStandardMaterial color="#8d9399" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.7, 14, 10]} />
        <meshStandardMaterial color="#4f8a4c" roughness={0.9} />
      </mesh>
      <mesh position={[0.35, 0.8, 0.2]}>
        <sphereGeometry args={[0.4, 12, 8]} />
        <meshStandardMaterial color="#5f9a58" roughness={0.9} />
      </mesh>
    </group>
  );
}

// A bench with a wooden seat on two steel ends, like the ones in the atrium.
function ParkBench({ x, z, rot = 0 }: { x: number; z: number; rot?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.2, 0.08, 0.5]} />
        <meshStandardMaterial color="#c9a46b" roughness={0.6} />
      </mesh>
      {[-0.9, 0.9].map((dx) => (
        <mesh key={dx} position={[dx, 0.22, 0]}>
          <boxGeometry args={[0.06, 0.44, 0.45]} />
          <meshStandardMaterial color="#6b7076" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

// A round kiosk with a counter, a sign and a canopy: the middle of the atrium.
function Kiosk({ x, z }: { x: number; z: number }) {
  const map = useMemo(() => signTexture("CAFE", "#7a4a2b"), []);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[2.2, 2.2, 1.1, 28]} />
        <meshStandardMaterial color="#efece4" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.12, 0]}>
        <cylinderGeometry args={[2.4, 2.4, 0.08, 28]} />
        <meshStandardMaterial color="#c9a46b" roughness={0.5} />
      </mesh>
      <mesh position={[0, 3.2, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 0.12, 28]} />
        <meshStandardMaterial color="#d3d6da" />
      </mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[Math.cos((k * Math.PI) / 2 + 0.78) * 2.2, 1.7, Math.sin((k * Math.PI) / 2 + 0.78) * 2.2]}>
          <cylinderGeometry args={[0.05, 0.05, 3.1, 8]} />
          <meshStandardMaterial color="#6b7076" metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 3.5, 2.45]}>
        <planeGeometry args={[3.4, 0.85]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Mall() {
  const depthGround = MALL.walkwayZ - MALL.farZ;
  const floor = useMemo(() => paving(depthGround), [depthGround]);
  const walkDepth = MALL.frontZ - MALL.walkwayZ;
  const walkFloor = useMemo(() => paving(walkDepth), [walkDepth]);
  const w = MALL.maxX - MALL.minX;
  const zGround = (MALL.walkwayZ + MALL.farZ) / 2;
  const zWalk = (MALL.frontZ + MALL.walkwayZ) / 2;
  const zRoof = (MALL.frontZ + MALL.farZ) / 2;
  const dRoof = MALL.frontZ - MALL.farZ;
  const ribs = useMemo(
    () =>
      (() => {
        const t = canvasTexture(64, 64, (g) => {
          g.fillStyle = "#3f4f57";
          g.fillRect(0, 0, 64, 64);
          g.fillStyle = "#2c3940";
          for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 64);
        });
        t.wrapS = t.wrapT = RepeatWrapping;
        t.repeat.set(30, 1);
        return t;
      })(),
    [],
  );

  // neighbouring shops on the first floor, left and right of the store
  const near: Array<{ x: number; i: number }> = [];
  for (let k = 0; k < 3; k++) {
    near.push({ x: -(FLOOR.maxX + 5.1 + k * 9), i: k });
    near.push({ x: FLOOR.maxX + 5.1 + k * 9, i: k + 3 });
  }
  const far: Array<{ x: number; i: number }> = [];
  for (let k = -3; k <= 3; k++) far.push({ x: k * 9.5, i: Math.abs(k) + 1 });
  // ground-floor shopfronts under the walkway
  const under: Array<{ x: number; i: number }> = [];
  for (let k = -3; k <= 3; k++) under.push({ x: k * 9.5, i: Math.abs(k) + 2 });
  const railY = STORE_Y + 1.17;

  return (
    <group>
      {/* ground-floor concourse: the atrium floor, seen from the walkway */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, zGround]}>
        <planeGeometry args={[w, depthGround]} />
        <meshStandardMaterial map={floor} roughness={0.7} />
      </mesh>
      {/* atrium roof, with skylight strips */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, MALL.ceilingY, zRoof]}>
        <planeGeometry args={[w, dRoof]} />
        <meshStandardMaterial color="#e7e9ec" emissive="#ffffff" emissiveIntensity={0.4} />
      </mesh>
      {Array.from({ length: 11 }, (_, k) => -30 + k * 6).map((x) => (
        <mesh key={x} position={[x, MALL.ceilingY - 0.02, zRoof]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.6, dRoof - 3]} />
          <meshBasicMaterial color="#f7fbff" />
        </mesh>
      ))}

      {/* the first-floor walkway outside the glass: a slab and paving, a glass
          balustrade with a rail at its far edge, columns down to the ground */}
      <mesh position={[0, STORE_Y - 0.15, zWalk]}>
        <boxGeometry args={[w, 0.3, walkDepth]} />
        <meshStandardMaterial color="#cfd2d6" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, STORE_Y + 0.005, zWalk]}>
        <planeGeometry args={[w, walkDepth]} />
        <meshStandardMaterial map={walkFloor} roughness={0.7} />
      </mesh>
      <mesh position={[0, STORE_Y + 0.6, MALL.walkwayZ]}>
        <boxGeometry args={[w, 1.1, 0.04]} />
        <meshPhysicalMaterial color="#cfe6f0" transparent opacity={0.22} roughness={0.05} />
      </mesh>
      <mesh position={[0, railY, MALL.walkwayZ]}>
        <boxGeometry args={[w, 0.06, 0.1]} />
        <meshStandardMaterial color="#6b7076" metalness={0.5} roughness={0.4} />
      </mesh>
      {Array.from({ length: 9 }, (_, k) => -32 + k * 8).map((x) => (
        <mesh key={`wc${x}`} position={[x, STORE_Y / 2, MALL.walkwayZ + 0.3]}>
          <cylinderGeometry args={[0.28, 0.28, STORE_Y, 14]} />
          <meshStandardMaterial color="#b9bdc2" />
        </mesh>
      ))}

      {/* the store's own fascia, above its glass front */}
      <mesh position={[0, (STORE_Y + CEILING + MALL.ceilingY) / 2, MALL.frontZ - 0.1]}>
        <boxGeometry args={[FLOOR.maxX - FLOOR.minX + 2, MALL.ceilingY - STORE_Y - CEILING, 0.3]} />
        <meshStandardMaterial map={ribs} />
      </mesh>

      {/* neighbouring shops, level with the store on the first floor */}
      {near.map((s) => (
        <Shopfront
          key={s.x}
          x={s.x}
          z={MALL.frontZ - 0.1}
          y={STORE_Y}
          width={9}
          height={CEILING + 0.2}
          label={SHOPS[s.i % SHOPS.length][0]}
          colour={SHOPS[s.i % SHOPS.length][1]}
          facing={-1}
        />
      ))}
      {/* solid wall above them up to the roof */}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * 24, (STORE_Y + CEILING + MALL.ceilingY) / 2, MALL.frontZ - 0.1]}>
          <boxGeometry args={[30, MALL.ceilingY - STORE_Y - CEILING, 0.3]} />
          <meshStandardMaterial color="#c8ccd1" />
        </mesh>
      ))}

      {/* ground-floor shopfronts under the walkway, facing the atrium */}
      {under.map((s) => (
        <Shopfront
          key={`g${s.x}`}
          x={s.x}
          z={MALL.walkwayZ + 0.5}
          y={0}
          width={9}
          height={STORE_Y - 0.4}
          label={SHOPS[s.i % SHOPS.length][0]}
          colour={SHOPS[s.i % SHOPS.length][1]}
          facing={-1}
        />
      ))}

      {/* opposite shopfronts: ground level, then the first floor above */}
      {far.map((s) => (
        <Shopfront
          key={`f${s.x}`}
          x={s.x}
          z={MALL.farZ}
          y={0}
          width={9}
          height={MALL.mezzanineY - 0.2}
          label={SHOPS[s.i % SHOPS.length][0]}
          colour={SHOPS[s.i % SHOPS.length][1]}
          facing={1}
        />
      ))}
      {far.map((s) => (
        <Shopfront
          key={`u${s.x}`}
          x={s.x}
          z={MALL.farZ}
          y={MALL.mezzanineY + 0.1}
          width={9}
          height={MALL.ceilingY - MALL.mezzanineY - 0.3}
          label={SHOPS[(s.i + 3) % SHOPS.length][0]}
          colour={SHOPS[(s.i + 3) % SHOPS.length][1]}
          facing={1}
        />
      ))}

      {/* the opposite first-floor walkway: slab, glass balustrade and rail, columns */}
      <mesh position={[0, MALL.mezzanineY - 0.15, (MALL.mezzanineZ0 + MALL.mezzanineZ1) / 2]}>
        <boxGeometry args={[w, 0.3, MALL.mezzanineZ1 - MALL.mezzanineZ0]} />
        <meshStandardMaterial color="#cfd2d6" />
      </mesh>
      <mesh position={[0, MALL.mezzanineY + 0.6, MALL.mezzanineZ1]}>
        <boxGeometry args={[w, 1.1, 0.04]} />
        <meshPhysicalMaterial color="#cfe6f0" transparent opacity={0.22} roughness={0.05} />
      </mesh>
      <mesh position={[0, MALL.mezzanineY + 1.17, MALL.mezzanineZ1]}>
        <boxGeometry args={[w, 0.06, 0.1]} />
        <meshStandardMaterial color="#6b7076" metalness={0.5} roughness={0.4} />
      </mesh>
      {Array.from({ length: 9 }, (_, k) => -32 + k * 8).map((x) => (
        <mesh key={x} position={[x, MALL.mezzanineY / 2, MALL.mezzanineZ1 + 0.3]}>
          <cylinderGeometry args={[0.28, 0.28, MALL.mezzanineY, 14]} />
          <meshStandardMaterial color="#b9bdc2" />
        </mesh>
      ))}

      {/* the atrium floor: a kiosk, benches and planters, hanging lamps */}
      <Kiosk x={0} z={MALL.walkwayZ - 9} />
      {[-18, -9, 9, 18].map((x) => (
        <ParkBench key={x} x={x} z={MALL.walkwayZ - 8} />
      ))}
      {[-24, -14, 14, 24].map((x) => (
        <Planter key={`p${x}`} x={x} z={MALL.walkwayZ - 6} />
      ))}
      {[-26, -13, 13, 26].map((x) => (
        <Planter key={`q${x}`} x={x} z={MALL.walkwayZ - 11.5} />
      ))}
      {/* hanging banners down the atrium, and a fountain at its heart */}
      {Array.from({ length: 6 }, (_, k) => -22.5 + k * 9).map((x, k) => (
        <mesh key={`banner${x}`} position={[x, MALL.ceilingY - 3.4, zGround + 1.5]} rotation={[0, 0, 0]}>
          <planeGeometry args={[1.1, 3.2]} />
          <meshBasicMaterial color={["#2e86ab", "#d98e04", "#6c4f9c", "#2f9e8f", "#c0392b", "#44546a"][k % 6]} side={DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      <Fountain x={-9} z={MALL.walkwayZ - 14} />
      <Fountain x={9} z={MALL.walkwayZ - 14} />
      {[-30, -20, 20, 30].map((x) => (
        <Palm key={`palm${x}`} x={x} z={MALL.walkwayZ - 9} />
      ))}
      {Array.from({ length: 7 }, (_, k) => -27 + k * 9).map((x) => (
        <group key={`lamp${x}`} position={[x, MALL.ceilingY - 1.6, zGround + 4]}>
          <mesh position={[0, 0.8, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 1.6, 6]} />
            <meshStandardMaterial color="#6b7076" />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.28, 14, 10]} />
            <meshBasicMaterial color="#fff6e0" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Everyone on the concourse and the mezzanine, from the shared routes.
export function MallPeople() {
  const root = useRef<Group>(null);
  const states = useRef<ActorState[]>(ROUTES.map(() => ({ walking: false, mode: "idle", mood: "neutral" })));
  const shown = useRef(new Map<string, { x: number; z: number }>());

  useFrame(() => {
    const now = net.serverNow();
    const walkway = settledPeople(now).walkway;
    root.current?.children.forEach((child, i) => {
      const r = ROUTES[i];
      const p = routePose(r, now);
      const at = walkway.get(r.id) ?? p; // people on the store's floor collide
      const k = shown.current.get(r.id);
      const nx = k ? k.x + (at.x - k.x) * 0.25 : at.x;
      const nz = k ? k.z + (at.z - k.z) * 0.25 : at.z;
      shown.current.set(r.id, { x: nx, z: nz });
      child.position.set(nx, p.y, nz);
      child.rotation.y = p.ry;
      states.current[i] = { walking: p.walking, mode: p.walking ? "walk" : "observe", mood: p.walking ? "neutral" : "curious", speed: p.walking ? r.speed : 0 };
    });
  });

  return (
    <group ref={root}>
      {ROUTES.map((r, i) => (
        <group key={r.id}>
          <Actor id={r.id} shirt={r.colour} getState={() => states.current[i]} />
        </group>
      ))}
    </group>
  );
}
