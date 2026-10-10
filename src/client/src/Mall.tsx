import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import type { Group } from "three";
import { CEILING, FLOOR } from "../../shared/protocol.ts";
import { MALL, ROUTES, routePose } from "../../shared/mall.ts";
import { Person, type PersonState } from "./Person.tsx";
import { net } from "./net.ts";

// The mall around the store: a concourse along the glass front, shopfronts on
// both sides, a mezzanine walkway opposite, and an atrium roof. Plain geometry
// and flat colour, like the store. The people on it come from the shared route
// model (shared/mall.ts), drawn at server time.

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
function paving(): CanvasTexture {
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
  tex.repeat.set((MALL.maxX - MALL.minX) / 6, (MALL.frontZ - MALL.farZ) / 6);
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
  const rot = facing === 1 ? 0 : Math.PI;
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, 0.3]} />
        <meshStandardMaterial color="#d3d6da" />
      </mesh>
      {/* window onto a dim interior */}
      <mesh position={[0, height * 0.4, 0.17]}>
        <planeGeometry args={[width - 1.2, height * 0.55]} />
        <meshBasicMaterial color="#f3ead6" toneMapped={false} />
      </mesh>
      <mesh position={[0, height * 0.4, 0.18]}>
        <planeGeometry args={[width - 1.8, height * 0.45]} />
        <meshBasicMaterial color="#c9b995" toneMapped={false} />
      </mesh>
      {/* sign band */}
      <mesh position={[0, height * 0.86, 0.17]}>
        <planeGeometry args={[Math.min(5, width - 1), 1.1]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Mall() {
  const floor = useMemo(() => paving(), []);
  const w = MALL.maxX - MALL.minX;
  const d = MALL.frontZ - MALL.farZ;
  const zc = (MALL.frontZ + MALL.farZ) / 2;
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

  // neighbouring shops: left and right of the store along the near row
  const near: Array<{ x: number; i: number }> = [];
  for (let k = 0; k < 3; k++) {
    near.push({ x: -13.5 - k * 9, i: k });
    near.push({ x: 13.5 + k * 9, i: k + 3 });
  }
  const far: Array<{ x: number; i: number }> = [];
  for (let k = -3; k <= 3; k++) far.push({ x: k * 9.5, i: Math.abs(k) + 1 });

  return (
    <group>
      {/* concourse floor and atrium roof, with skylight strips */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, zc]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={floor} roughness={0.7} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, MALL.ceilingY, zc]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#e7e9ec" emissive="#ffffff" emissiveIntensity={0.4} />
      </mesh>
      {Array.from({ length: 11 }, (_, k) => -30 + k * 6).map((x) => (
        <mesh key={x} position={[x, MALL.ceilingY - 0.02, zc]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.6, d - 3]} />
          <meshBasicMaterial color="#f7fbff" />
        </mesh>
      ))}

      {/* the store's own fascia, above its glass front */}
      <mesh position={[0, (CEILING + MALL.ceilingY) / 2, MALL.frontZ - 0.1]}>
        <boxGeometry args={[FLOOR.maxX - FLOOR.minX + 2, MALL.ceilingY - CEILING, 0.3]} />
        <meshStandardMaterial map={ribs} />
      </mesh>

      {/* neighbouring shops, level with the store */}
      {near.map((s) => (
        <Shopfront
          key={s.x}
          x={s.x}
          z={MALL.frontZ - 0.1}
          y={0}
          width={9}
          height={CEILING + 0.2}
          label={SHOPS[s.i % SHOPS.length][0]}
          colour={SHOPS[s.i % SHOPS.length][1]}
          facing={-1}
        />
      ))}
      {/* solid wall above them up to the roof */}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * 24, (CEILING + MALL.ceilingY) / 2, MALL.frontZ - 0.1]}>
          <boxGeometry args={[30, MALL.ceilingY - CEILING, 0.3]} />
          <meshStandardMaterial color="#c8ccd1" />
        </mesh>
      ))}

      {/* opposite shopfronts: ground level, then the mezzanine above */}
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

      {/* the mezzanine: a slab, a glass balustrade with a rail, and columns */}
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
    </group>
  );
}

// Everyone on the concourse and the mezzanine, from the shared routes.
export function MallPeople() {
  const root = useRef<Group>(null);
  const states = useRef<PersonState[]>(ROUTES.map(() => ({ speed: 0, mode: "idle" })));

  useFrame(() => {
    const now = net.serverNow();
    root.current?.children.forEach((child, i) => {
      const r = ROUTES[i];
      const p = routePose(r, now);
      child.position.set(p.x, p.y, p.z);
      child.rotation.y = p.ry;
      states.current[i] = { speed: p.walking ? r.speed : 0, mode: p.walking ? "idle" : "observe" };
    });
  });

  return (
    <group ref={root}>
      {ROUTES.map((r, i) => (
        <group key={r.id}>
          <Person id={r.id} shirt={r.colour} getState={() => states.current[i]} />
        </group>
      ))}
    </group>
  );
}
