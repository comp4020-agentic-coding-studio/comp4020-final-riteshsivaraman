import {
  Bone,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Appearance } from "../../../shared/appearance.ts";
import { buildHead } from "./head-geo.ts";

// A whole person as ONE skinned mesh: one draw call, about 3,000 triangles, a
// 16-bone skeleton. Every part is rigidly bound to one bone (no blending),
// which suits a faceted look. The face moves through bones too: brows tilt and
// lift, the lids close, the mouth scales into a smile or a frown and opens.
//
// Two things are chosen at build time, so they can be compared by eye:
//   BodyStyle  how big the head is against the body, how heavy the frame is
//   EyeStyle   how the eyes are drawn (some are far less uncanny than others)
// Shoulders against hips comes from `shoulderHip` in the appearance.
// Metres, y up, the figure faces -z. About 1.72 m tall whatever the style.

export type BodyStyle = "canon" | "natural" | "friendly" | "sturdy";
export type EyeStyle = "soft" | "dots" | "glossy" | "lidded" | "almond";

export const BODY_STYLES: BodyStyle[] = ["natural", "canon", "friendly", "sturdy"];
export const EYE_STYLES: EyeStyle[] = ["soft", "dots", "glossy", "lidded", "almond"];

// head: size of the head against the figure-drawing canon (1 is about 8 heads
// tall, 1.16 about 6.9, 1.34 about 6); girth: width of the frame; limb: arms.
const BODY: Record<BodyStyle, { head: number; girth: number; limb: number }> = {
  canon: { head: 1.0, girth: 1.0, limb: 1.0 },
  natural: { head: 1.16, girth: 0.98, limb: 0.97 },
  friendly: { head: 1.34, girth: 1.0, limb: 0.9 },
  sturdy: { head: 1.2, girth: 1.14, limb: 0.96 },
};

// Head-local, from the middle of the head.
const EYE = { y: 0.002, z: -0.0855 }; // half-embedded: the face surface is at about -0.087
const BROW = { y: 0.032, z: -0.0915 };
const MOUTH = { y: -0.0625, z: -0.0845 };

export interface Mood {
  browY: number;
  browTilt: number; // radians, positive raises the inner ends
  lid: number; // how far the upper lids are down; negative is wide open
  curve: number; // mouth corners, positive up
  open: number; // 0 closed, 1 open
  width: number;
}

export const EXPRESSIONS: Array<Mood & { name: string }> = [
  { name: "neutral", browY: 0, browTilt: 0, lid: 0.18, curve: 0.3, open: 0, width: 1 },
  { name: "smile", browY: 0.002, browTilt: 0.06, lid: 0.4, curve: 0.85, open: 0, width: 1.25 },
  { name: "curious", browY: 0.006, browTilt: 0.1, lid: 0.08, curve: 0.2, open: 0, width: 0.9 },
  { name: "focused", browY: -0.003, browTilt: -0.28, lid: 0.45, curve: 0.05, open: 0, width: 0.85 },
  { name: "surprised", browY: 0.01, browTilt: 0.05, lid: -0.15, curve: 0, open: 1, width: 0.65 },
  { name: "worried", browY: 0.004, browTilt: 0.4, lid: 0.25, curve: -0.35, open: 0, width: 0.9 },
];

export interface BoneSet {
  root: Bone;
  spine: Bone;
  head: Bone;
  brow: [Bone, Bone];
  lids: Bone;
  mouth: Bone;
  mouthOpen: Bone;
  sh: [Bone, Bone];
  el: [Bone, Bone];
  hip: [Bone, Bone];
  kn: [Bone, Bone];
}

export interface Character {
  root: Group;
  bones: BoneSet;
  triangles: number;
  look: Appearance;
  body: BodyStyle;
  eyes: EyeStyle;
  heads: number; // how many heads tall
  lidBias: number; // some eye styles sit with the lids a little lower
}

const SIDES = [-1, 1] as const;

function prep(geo: BufferGeometry, bone: number, color: Color | null, m?: Matrix4): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (m) g.applyMatrix4(m);
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "color") g.deleteAttribute(name);
  g.computeVertexNormals();
  const n = g.getAttribute("position").count;
  if (color) {
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    g.setAttribute("color", new Float32BufferAttribute(c, 3));
  }
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = bone;
    sw[i * 4] = 1;
  }
  g.setAttribute("skinIndex", new Uint16BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new Float32BufferAttribute(sw, 4));
  return g;
}

// A faceted tube through rings (a height, half-width, half-depth, and an
// optional forward shift), closed at both ends.
function loft(rings: Array<{ y: number; wx: number; wz: number; cz?: number }>, sides = 10): BufferGeometry {
  const pos: number[] = [];
  const ring = (r: (typeof rings)[number], k: number): [number, number, number] => {
    const a = (k / sides) * Math.PI * 2;
    return [Math.cos(a) * r.wx, r.y, (r.cz ?? 0) + Math.sin(a) * r.wz];
  };
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = ring(rings[i], k);
      const b = ring(rings[i], k + 1);
      const c = ring(rings[i + 1], k);
      const d = ring(rings[i + 1], k + 1);
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  }
  for (const [r, up] of [
    [rings[0], false],
    [rings[rings.length - 1], true],
  ] as const) {
    const centre: [number, number, number] = [0, r.y, r.cz ?? 0];
    for (let k = 0; k < sides; k++) {
      const a = ring(r, k);
      const b = ring(r, k + 1);
      if (up) pos.push(...centre, ...b, ...a);
      else pos.push(...centre, ...a, ...b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
}

const at = (x: number, y: number, z: number): Matrix4 => new Matrix4().makeTranslation(x, y, z);
const sc = (x: number, y = x, z = x): Matrix4 => new Matrix4().makeScale(x, y, z);

// A tapering cylinder between two points, r0 at p0 and r1 at p1.
function tube(p0: Vector3, p1: Vector3, r0: number, r1: number, sides = 8): BufferGeometry {
  const len = p0.distanceTo(p1);
  const g = new CylinderGeometry(r0, r1, len, sides, 1); // r0 is the top (+y)
  const dir = p1.clone().sub(p0).normalize();
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().negate()));
  const mid = p0.clone().add(p1).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

// A box whose long (y) side lies along `dir`, centred at `centre`.
function along(w: number, l: number, d: number, centre: Vector3, dir: Vector3): BufferGeometry {
  const g = new BoxGeometry(w, l, d);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), dir.clone().normalize()));
  g.translate(centre.x, centre.y, centre.z);
  return g;
}

// A brow: short boxes along a gentle arch, thick at the inner end and tapering
// outward. Local to the brow bone, which sits at the brow's centre.
function browGeo(innerSign: number, len: number, thick: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const tm = (t0 + t1) / 2;
    const x0 = innerSign * (len / 2 - len * t0);
    const x1 = innerSign * (len / 2 - len * t1);
    const arch = (x: number): number => 0.0032 * (1 - ((2 * x) / len) ** 2);
    const y0 = arch(x0);
    const y1 = arch(x1);
    const th = thick * (1 - 0.55 * tm);
    const seg = Math.hypot(x1 - x0, y1 - y0) + 0.0012;
    const b = new BoxGeometry(seg, th, 0.007);
    b.rotateZ(Math.atan2(y1 - y0, x1 - x0));
    b.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    parts.push(b);
  }
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  if (!merged) throw new Error("brow parts mismatched");
  return merged;
}

export function buildCharacter(
  look: Appearance,
  shirtHex: string,
  opts: { body?: BodyStyle; eyes?: EyeStyle } = {},
): Character {
  const bodyStyle = opts.body ?? "natural";
  const eyeStyle = opts.eyes ?? "soft";
  const style = BODY[bodyStyle];
  const skin = new Color(look.skin);
  const shirt = new Color(shirtHex);
  const pants = new Color(look.pants);
  const shoes = new Color(look.shoes);
  const dark = (c: Color, k: number): Color => c.clone().multiplyScalar(k);

  // ---- scale: a bigger head takes height from the body, not from the top ----
  const S = style.head * look.headScale; // head scale
  const N = 1.72 - 0.22 * S; // where the neck pivots
  const r = N / 1.5; // body heights are written for N = 1.5
  const Y = (y: number): number => y * r;
  const headY = N + 0.105 * S;
  // a point in head-local space, scaled and lifted into the figure
  const hm = (x = 0, y = 0, z = 0, extra?: Matrix4): Matrix4 => {
    const m = at(0, headY, 0).multiply(sc(S)).multiply(at(x, y, z));
    return extra ? m.multiply(extra) : m;
  };
  const hp = (x: number, y: number, z: number): [number, number, number] => [x * S, headY + y * S, z * S];

  // ---- frame ----
  const gth = style.girth * look.build;
  const shoulderHalf = 0.178 * gth * (0.85 + 0.28 * look.shoulderHip);
  const hipHalf = Math.max(0.1, (shoulderHalf * 1.04) / look.shoulderHip);
  const chestHalf = shoulderHalf * 0.9;
  const waistHalf = Math.min(shoulderHalf, hipHalf) * 0.86;
  const legX = hipHalf * 0.5;
  const shoulderX = shoulderHalf * 0.9;
  const upLen = 0.27 * style.limb * r;
  const foreLen = 0.235 * style.limb * r;

  // ---- bones ----
  const world = new Map<Bone, Vector3>();
  const list: Bone[] = [];
  const mk = (name: string, x: number, y: number, z: number, parent: Bone | null): Bone => {
    const b = new Bone();
    b.name = name;
    const w = new Vector3(x, y, z);
    const pw = parent ? world.get(parent)! : new Vector3();
    b.position.copy(w).sub(pw);
    world.set(b, w);
    parent?.add(b);
    list.push(b);
    return b;
  };
  const eyeX = 0.034 * look.eyeSpacing * look.faceWidth;
  const root = mk("root", 0, Y(0.9), 0, null);
  const spine = mk("spine", 0, Y(0.95), 0, root);
  const head = mk("head", 0, N, 0, spine);
  const browBones = SIDES.map((s) => mk(`brow${s}`, ...hp(s * eyeX, BROW.y, BROW.z), head)) as [Bone, Bone];
  const lids = mk("lids", ...hp(0, EYE.y, EYE.z), head);
  const mouth = mk("mouth", ...hp(0, MOUTH.y, MOUTH.z), head);
  const mouthOpen = mk("mouthOpen", ...hp(0, MOUTH.y - 0.002, MOUTH.z), head);

  // arms hang a little away from the body, like a person standing at ease
  const aUp = 0.1;
  const aLo = 0.05;
  const shoulderPt = SIDES.map((s) => new Vector3(s * shoulderX, Y(1.35), 0));
  const elbowPt = SIDES.map((s, i) => shoulderPt[i].clone().add(new Vector3(s * Math.sin(aUp) * upLen, -Math.cos(aUp) * upLen, 0)));
  const wristPt = SIDES.map((s, i) => elbowPt[i].clone().add(new Vector3(s * Math.sin(aLo) * foreLen, -Math.cos(aLo) * foreLen, 0)));
  const sh = SIDES.map((_, i) => mk(`sh${i}`, shoulderPt[i].x, shoulderPt[i].y, 0, spine)) as [Bone, Bone];
  const el = SIDES.map((_, i) => mk(`el${i}`, elbowPt[i].x, elbowPt[i].y, 0, sh[i])) as [Bone, Bone];
  const hip = SIDES.map((s) => mk(`hip${s}`, s * legX, Y(0.88), 0, root)) as [Bone, Bone];
  const kn = SIDES.map((s, i) => mk(`kn${s}`, s * legX, Y(0.48), 0, hip[i])) as [Bone, Bone];
  const idx = (b: Bone): number => list.indexOf(b);

  // ---- parts ----
  const geos: BufferGeometry[] = [];
  const add = (g: BufferGeometry, bone: Bone, color: Color | null, m?: Matrix4): void => {
    geos.push(prep(g, idx(bone), color, m));
  };

  // pelvis and trousers to the root bone; the shirt, chest and shoulders to
  // the spine. Heights are canon heights (for N = 1.5) scaled by r.
  add(
    loft([
      { y: Y(0.76), wx: hipHalf * 0.86, wz: 0.098 },
      { y: Y(0.85), wx: hipHalf * 1.04, wz: 0.112, cz: 0.004 },
      { y: Y(0.95), wx: hipHalf * 1.02, wz: 0.11, cz: 0.006 },
      { y: Y(1.02), wx: waistHalf * 1.08, wz: 0.098 },
    ]),
    root,
    pants,
  );
  add(
    loft([
      { y: Y(0.92), wx: hipHalf * 1.07, wz: 0.118, cz: 0.006 },
      { y: Y(1.0), wx: waistHalf * 1.1, wz: 0.105 },
      { y: Y(1.08), wx: waistHalf, wz: 0.098 },
      { y: Y(1.18), wx: waistHalf + (chestHalf - waistHalf) * 0.55, wz: 0.108, cz: -0.004 },
      { y: Y(1.27), wx: chestHalf, wz: 0.118, cz: -0.008 },
      { y: Y(1.34), wx: shoulderHalf * 0.97, wz: 0.1, cz: -0.004 },
      { y: Y(1.4), wx: shoulderHalf * 0.62, wz: 0.082 },
      { y: Y(1.455), wx: 0.064, wz: 0.058 },
    ]),
    spine,
    shirt,
  );
  // neck turns with the head, from the base of the neck up under the chin
  const neckBase = Y(1.445);
  const neckTop = headY - 0.085 * S;
  add(new CylinderGeometry(0.045, 0.052, neckTop - neckBase, 8), head, skin, at(0, (neckBase + neckTop) / 2, 0.004));

  for (let i = 0; i < 2; i++) {
    const s = SIDES[i];
    const sp = shoulderPt[i];
    const ep = elbowPt[i];
    const wp = wristPt[i];
    const handDir = wp.clone().sub(ep).normalize();
    // sleeve to the elbow, a bare forearm, then a hand: palm, fingers, thumb
    add(tube(sp, ep, 0.049, 0.039, 8), sh[i], shirt);
    add(new IcosahedronGeometry(0.039, 0), el[i], shirt, at(ep.x, ep.y, ep.z));
    add(tube(ep, wp, 0.036, 0.027, 8), el[i], skin);
    add(along(0.05, 0.075, 0.025, wp.clone().addScaledVector(handDir, 0.035), handDir), el[i], skin);
    add(along(0.046, 0.058, 0.018, wp.clone().addScaledVector(handDir, 0.096).add(new Vector3(0, 0, -0.005)), handDir), el[i], dark(skin, 0.97));
    add(along(0.017, 0.05, 0.017, wp.clone().addScaledVector(handDir, 0.05).add(new Vector3(-s * 0.03, 0, -0.012)), handDir), el[i], skin);

    // leg: thigh, knee, calf, shoe
    const lx = s * legX;
    add(
      loft(
        [
          { y: Y(0.9), wx: 0.093, wz: 0.09 },
          { y: Y(0.7), wx: 0.082, wz: 0.08 },
          { y: Y(0.49), wx: 0.058, wz: 0.057 },
        ],
        8,
      ),
      hip[i],
      pants,
      at(lx, 0, 0),
    );
    add(new IcosahedronGeometry(0.057, 0), kn[i], pants, at(lx, Y(0.48), 0));
    add(
      loft(
        [
          { y: Y(0.49), wx: 0.057, wz: 0.056 },
          { y: Y(0.38), wx: 0.061, wz: 0.064, cz: 0.006 },
          { y: Y(0.2), wx: 0.046, wz: 0.046 },
          { y: Y(0.09), wx: 0.036, wz: 0.036 },
        ],
        8,
      ),
      kn[i],
      pants,
      at(lx, 0, 0),
    );
    add(new BoxGeometry(0.092, 0.07, 0.25), kn[i], shoes, at(lx, 0.04, -0.06));
    add(new SphereGeometry(0.047, 7, 5), kn[i], shoes, new Matrix4().makeTranslation(lx, 0.045, -0.17).multiply(sc(1, 0.85, 1.1)));
  }

  // head, with hair painted on and the ears built into it
  const headGeo = buildHead(
    { width: look.faceWidth, jaw: look.jaw, brow: look.brow, nose: look.noseSize, cheek: look.cheek, chin: look.chin },
    look.hairStyle,
    look.hairColour,
    look.skin,
  );
  add(headGeo, head, null, hm());
  for (const s of SIDES) {
    add(new IcosahedronGeometry(0.026, 1), head, skin, hm(s * 0.081 * look.faceWidth, -0.012, 0.006, sc(0.4, 1, 0.75)));
  }
  const hair = new Color(look.hairColour);
  if (look.hairStyle === "long") {
    add(new IcosahedronGeometry(1, 1), head, hair, hm(0, -0.09, 0.07, sc(0.088, 0.15, 0.042)));
  }
  if (look.hairStyle === "bun") {
    add(new IcosahedronGeometry(1, 1), head, hair, hm(0, 0.095, 0.075, sc(0.04)));
  }

  // ---- eyes, by style ----
  const eyeR = 0.0112 * look.eyeSize;
  const iris = new Color(look.eyeColour);
  const white = new Color("#ffffff");
  const front = (rho: number, radius = eyeR): number => -Math.sqrt(Math.max(0, 1 - rho * rho)) * radius - 0.0004;
  let lidBias = 0;
  let lashTube = 0.0007;
  for (const s of SIDES) {
    const ex = s * eyeX;
    const disc = (rho: number, c: Color, o: { dx?: number; dy?: number; lift?: number; sy?: number } = {}): void => {
      const g = new CircleGeometry(rho * eyeR, 10);
      g.scale(1, o.sy ?? 1, 1);
      g.rotateY(Math.PI);
      add(g, head, c, hm(ex + (o.dx ?? 0), EYE.y + (o.dy ?? 0), EYE.z + front(rho) - (o.lift ?? 0)));
    };
    if (eyeStyle === "dots") {
      // two dark ovals and a spark: nothing in them to be unsettled by
      lashTube = 0.0012;
      const g = new CircleGeometry(1, 12);
      g.scale(0.0072 * look.eyeSize, 0.0098 * look.eyeSize, 1);
      g.rotateY(Math.PI);
      add(g, head, new Color("#241c19"), hm(ex, EYE.y, EYE.z - eyeR * 0.82));
      const spark = new CircleGeometry(0.0022, 8);
      spark.rotateY(Math.PI);
      add(spark, head, white, hm(ex + s * -0.0022, EYE.y + 0.0035, EYE.z - eyeR * 0.82 - 0.0008));
    } else {
      // the socket and lid shade the white of the eye, so it is pushed past 1.0
      const ballColour = new Color(eyeStyle === "glossy" ? "#f7f4ef" : "#f2ede7").multiplyScalar(1.75);
      const squash = eyeStyle === "almond" ? sc(1.1, 0.78, 1) : undefined;
      add(new SphereGeometry(eyeR, 12, 8), head, ballColour, hm(ex, EYE.y, EYE.z, squash));
      if (eyeStyle === "glossy") {
        lashTube = 0.0011;
        disc(0.8, dark(iris, 0.62), { lift: 0.0003, sy: 1.1 });
        disc(0.36, new Color("#0e0c0b"), { lift: 0.0009, sy: 1.1 });
        disc(0.2, white, { dx: s * -0.0034, dy: 0.0042, lift: 0.0016 });
        disc(0.08, white, { dx: s * 0.003, dy: -0.0034, lift: 0.0016 });
      } else {
        const warm = iris.clone().multiplyScalar(0.8).lerp(new Color("#5a4a40"), 0.2);
        const sy = eyeStyle === "almond" ? 0.85 : 1;
        disc(0.62, warm, { lift: 0.0003, sy });
        disc(0.3, new Color("#1c1512"), { lift: 0.0009, sy });
        disc(0.13, white, { dx: s * -0.0026, dy: 0.0032 * sy, lift: 0.0015 });
        if (eyeStyle === "lidded") lidBias = 0.3;
        if (eyeStyle === "almond") {
          lidBias = 0.12;
          lashTube = 0.0011;
        }
      }
    }
  }
  // nostrils under the tip of the nose
  for (const s of SIDES) {
    add(new SphereGeometry(0.0034, 5, 4), head, dark(skin, 0.45), hm(s * 0.0072 * look.noseSize, -0.0425, -0.1035, sc(1, 0.6, 1)));
  }

  // lids: a cap over each eye and a dark lash line along its rim
  const rim = 1.08 * eyeR;
  for (const s of SIDES) {
    const ex = s * eyeX;
    add(new SphereGeometry(rim, 12, 6, 0, Math.PI * 2, 0, 0.95), lids, skin, hm(ex, EYE.y, EYE.z));
    const lash = new TorusGeometry(rim * Math.sin(0.95), lashTube, 3, 12);
    lash.rotateX(Math.PI / 2);
    add(lash, lids, new Color("#1c1512"), hm(ex, EYE.y + rim * Math.cos(0.95), EYE.z));
  }

  // brows, in the hair colour a little deeper
  const browColour = new Color(look.browColour).multiplyScalar(0.8);
  for (let i = 0; i < 2; i++) {
    const s = SIDES[i];
    add(browGeo(-s, 0.036 * look.eyeSize, 0.0068 * (0.75 + look.brow * 0.45)), browBones[i], browColour, hm(s * eyeX, BROW.y, BROW.z));
  }

  // lips: an upper and a fuller lower arc that scale together into a smile or
  // a frown, and a dark opening that grows with the jaw
  const arc = (radius: number, tubeR: number, colour: string, dy: number): void => {
    const t = new TorusGeometry(radius, tubeR, 4, 12, 1.2);
    t.rotateZ(-Math.PI / 2 - 0.6);
    add(t, mouth, new Color(colour), hm(0, MOUTH.y + radius + dy, MOUTH.z));
  };
  arc(0.024, 0.0032, "#a8514f", 0.0014);
  arc(0.026, 0.0046, "#c46a66", -0.0022);
  add(new SphereGeometry(0.008, 8, 6), mouthOpen, new Color("#4a1c20"), hm(0, MOUTH.y - 0.002, MOUTH.z + 0.0015));

  // ---- one mesh, one skeleton ----
  const merged = mergeGeometries(geos);
  if (!merged) throw new Error("character parts have mismatched attributes");
  const material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  const mesh = new SkinnedMesh(merged, material);
  mesh.frustumCulled = false;
  mesh.add(root);
  const group = new Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new Skeleton(list));

  return {
    root: group,
    bones: { root, spine, head, brow: browBones, lids, mouth, mouthOpen, sh, el, hip, kn },
    triangles: merged.getAttribute("position").count / 3,
    look,
    body: bodyStyle,
    eyes: eyeStyle,
    heads: 1.72 / (0.216 * S),
    lidBias,
  };
}

export interface PoseInput {
  t: number; // seconds, for idle motion
  walk: number; // 0 standing, 1 walking at pace
  phase: number; // walk cycle phase, radians
  mode: "idle" | "observe" | "work";
  seed: number; // varies idle motion between people
}

// Bones from a walk cycle, a pose and a mood. Signs, for a hanging limb that
// points down: a positive x rotation swings it forward (-z) and a negative one
// back; a head or torso tips forward with a negative x rotation.
export function poseCharacter(c: Character, p: PoseInput, m: Mood, blink: number): void {
  const b = c.bones;
  const s = Math.sin(p.phase);
  const w = p.walk;
  const leg = s * 0.7 * w;
  const arm = s * 0.55 * w;
  let lean = 0; // forward, radians
  let headPitch = 0; // down, radians
  let headYaw = 0;
  let aL = arm;
  let aR = -arm;
  let eL = 0.15 + w * 0.7 * Math.max(0, s);
  let eR = 0.15 + w * 0.7 * Math.max(0, -s);
  // weight on one leg when standing: the hips tip, the shoulders answer
  let weight = 0;
  if (w < 0.05) {
    aL = 0.06;
    aR = 0.06;
    weight = Math.sin(p.t * 0.45 + p.seed) * 0.022;
    if (p.mode === "observe") {
      lean = 0.22 + Math.sin(p.t * 0.8) * 0.015;
      headPitch = 0.32;
      aR = 1.15;
      aL = 0.2;
      eR = 1.15;
      eL = 0.45;
    } else if (p.mode === "work") {
      lean = 0.2;
      headPitch = 0.4;
      aL = 1.0 + Math.sin(p.t * 5) * 0.07;
      aR = 1.0 + Math.sin(p.t * 5 + 1.7) * 0.07;
      eL = 0.85;
      eR = 0.85;
    } else {
      headYaw = Math.sin(p.t * 0.55 + p.seed) * 0.4;
      aL = 0.07 + Math.sin(p.t * 1.1 + p.seed) * 0.03;
      aR = 0.07;
      eL = 0.18 + Math.max(0, weight) * 6;
      eR = 0.18 + Math.max(0, -weight) * 6;
    }
  }
  const baseY = (b.root.userData.y ??= b.root.position.y) as number;
  b.root.position.y = baseY + Math.abs(s) * 0.03 * w;
  b.root.rotation.z = weight * 0.8;
  b.hip[0].rotation.x = -leg;
  b.hip[1].rotation.x = leg;
  // knees bend back as a leg swings through, and a little when standing; the
  // unloaded leg softens more
  b.kn[0].rotation.x = -(0.04 + Math.max(0, Math.sin(p.phase + 1.2 + Math.PI)) * 0.95 * w + Math.max(0, weight) * 3);
  b.kn[1].rotation.x = -(0.04 + Math.max(0, Math.sin(p.phase + 1.2)) * 0.95 * w + Math.max(0, -weight) * 3);
  b.sh[0].rotation.x = aL;
  b.sh[1].rotation.x = aR;
  b.el[0].rotation.x = eL;
  b.el[1].rotation.x = eR;
  b.spine.rotation.x += (-lean - b.spine.rotation.x) * 0.15;
  b.spine.rotation.z = -weight * 1.1;
  b.head.rotation.x += (-headPitch - b.head.rotation.x) * 0.15;
  b.head.rotation.y += (headYaw - b.head.rotation.y) * 0.1;
  b.head.rotation.z = weight * 0.9;

  // face: lids (with a blink and the eye style's resting droop), brows (lift
  // and tilt, inner ends up is positive), mouth as an arc plus an opening
  b.lids.rotation.x = -Math.min(1.35, m.lid + c.lidBias + blink);
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const base = (b.brow[i].userData.y ??= b.brow[i].position.y) as number;
    b.brow[i].position.y = base + m.browY;
    b.brow[i].rotation.z = -side * m.browTilt;
  }
  const bend = Math.abs(m.curve) < 0.06 ? 0.06 : m.curve;
  const mw = c.look.mouthWidth * m.width;
  b.mouth.scale.set(mw * (1 - m.open * 0.5), bend * (1 - m.open * 0.6), 1);
  b.mouthOpen.scale.set(0.5 + m.open * 1.0, 0.1 + m.open * 2.4, 1);
}
