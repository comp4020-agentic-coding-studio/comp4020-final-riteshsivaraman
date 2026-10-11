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
  NearestFilter,
  DataTexture,
  MeshToonMaterial,
  RedFormat,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Appearance, BeardStyle } from "../../../shared/appearance.ts";
import { buildHead, type HeadShape } from "./head-geo.ts";

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

export type BodyStyle = "friendly" | "natural" | "canon" | "sturdy" | "toon" | "chibi";
export type EyeStyle = "dots" | "soft" | "glossy" | "lidded" | "almond" | "bean" | "round" | "sparkle" | "happy";
export type FaceShape = "auto" | "oval" | "round" | "square" | "heart" | "long" | "diamond" | "pear";
export type Shading = "flat" | "toon";

export const BODY_STYLES: BodyStyle[] = ["friendly", "natural", "canon", "sturdy", "toon", "chibi"];
export const EYE_STYLES: EyeStyle[] = ["dots", "soft", "glossy", "lidded", "almond", "bean", "round", "sparkle", "happy"];
export const FACE_SHAPES: FaceShape[] = ["auto", "oval", "round", "square", "heart", "long", "diamond", "pear"];
export const SHADINGS: Shading[] = ["flat", "toon"];
export type BeardChoice = "auto" | BeardStyle;
export const BEARD_CHOICES: BeardChoice[] = ["auto", "none", "stubble", "moustache", "goatee", "full"];

// Each face shape is a set of head parameters (see head-geo.ts); the person's
// own appearance then nudges them a little, so two square faces differ.
// jaw is how much the lower face tapers (0 is a straight-sided jaw).
const FACES: Record<Exclude<FaceShape, "auto">, Omit<HeadShape, "nose">> = {
  oval: { width: 1.0, height: 1.0, square: 0.0, forehead: 0.0, jaw: 1.0, brow: 1.0, cheek: 1.0, chin: 1.0 },
  round: { width: 1.15, height: 0.9, square: 0.0, forehead: 0.05, jaw: 0.35, brow: 0.8, cheek: 1.35, chin: 0.7 },
  square: { width: 1.1, height: 0.96, square: 1.0, forehead: 0.06, jaw: 0.0, brow: 1.25, cheek: 0.75, chin: 1.2 },
  heart: { width: 1.0, height: 1.02, square: 0.0, forehead: 0.2, jaw: 1.9, brow: 0.95, cheek: 0.85, chin: 1.3 },
  long: { width: 0.88, height: 1.2, square: 0.3, forehead: 0.0, jaw: 0.7, brow: 1.0, cheek: 0.75, chin: 1.0 },
  diamond: { width: 0.98, height: 1.03, square: 0.0, forehead: -0.17, jaw: 1.6, brow: 0.95, cheek: 1.7, chin: 1.1 },
  pear: { width: 1.04, height: 0.97, square: 0.6, forehead: -0.2, jaw: 0.0, brow: 0.85, cheek: 0.95, chin: 1.0 },
};
const FACE_KEYS = Object.keys(FACES) as Array<Exclude<FaceShape, "auto">>;

// head: size of the head against the figure-drawing canon (1 is about 8 heads
// tall, 1.16 about 6.9, 1.34 about 6); girth: width of the frame; limb: arms.
const BODY: Record<BodyStyle, { head: number; girth: number; limb: number }> = {
  canon: { head: 1.0, girth: 1.0, limb: 1.0 },
  natural: { head: 1.16, girth: 0.98, limb: 0.97 },
  friendly: { head: 1.34, girth: 1.0, limb: 0.9 },
  sturdy: { head: 1.2, girth: 1.14, limb: 0.96 },
  toon: { head: 1.58, girth: 1.06, limb: 0.82 }, // about 5 heads: a cartoon proportion
  chibi: { head: 1.95, girth: 1.12, limb: 0.7 }, // about 4 heads: all head
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

// lid: 0 is the lid resting across the top of the eye (looks tired); negative
// lifts it clear so the whole eye shows, which is what "awake and friendly"
// needs. curve is the mouth's bend (smile up, frown down); open lets the dark
// of the mouth and the teeth show.
export const EXPRESSIONS: Array<Mood & { name: string }> = [
  { name: "neutral", browY: 0.003, browTilt: 0, lid: -0.3, curve: 0.45, open: 0, width: 1.1 },
  { name: "smile", browY: 0.006, browTilt: 0, lid: -0.1, curve: 0.95, open: 0.22, width: 1.4 },
  { name: "curious", browY: 0.008, browTilt: 0.08, lid: -0.35, curve: 0.25, open: 0, width: 0.95 },
  { name: "focused", browY: -0.002, browTilt: -0.25, lid: 0.15, curve: 0.1, open: 0, width: 0.9 },
  { name: "surprised", browY: 0.012, browTilt: 0.05, lid: -0.6, curve: 0, open: 1, width: 0.7 },
  { name: "worried", browY: 0.004, browTilt: 0.4, lid: -0.05, curve: -0.4, open: 0, width: 0.95 },
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
  face: Exclude<FaceShape, "auto">;
  heads: number; // how many heads tall
  lidBias: number; // some eye styles sit with the lids a little lower
}

const SIDES = [-1, 1] as const;

// Three flat bands of light, so the shading steps like a cartoon.
let ramp: DataTexture | null = null;
function toonRamp(): DataTexture {
  if (ramp) return ramp;
  ramp = new DataTexture(new Uint8Array([105, 175, 255]), 3, 1, RedFormat);
  ramp.minFilter = NearestFilter;
  ramp.magFilter = NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

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
  opts: { body?: BodyStyle; eyes?: EyeStyle; face?: FaceShape; shading?: Shading; beard?: BeardChoice } = {},
): Character {
  const bodyStyle = opts.body ?? "friendly";
  const eyeStyle = opts.eyes ?? "round";
  // "auto" picks a shape from the person, so a crowd has all of them
  const faceKey: Exclude<FaceShape, "auto"> =
    !opts.face || opts.face === "auto" ? FACE_KEYS[Math.floor(look.jaw * 997 + look.cheek * 131) % FACE_KEYS.length] : opts.face;
  const fs = FACES[faceKey];
  const jit = 0.92 + 0.16 * ((look.jaw - 0.55) / 0.55); // 0.92 to 1.08, from the person
  const shape: HeadShape = {
    width: look.faceWidth * fs.width,
    height: fs.height,
    square: fs.square,
    forehead: fs.forehead,
    jaw: fs.jaw * jit,
    brow: fs.brow * look.brow,
    nose: look.noseSize,
    cheek: fs.cheek * Math.min(1.2, look.cheek),
    chin: fs.chin * Math.min(1.2, look.chin),
  };
  const fw = shape.width;
  const Fy = shape.height;
  const eyeY = EYE.y * Fy;
  const browY = BROW.y * Fy;
  const mouthY = MOUTH.y * Fy;
  // a boxy face pushes its surface forward, so the features sit forward too
  const eyeZ = EYE.z - 0.006 * shape.square;
  const browZ = BROW.z - 0.008 * shape.square;
  const mouthZ = MOUTH.z - 0.013 * shape.square;
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
  const eyeX = 0.034 * look.eyeSpacing * fw;
  const root = mk("root", 0, Y(0.9), 0, null);
  const spine = mk("spine", 0, Y(0.95), 0, root);
  const head = mk("head", 0, N, 0, spine);
  const browBones = SIDES.map((s) => mk(`brow${s}`, ...hp(s * eyeX, browY, browZ), head)) as [Bone, Bone];
  const lids = mk("lids", ...hp(0, eyeY, eyeZ), head);
  const mouth = mk("mouth", ...hp(0, mouthY, mouthZ), head);
  const mouthOpen = mk("mouthOpen", ...hp(0, mouthY - 0.002, mouthZ), head);

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
    shape,
    look.hairStyle,
    look.hairColour,
    look.skin,
    !opts.beard || opts.beard === "auto" ? look.beard : opts.beard,
  );
  add(headGeo, head, null, hm());
  for (const s of SIDES) {
    add(new IcosahedronGeometry(0.026, 1), head, skin, hm(s * 0.081 * fw, -0.012 * Fy, 0.006, sc(0.4, 1, 0.75)));
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
      add(g, head, c, hm(ex + (o.dx ?? 0), eyeY + (o.dy ?? 0), eyeZ + front(rho) - (o.lift ?? 0)));
    };
    const oval = (w: number, h: number, c: Color, dx = 0, dy = 0, lift = 0): void => {
      const g = new CircleGeometry(1, 14);
      g.scale(w, h, 1);
      g.rotateY(Math.PI);
      add(g, head, c, hm(ex + dx, eyeY + dy, eyeZ - eyeR * 0.82 - lift));
    };
    const spot = (r: number, dx: number, dy: number, lift: number): void => {
      const g = new CircleGeometry(r, 8);
      g.rotateY(Math.PI);
      add(g, head, white, hm(ex + dx, eyeY + dy, eyeZ - eyeR * 0.82 - lift));
    };
    const ink = new Color("#241c19");
    if (eyeStyle === "dots") {
      // two dark ovals and a spark: nothing in them to be unsettled by
      lashTube = 0.0012;
      oval(0.0072 * look.eyeSize, 0.0098 * look.eyeSize, ink);
      spot(0.0022, s * -0.0022, 0.0035, 0.0008);
    } else if (eyeStyle === "bean") {
      // tall dark ovals, a classic cartoon eye
      lashTube = 0.0012;
      oval(0.0062 * look.eyeSize, 0.0135 * look.eyeSize, ink);
      spot(0.0024, s * -0.002, 0.0055, 0.0008);
    } else if (eyeStyle === "sparkle") {
      // big dark eyes with a coloured glow low in them and two highlights
      lashTube = 0.0013;
      oval(0.0088 * look.eyeSize, 0.0125 * look.eyeSize, ink);
      oval(0.0066 * look.eyeSize, 0.0078 * look.eyeSize, iris.clone().multiplyScalar(0.9), 0, -0.0026, 0.0006);
      spot(0.0036, s * -0.0034, 0.0045, 0.0014);
      spot(0.0017, s * 0.0032, -0.0042, 0.0014);
    } else if (eyeStyle === "happy") {
      // closed, smiling eyes: an upward arch for each
      const arch = new TorusGeometry(0.0085 * look.eyeSize, 0.0013, 3, 8, Math.PI * 0.85);
      arch.rotateZ(Math.PI / 2 - Math.PI * 0.425);
      add(arch, head, ink, hm(ex, eyeY - 0.0035, eyeZ - eyeR * 0.82));
    } else if (eyeStyle === "round") {
      // big white eyes with a plain dot for the pupil
      lashTube = 0.0012;
      const big = eyeR * 1.3;
      add(new SphereGeometry(big, 12, 8), head, white.clone().multiplyScalar(1.75), hm(ex, eyeY, eyeZ - 0.001));
      const pupil = new CircleGeometry(big * 0.4, 10);
      pupil.rotateY(Math.PI);
      add(pupil, head, ink, hm(ex + s * 0.0006, eyeY, eyeZ - 0.001 + front(0.4, big) - 0.0004));
      const gl = new CircleGeometry(big * 0.13, 8);
      gl.rotateY(Math.PI);
      add(gl, head, white, hm(ex + s * -0.0016, eyeY + 0.0028, eyeZ - 0.001 + front(0.4, big) - 0.0012));
    } else {
      // soft, glossy, lidded and almond share an eyeball and a lid
      // the socket and lid shade the white of the eye, so it is pushed past 1.0
      const ballColour = new Color(eyeStyle === "glossy" ? "#f7f4ef" : "#f2ede7").multiplyScalar(1.75);
      const squash = eyeStyle === "almond" ? sc(1.1, 0.78, 1) : undefined;
      add(new SphereGeometry(eyeR, 12, 8), head, ballColour, hm(ex, eyeY, eyeZ, squash));
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
    add(new SphereGeometry(0.0034, 5, 4), head, dark(skin, 0.45), hm(s * 0.0072 * look.noseSize, -0.0425 * Fy, -0.1035 - 0.004 * shape.square, sc(1, 0.6, 1)));
  }

  // lids: a cap over each eye and a dark lash line along its rim
  const rim = 1.08 * (eyeStyle === "round" ? eyeR * 1.3 : eyeR);
  for (const s of SIDES) {
    const ex = s * eyeX;
    add(new SphereGeometry(rim, 12, 6, 0, Math.PI * 2, 0, 0.95), lids, skin, hm(ex, eyeY, eyeZ));
    const lash = new TorusGeometry(rim * Math.sin(0.95), lashTube, 3, 12);
    lash.rotateX(Math.PI / 2);
    add(lash, lids, new Color("#1c1512"), hm(ex, eyeY + rim * Math.cos(0.95), eyeZ));
  }

  // brows, in the hair colour a little deeper
  const browColour = new Color(look.browColour).multiplyScalar(0.8);
  for (let i = 0; i < 2; i++) {
    const s = SIDES[i];
    add(browGeo(-s, 0.036 * look.eyeSize, 0.0068 * (0.75 + look.brow * 0.45)), browBones[i], browColour, hm(s * eyeX, browY, browZ));
  }

  // lips: an upper and a fuller lower arc that scale together into a smile or
  // a frown, and a dark opening that grows with the jaw
  const arc = (radius: number, tubeR: number, colour: string, dy: number): void => {
    const t = new TorusGeometry(radius, tubeR, 4, 14, 1.6);
    t.rotateZ(-Math.PI / 2 - 0.8);
    add(t, mouth, new Color(colour), hm(0, mouthY + radius + dy, mouthZ));
  };
  arc(0.024, 0.0032, "#a8514f", 0.0014);
  arc(0.026, 0.0046, "#c46a66", -0.0022);
  add(new SphereGeometry(0.008, 8, 6), mouthOpen, new Color("#4a1c20"), hm(0, mouthY - 0.002, mouthZ + 0.0015, sc(2.4, 0.9, 1)));
  add(new BoxGeometry(0.02, 0.005, 0.004), mouthOpen, new Color("#f4efe8").multiplyScalar(1.4), hm(0, mouthY + 0.0035, mouthZ - 0.0018));

  // ---- one mesh, one skeleton ----
  const merged = mergeGeometries(geos);
  if (!merged) throw new Error("character parts have mismatched attributes");
  const material =
    (opts.shading ?? "toon") === "toon"
      ? new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })
      : new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
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
    face: faceKey,
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
  const bend = Math.abs(m.curve * 1.6) < 0.08 ? 0.08 : m.curve * 1.6;
  const mw = c.look.mouthWidth * m.width;
  b.mouth.scale.set(mw * (1 - m.open * 0.5), bend * (1 - m.open * 0.6), 1);
  b.mouthOpen.scale.set(0.5 + m.open * 1.0, 0.1 + m.open * 2.4, 1);
}
