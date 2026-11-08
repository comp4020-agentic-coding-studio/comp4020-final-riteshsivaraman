import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { BoxGeometry, type BufferGeometry, CanvasTexture, Color, ConeGeometry, DoubleSide, Float32BufferAttribute, type Mesh, type MeshBasicMaterial, RingGeometry, SRGBColorSpace } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { REST, type HandheldPose, type HandheldScreen } from "./pay-choreo.ts";

// The staff handheld (issue #42): a phone slid into a card-reader case, the
// kind a floor specialist takes payment on. Invented, not any real product:
// a graphite case with a thicker sled on the back for the card reader, a
// scanner window on the top edge and a card slot in the bottom, built from
// rounded boxes and merged into one mesh (one draw call, vertex colours), plus
// the screen. The beam, scan line and tap ripple only draw during a payment.
//
// Origin: the middle of the screen face. Screen faces +z, top is +y, so it
// mounts like a held `Device` (screen to +z). Metres.

const W = 0.078; // case width
const H = 0.165; // case height
const D = 0.012; // case depth at the phone
const SLED_H = 0.07; // the card-reader sled on the back, lower part
const SLED_D = 0.016;
const SCREEN_W = 0.064;
const SCREEN_H = 0.134;
const SCREEN_Y = 0.006; // the screen sits a little above centre: the chin holds the sled

const CASE = "#2b2e33";
const SLED = "#3a3f46";
const TRIM = "#e0703a"; // an accent stripe so the reader reads as a tool, not a phone
const GLASS = "#0c0e12";

// every part flattened and painted one colour, so the parts merge into one mesh
function tint(g: BufferGeometry, hex: string): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  const c = new Color(hex);
  const n = flat.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  flat.setAttribute("color", new Float32BufferAttribute(col, 3));
  if (flat.attributes.uv) flat.deleteAttribute("uv");
  return flat;
}

let bodyGeo: BufferGeometry | null = null;
function body(): BufferGeometry {
  if (bodyGeo) return bodyGeo;
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, hex: string, x: number, y: number, z: number) => {
    g.translate(x, y, z);
    parts.push(tint(g, hex));
  };
  // the case shell around the phone, its front face just behind the screen
  add(new RoundedBoxGeometry(W, H, D, 2, 0.006), CASE, 0, 0, -D / 2 + 0.0005);
  // the glass, a hair proud of the shell: the screen plane sits on it
  add(new BoxGeometry(SCREEN_W + 0.004, SCREEN_H + 0.004, 0.001), GLASS, 0, SCREEN_Y, 0.0003);
  // the sled on the back, lower part, with its accent band and a card slot at the bottom
  add(new RoundedBoxGeometry(W - 0.004, SLED_H, SLED_D, 2, 0.005), SLED, 0, -H / 2 + SLED_H / 2 + 0.004, -D - SLED_D / 2 + 0.003);
  add(new BoxGeometry(W - 0.002, 0.006, SLED_D + D - 0.004), TRIM, 0, -H / 2 + SLED_H + 0.002, -D / 2 - SLED_D / 2 + 0.002);
  add(new BoxGeometry(W * 0.6, 0.0025, 0.003), GLASS, 0, -H / 2 + 0.0035, -D - SLED_D / 2 + 0.003);
  // the scanner window on the top edge, and the phone's camera on the back above the sled
  add(new BoxGeometry(W * 0.44, 0.0016, D * 0.55), "#5a1414", 0, H / 2 - 0.0004, -D / 2);
  add(new BoxGeometry(0.014, 0.014, 0.002), GLASS, -W / 2 + 0.014, H / 2 - 0.016, -D - 0.0005);
  bodyGeo = mergeGeometries(parts);
  return bodyGeo;
}

// ---- the screen: a small canvas per distinct content, cached ----
const CW = 128;
const CH = 268;
const screens = new Map<string, CanvasTexture>();
const keyOf = (s: HandheldScreen): string => JSON.stringify(s);
const FONT = "system-ui, sans-serif";

function fit(g: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number): void {
  let px = size;
  g.font = `${weight} ${px}px ${FONT}`;
  while (px > 9 && g.measureText(text).width > maxW) {
    px -= 1;
    g.font = `${weight} ${px}px ${FONT}`;
  }
}

function drawTick(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.fillStyle = "#2fbf71";
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#ffffff";
  g.lineWidth = r * 0.22;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(cx - r * 0.45, cy + r * 0.02);
  g.lineTo(cx - r * 0.1, cy + r * 0.36);
  g.lineTo(cx + r * 0.5, cy - r * 0.32);
  g.stroke();
}

function tapTarget(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, colour: string): void {
  g.strokeStyle = colour;
  g.lineWidth = 4;
  for (const k of [1, 0.66, 0.33]) {
    g.globalAlpha = k;
    g.beginPath();
    g.arc(cx, cy, r * k, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function screenTex(s: HandheldScreen): CanvasTexture {
  const key = keyOf(s);
  const hit = screens.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = CW;
  c.height = CH;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, CH);
  const paid = s.kind === "paid";
  bg.addColorStop(0, paid ? "#123d2a" : "#16233a");
  bg.addColorStop(1, paid ? "#0b2219" : "#0b1220");
  g.fillStyle = bg;
  g.fillRect(0, 0, CW, CH);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#ffffff";
  const M = CW - 16;
  switch (s.kind) {
    case "idle":
      tapTarget(g, CW / 2, CH * 0.45, 34, "rgba(255,255,255,0.45)");
      g.fillStyle = "rgba(255,255,255,0.7)";
      fit(g, "Ready", 600, 18, M);
      g.fillText("Ready", CW / 2, CH * 0.78);
      break;
    case "scan":
    case "scanned":
      g.fillStyle = "rgba(255,255,255,0.75)";
      fit(g, s.kind === "scan" ? "Scanning" : "Scanned", 600, 18, M);
      g.fillText(s.kind === "scan" ? "Scanning" : "Scanned", CW / 2, CH * 0.2);
      // a barcode-ish block: thick and thin bars, deterministic
      g.fillStyle = "#ffffff";
      for (let i = 0, x = 22; x < CW - 22; i++) {
        const w = 2 + ((i * 7) % 5);
        if (i % 2 === 0) g.fillRect(x, CH * 0.32, w, CH * 0.18);
        x += w + 2;
      }
      g.fillStyle = "#ffffff";
      fit(g, s.item, 600, 16, M);
      g.fillText(s.item, CW / 2, CH * 0.62);
      if (s.kind === "scanned") drawTick(g, CW / 2, CH * 0.82, 16);
      break;
    case "total":
      fit(g, s.item, 600, 15, M);
      g.fillText(s.item, CW / 2, CH * 0.1);
      g.fillStyle = "rgba(255,255,255,0.7)";
      fit(g, s.detail, 400, 13, M);
      g.fillText(s.detail, CW / 2, CH * 0.18);
      g.fillStyle = "#ffffff";
      fit(g, s.price, 700, 30, M);
      g.fillText(s.price, CW / 2, CH * 0.34);
      tapTarget(g, CW / 2, CH * 0.6, 30, "#8fd0ff");
      g.fillStyle = "#8fd0ff";
      fit(g, "Tap to pay", 700, 18, M);
      g.fillText("Tap to pay", CW / 2, CH * 0.85);
      break;
    case "paid":
      drawTick(g, CW / 2, CH * 0.38, 40);
      fit(g, "Paid", 700, 26, M);
      g.fillStyle = "#ffffff";
      g.fillText("Paid", CW / 2, CH * 0.66);
      fit(g, s.price, 600, 16, M);
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.fillText(s.price, CW / 2, CH * 0.78);
      break;
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  screens.set(key, tex);
  return tex;
}

// one shared geometry each for the effects
const beamGeo = new ConeGeometry(0.05, 0.42, 16, 1, true);
beamGeo.translate(0, -0.21, 0); // apex at the origin, opening along -y
const sweepGeo = new BoxGeometry(SCREEN_W, 0.004, 0.0005);
const rippleGeo = new RingGeometry(0.8, 1, 32);

// The handheld, posed each frame from `getPose` (refs only, no React state:
// the screen texture is swapped on the material when its content changes).
export function Handheld({ getPose }: { getPose: () => HandheldPose | undefined }) {
  const screen = useRef<Mesh>(null);
  const beam = useRef<Mesh>(null);
  const sweep = useRef<Mesh>(null);
  const ripple = useRef<Mesh>(null);
  const shownKey = useRef("");
  useFrame(() => {
    const p = getPose() ?? REST;
    const key = keyOf(p.screen);
    if (screen.current && key !== shownKey.current) {
      shownKey.current = key;
      const m = screen.current.material as MeshBasicMaterial;
      m.map = screenTex(p.screen);
      m.needsUpdate = true;
    }
    if (beam.current) {
      beam.current.visible = p.beam > 0.01;
      (beam.current.material as MeshBasicMaterial).opacity = 0.32 * p.beam;
    }
    if (sweep.current) {
      sweep.current.visible = p.sweep >= 0;
      sweep.current.position.y = SCREEN_Y + SCREEN_H / 2 - Math.max(0, p.sweep) * SCREEN_H;
    }
    if (ripple.current) {
      ripple.current.visible = p.ripple >= 0;
      const r = 0.012 + Math.max(0, p.ripple) * 0.05;
      ripple.current.scale.set(r, r, 1);
      (ripple.current.material as MeshBasicMaterial).opacity = 0.9 * (1 - Math.max(0, p.ripple));
    }
  });
  return (
    <group>
      <mesh geometry={body()}>
        <meshStandardMaterial vertexColors roughness={0.55} metalness={0.1} />
      </mesh>
      <mesh ref={screen} position={[0, SCREEN_Y, 0.0009]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={screenTex(REST.screen)} toneMapped={false} />
      </mesh>
      <mesh ref={sweep} visible={false} position={[0, SCREEN_Y, 0.0014]} geometry={sweepGeo}>
        <meshBasicMaterial color="#ff4d4d" toneMapped={false} />
      </mesh>
      <mesh ref={ripple} visible={false} position={[0, SCREEN_Y - SCREEN_H * 0.1, 0.0016]} geometry={rippleGeo}>
        <meshBasicMaterial color="#8fd0ff" transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {/* the scan beam: out of the top edge, fanning away from the screen's back */}
      <mesh ref={beam} visible={false} position={[0, H / 2, -D / 2]} rotation={[Math.PI / 2 + 0.35, 0, 0]} geometry={beamGeo}>
        <meshBasicMaterial color="#ff3b3b" transparent opacity={0.3} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Where a caller grips it: the hand closes round the bottom of the sled.
export const HANDHELD_GRIP_Y = -H / 2 + 0.008; // the bottom edge, below the screen, so the hand never covers it
