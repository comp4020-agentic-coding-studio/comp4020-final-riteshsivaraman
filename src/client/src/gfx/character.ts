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
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  Raycaster,
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
import type { Behaviour } from "../../../shared/behaviour.ts";
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
export type EyeStyle = "dots" | "soft" | "glossy" | "lidded" | "almond" | "bean" | "round" | "sparkle" | "happy" | "toy" | "peg";
export type FaceShape = "auto" | "oval" | "round" | "square" | "heart" | "long" | "diamond" | "pear";
export type Shading = "flat" | "toon";

export const BODY_STYLES: BodyStyle[] = ["friendly", "natural", "canon", "sturdy", "toon", "chibi"];
export const EYE_STYLES: EyeStyle[] = ["dots", "soft", "glossy", "lidded", "almond", "bean", "round", "sparkle", "happy", "toy", "peg"];
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
  { name: "smile", browY: 0.012, browTilt: 0.12, lid: 0.0, curve: 1.6, open: 0.5, width: 1.7 },
  { name: "curious", browY: 0.016, browTilt: 0.3, lid: -0.5, curve: 0.15, open: 0, width: 0.85 },
  { name: "focused", browY: -0.006, browTilt: -0.5, lid: 0.3, curve: -0.1, open: 0, width: 0.8 },
  { name: "surprised", browY: 0.024, browTilt: 0.15, lid: -0.9, curve: 0, open: 1.2, width: 0.6 },
  { name: "worried", browY: 0.008, browTilt: 0.75, lid: 0.05, curve: -1.0, open: 0, width: 0.9 },
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
  dev: Bone; // the device in the right hand: scaled to nothing when it is put away
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
  pose: Record<string, number>; // smoothed pose targets, so behaviours blend
  deviceKind?: "phone" | "tablet"; // what a real Device should be mounted at bones.dev, if anything
}

const SIDES = [-1, 1] as const;

// the top of a stool, in metres (plan.ts STOOL_SEAT_H)
const SEAT_H = 0.7;

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
  opts: { body?: BodyStyle; eyes?: EyeStyle; face?: FaceShape; shading?: Shading; beard?: BeardChoice; uniform?: { cap?: string; badge?: string }; device?: "phone" | "tablet" } = {},
): Character {
  const bodyStyle = opts.body ?? "friendly";
  const eyeStyle = opts.eyes ?? "round";
  // "toy" and "peg": marks on a clean, chunky head (plain black eyes, a dash
  // for a mouth, a pointed nose), no sockets, lips, lashes, teeth or tongue
  const toy = eyeStyle === "toy" || eyeStyle === "peg";
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
  // a thigh's outer edge must stay inside the pelvis (hipHalf * 1.02 at this
  // height) or it pokes out through the trousers and under the shirt hem
  const thighTop = Math.min(0.093, Math.max(0.055, hipHalf * 0.99 - legX));
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
  // a bone at the right hand for a device; scaling it 0 to 1 takes it out
  const hand = wristPt[1].clone().addScaledVector(wristPt[1].clone().sub(elbowPt[1]).normalize(), 0.09);
  const dev = mk("dev", hand.x - 0.01, hand.y, hand.z - 0.015, el[1]);
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
          { y: Y(0.9), wx: thighTop, wz: 0.09 },
          { y: Y(0.7), wx: Math.min(0.082, thighTop * 0.92), wz: 0.08 },
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
    toy ? 3 : 4,
    toy,
  );
  // Where the head's real, faceted surface is in front of (x, y), head-local.
  // The toy face's marks sit on this instead of a guessed depth, so a facet
  // can't poke through them. Over a mark's extent we take the most forward
  // facet, then sit the mark a hair proud of it.
  const probe = new Mesh(headGeo, new MeshBasicMaterial({ side: DoubleSide }));
  const ray = new Raycaster();
  const rayFrom = new Vector3();
  const rayDir = new Vector3(0, 0, 1);
  const surfaceZ = (x: number, y: number, hw = 0, hh = 0): number => {
    let z = Infinity;
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      ray.set(rayFrom.set(x + dx * hw, y + dy * hh, -1), rayDir);
      const hit = ray.intersectObject(probe, false)[0];
      if (hit) z = Math.min(z, hit.point.z);
    }
    return Number.isFinite(z) ? z : EYE.z;
  };
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

  // The device itself is not baked into this mesh: `bones.dev` is a bare
  // attachment point (positioned here, at the hand) that Actor.tsx mounts a
  // real Device (phones-geo.ts / computers-geo.ts) onto, scaled by the same
  // 0-to-1 "is it out" animation this bone has always carried. A real model
  // pairs the "device" behaviour with an actual catalogued object instead of
  // an invented generic slab (Ritesh, 2026-10-12).

  // staff uniform: a cap in the role's colour, and a badge on the chest
  if (opts.uniform?.cap) {
    const cap = new Color(opts.uniform.cap);
    add(new SphereGeometry(0.128, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), head, cap, hm(0, 0.022, 0.004));
    add(new BoxGeometry(0.15, 0.012, 0.085), head, cap, hm(0, 0.026, -0.108));
  }
  if (opts.uniform?.badge) {
    add(new BoxGeometry(0.075, 0.095, 0.012), spine, new Color(opts.uniform.badge), at(0.085, Y(1.25), -0.121));
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
    } else if (toy) {
      // plain black ovals, or small dots for peg: no whites, no highlight,
      // nothing to stare back. They sit on the head surface and ride the lids
      // bone, which scales them shut for a blink (see poseCharacter).
      const w = (eyeStyle === "toy" ? 0.0082 : 0.0066) * look.eyeSize;
      const h = (eyeStyle === "toy" ? 0.0118 : 0.0066) * look.eyeSize;
      const g = new CircleGeometry(1, 14);
      g.scale(w, h, 1);
      g.rotateY(Math.PI);
      add(g, lids, ink, hm(ex, eyeY, surfaceZ(ex, eyeY, w, h) - 0.0007));
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
  for (const s of toy ? [] : SIDES) {
    add(new SphereGeometry(0.0034, 5, 4), head, dark(skin, 0.45), hm(s * 0.0072 * look.noseSize, -0.0425 * Fy, -0.1035 - 0.004 * shape.square, sc(1, 0.6, 1)));
  }

  // lids: a cap over each eye and a dark lash line along its rim
  const rim = 1.08 * (eyeStyle === "round" ? eyeR * 1.3 : eyeR);
  for (const s of toy ? [] : SIDES) {
    const ex = s * eyeX;
    add(new SphereGeometry(rim, 12, 6, 0, Math.PI * 2, 0, 0.95), lids, skin, hm(ex, eyeY, eyeZ));
    const lash = new TorusGeometry(rim * Math.sin(0.95), lashTube, 3, 12);
    lash.rotateX(Math.PI / 2);
    add(lash, lids, new Color("#1c1512"), hm(ex, eyeY + rim * Math.cos(0.95), eyeZ));
  }

  // brows, in the hair colour a little deeper
  const browColour = new Color(look.browColour).multiplyScalar(0.8);
  for (let i = 0; i < 2 && eyeStyle !== "peg"; i++) {
    const s = SIDES[i];
    if (toy) {
      // a straight dark dash, tilted and lifted by the brow bone like any other
      add(new BoxGeometry(0.03 * look.eyeSize, 0.0052, 0.004), browBones[i], new Color("#241c19"), hm(s * eyeX, browY, surfaceZ(s * eyeX, browY, 0.015, 0.006) - 0.0022));
      continue;
    }
    add(browGeo(-s, 0.036 * look.eyeSize, 0.0068 * (0.75 + look.brow * 0.45)), browBones[i], browColour, hm(s * eyeX, browY, browZ));
  }

  // lips: an upper and a fuller lower arc that scale together into a smile or
  // a frown, and a dark opening that grows with the jaw
  const arc = (radius: number, tubeR: number, colour: string, dy: number): void => {
    const t = new TorusGeometry(radius, tubeR, 4, 14, 1.6);
    t.rotateZ(-Math.PI / 2 - 0.8);
    add(t, mouth, new Color(colour), hm(0, mouthY + radius + dy, mouthZ));
  };
  if (toy) {
    // one dark, nearly flat dash that still bends into a smile or a frown, and
    // grows taller (not teeth, not a tongue) when it opens
    const dash = new TorusGeometry(0.05, 0.0028, 3, 8, 0.7);
    dash.rotateZ(-Math.PI / 2 - 0.35);
    const ink = new Color("#241c19");
    // the dash bends by scaling about the mouth bone, so its ends can lift
    // forward as it curves: sit it on the most forward facet along its width
    const dashZ = surfaceZ(0, mouthY, 0.025, 0.014) - 0.0016;
    add(dash, mouth, ink, hm(0, mouthY + 0.05, dashZ));
    // the opening is an oval (a flat ellipse the mouthOpen bone stretches
    // taller as it opens: a tall "O" when shocked)
    const hole = new CircleGeometry(1, 16);
    hole.scale(0.0082, 0.003, 1);
    hole.rotateY(Math.PI);
    add(hole, mouthOpen, ink, hm(0, mouthY - 0.002, dashZ - 0.0004));
  } else {
    arc(0.024, 0.0032, "#a8514f", 0.0014);
    arc(0.026, 0.0046, "#c46a66", -0.0022);
    add(new SphereGeometry(0.008, 8, 6), mouthOpen, new Color("#4a1c20"), hm(0, mouthY - 0.002, mouthZ + 0.0015, sc(2.4, 0.9, 1)));
    add(new BoxGeometry(0.02, 0.005, 0.004), mouthOpen, new Color("#f4efe8").multiplyScalar(1.4), hm(0, mouthY + 0.0035, mouthZ - 0.0018));
  }

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
    bones: { root, spine, head, brow: browBones, lids, mouth, mouthOpen, sh, el, hip, kn, dev },
    triangles: merged.getAttribute("position").count / 3,
    look,
    body: bodyStyle,
    eyes: eyeStyle,
    face: faceKey,
    heads: 1.72 / (0.216 * S),
    lidBias,
    pose: {},
    deviceKind: opts.device,
  };
}

export interface PoseInput {
  t: number; // seconds, for motion
  dt: number; // seconds since the last frame
  walk: number; // 0 standing, 1 walking at pace
  phase: number; // walk cycle phase, radians
  mode: Behaviour;
  seed: number; // varies idle motion between people
  seated?: boolean; // sitting on a stool
  device?: boolean; // a device is out (also whenever mode is "device")
  // where the head should point, relative to the body (see shared/gaze.ts):
  // sideways and up or down at once. The behaviour's own head movement
  // becomes a small idle drift around it.
  gaze?: { yaw: number; pitch: number };
}

// Bones from a behaviour, a walk cycle and a mood. Signs, for a hanging limb
// that points down: a positive x rotation swings it forward (-z) and a
// negative one back; a z rotation of the +x arm that is positive swings it
// out and up. A head or torso tips forward with a negative x rotation.
// Targets are smoothed, so one behaviour melts into the next.
export function poseCharacter(c: Character, p: PoseInput, m: Mood, blink: number): void {
  const b = c.bones;
  const st = c.pose;
  const t = p.t;
  const sd = p.seed;
  const s = Math.sin(p.phase);
  const w = p.walk;
  const walking = w >= 0.05;
  const leg = s * 0.7 * w;
  const arm = s * 0.55 * w;
  // weight on one leg when standing: the hips tip, the shoulders answer (not
  // when sitting)
  const weight = walking || p.seated ? 0 : Math.sin(t * 0.45 + sd) * 0.022;

  // targets: x is swing forward, z is out to the side (both arms, "outward"
  // positive), el is the elbow bend, then the torso, head and face extras
  const T: Record<string, number> = {
    shLx: 0.07, shRx: 0.07, shLz: 0.06, shRz: 0.06, shLy: 0, shRy: 0, elL: 0.18, elR: 0.18,
    lean: 0, pitch: 0, yaw: 0, tilt: 0, open: 0, lid: 0, curve: 0,
  };
  if (walking || p.mode === "walk") {
    T.shLx = arm;
    T.shRx = -arm;
    T.shLz = 0.05;
    T.shRz = 0.05;
    T.elL = 0.15 + w * 0.7 * Math.max(0, s);
    T.elR = 0.15 + w * 0.7 * Math.max(0, -s);
  } else {
    switch (p.mode) {
      case "observe":
        // leaning in on a product, one hand up to the chin
        T.lean = 0.22 + Math.sin(t * 0.8) * 0.015;
        T.pitch = 0.32;
        T.shRx = 1.15;
        T.shLx = 0.2;
        T.elR = 1.15;
        T.elL = 0.45;
        T.yaw = Math.sin(t * 0.3 + sd) * 0.15;
        break;
      case "work":
        T.lean = 0.2;
        T.pitch = 0.4;
        T.shLx = 1.0 + Math.sin(t * 5) * 0.07;
        T.shRx = 1.0 + Math.sin(t * 5 + 1.7) * 0.07;
        T.elL = 0.85;
        T.elR = 0.85;
        break;
      case "wave":
        // the right arm up and out, the hand swinging
        T.shRx = 0.0;
        T.shRz = 2.45 + Math.sin(t * 7 + sd) * 0.18;
        T.elR = 0.35 + (Math.sin(t * 7 + sd) * 0.5 + 0.5) * 0.7;
        T.tilt = 0.1;
        T.yaw = -0.15;
        T.curve = 0.3;
        break;
      case "talk":
        // gesturing with the right hand, the mouth moving
        T.shRx = 0.6 + Math.sin(t * 3.1 + sd) * 0.25;
        T.elR = 1.2 + Math.sin(t * 4.3 + sd) * 0.3;
        T.shLx = 0.25;
        T.elL = 0.5;
        T.yaw = Math.sin(t * 0.9 + sd) * 0.18;
        T.pitch = Math.sin(t * 2.7 + sd) * 0.04;
        T.open = 0.12 + 0.28 * Math.pow(Math.sin(t * 9 + sd * 3) * 0.5 + 0.5, 2);
        break;
      case "think":
        // a hand to the chin, the other arm across to hold the elbow
        T.shRx = 1.0;
        T.elR = 2.3;
        T.shLx = 0.55;
        T.shLz = -0.25;
        T.elL = 1.5;
        T.tilt = 0.14;
        T.pitch = 0.08;
        T.yaw = Math.sin(t * 0.4 + sd) * 0.2;
        break;
      case "phone":
        // both hands up in front, eyes on the screen
        T.shLx = 0.9;
        T.shRx = 0.95;
        T.elL = 1.45;
        T.elR = 1.55;
        T.pitch = 0.4;
        T.lean = 0.07;
        T.lid = 0.15;
        break;
      case "crossed":
        // arms folded: the elbow bends the forearm forward, then the shoulder
        // turns inward about the vertical axis so it lies across the chest
        T.shLx = 0.3;
        T.shRx = 0.3;
        T.shLy = -1.3;
        T.shRy = 1.3;
        T.shLz = 0.0;
        T.shRz = 0.0;
        T.elL = 1.65;
        T.elR = 1.65;
        T.yaw = Math.sin(t * 0.35 + sd) * 0.3;
        break;
      case "laugh":
        // head back, shoulders bouncing, hands to the belly
        T.shLx = 0.45;
        T.shRx = 0.45;
        T.elL = 1.0;
        T.elR = 1.0;
        T.lean = 0.02 + Math.sin(t * 11 + sd) * 0.05;
        T.pitch = -0.22;
        T.open = 0.7 + 0.25 * Math.sin(t * 11 + sd);
        T.lid = 0.5;
        T.curve = 0.5;
        break;
      case "point":
        // the right arm straight out, looking where it points
        T.shRx = 1.45;
        T.shRz = 0.2;
        T.elR = 0.08;
        T.yaw = 0.35;
        T.pitch = 0.04;
        break;
      case "listen": {
        // attentive: a slow nod, the head a little tilted, one hand loose
        const nod = Math.sin(t * 1.8 + sd) * 0.5 + 0.5;
        T.pitch = 0.04 + nod * 0.1;
        T.tilt = 0.08;
        T.shLx = 0.12;
        T.elL = 0.3;
        T.elR = 0.22;
        T.lean = 0.03;
        break;
      }
      case "handshake":
        // the right hand out, a small pump
        T.shRx = 1.2 + Math.sin(t * 9 + sd) * 0.07;
        T.elR = 0.5 + Math.sin(t * 9 + sd + 1) * 0.08;
        T.shRz = -0.05;
        T.lean = 0.06;
        T.pitch = 0.04;
        T.curve = 0.3;
        break;
      case "clap": {
        // forearms forward, the hands coming together and apart
        const c = Math.sin(t * 10 + sd) * 0.5 + 0.5;
        T.shLx = 0.95;
        T.shRx = 0.95;
        T.elL = 1.75;
        T.elR = 1.75;
        T.shLy = -(0.35 + 0.4 * c);
        T.shRy = 0.35 + 0.4 * c;
        T.shLz = 0;
        T.shRz = 0;
        T.pitch = 0.04;
        T.curve = 0.4;
        break;
      }
      case "bow": {
        // forward from the waist and back up, hands in front
        const b = Math.max(0, Math.sin(t * 1.7 - 0.8));
        T.lean = 0.75 * b;
        T.pitch = 0.25 * b;
        T.shLx = 0.3;
        T.shRx = 0.3;
        T.elL = 0.5;
        T.elR = 0.5;
        break;
      }
      case "device":
        // a device held up in the right hand, the left tapping at it, eyes on it
        T.shRx = 0.85;
        T.shRy = 0.3;
        T.elR = 1.65;
        T.shLx = 0.95;
        T.shLy = -0.35 + Math.sin(t * 5 + sd) * 0.1;
        T.elL = 1.95;
        T.pitch = 0.4;
        T.lean = 0.07;
        T.curve = 0.25;
        break;
      default:
        // idle: a slow look around, arms loose
        T.yaw = Math.sin(t * 0.55 + sd) * 0.4;
        T.shLx = 0.07 + Math.sin(t * 1.1 + sd) * 0.03;
        T.elL = 0.18 + Math.max(0, weight) * 6;
        T.elR = 0.18 + Math.max(0, -weight) * 6;
    }
  }
  // looking at something: the head points at it on both axes, the behaviour's
  // own head movement kept as a small drift. The spine's lean already tips the
  // head forward, so it is taken off the pitch.
  if (p.gaze && !walking) {
    T.yaw = p.gaze.yaw + T.yaw * 0.25;
    T.pitch = p.gaze.pitch * 0.9 - T.lean + T.pitch * 0.1;
  }
  const k = 1 - Math.exp(-(walking ? 14 : 7) * p.dt);
  for (const key of Object.keys(T)) {
    const cur = st[key] ?? T[key];
    st[key] = cur + (T[key] - cur) * k;
  }

  // sitting and the device ease in and out like everything else
  const wantSeat = p.seated ? 1 : 0;
  const wantDev = p.device || p.mode === "device" ? 1 : 0;
  const ks = 1 - Math.exp(-6 * p.dt);
  st.seat = (st.seat ?? 0) + (wantSeat - (st.seat ?? 0)) * ks;
  st.dev = (st.dev ?? 0) + (wantDev - (st.dev ?? 0)) * ks;
  const seat = st.seat;

  const baseY = (b.root.userData.y ??= b.root.position.y) as number;
  // seated: the pelvis drops to the top of the stool (0.7 m) plus a little
  const seatedY = Math.min(baseY, SEAT_H + 0.1);
  b.root.position.y = (baseY + Math.abs(s) * 0.03 * w) * (1 - seat) + seatedY * seat;
  b.root.rotation.z = weight * 0.8;
  // the thighs go forward and the shins hang down
  b.hip[0].rotation.x = -leg * (1 - seat) + 1.5 * seat;
  b.hip[1].rotation.x = leg * (1 - seat) + 1.5 * seat;
  // knees bend back as a leg swings through, and a little when standing; the
  // unloaded leg softens more
  b.kn[0].rotation.x = -(0.04 + Math.max(0, Math.sin(p.phase + 1.2 + Math.PI)) * 0.95 * w + Math.max(0, weight) * 3) * (1 - seat) - 1.55 * seat;
  b.kn[1].rotation.x = -(0.04 + Math.max(0, Math.sin(p.phase + 1.2)) * 0.95 * w + Math.max(0, -weight) * 3) * (1 - seat) - 1.55 * seat;
  b.dev.scale.setScalar(Math.max(0.0001, st.dev));
  b.sh[0].rotation.set(st.shLx, st.shLy, -st.shLz);
  b.sh[1].rotation.set(st.shRx, st.shRy, st.shRz);
  b.el[0].rotation.x = st.elL;
  b.el[1].rotation.x = st.elR;
  b.spine.rotation.x = -(st.lean + 0.05 * seat);
  b.spine.rotation.z = -weight * 1.1;
  b.head.rotation.set(-st.pitch, st.yaw, st.tilt + weight * 0.9);

  // face: lids (with a blink and the eye style's resting droop), brows (lift
  // and tilt, inner ends up is positive), mouth as an arc plus an opening;
  // a behaviour can add to the mood (a laugh opens the mouth and squints)
  const lidAmount = m.lid + st.lid + c.lidBias + blink;
  if (c.eyes === "toy" || c.eyes === "peg") {
    // flat eyes shut by squashing: wide when surprised, a slit when squinting
    b.lids.scale.y = Math.min(1.3, Math.max(0.08, 1 - (lidAmount + 0.3) * 0.9));
  } else {
    b.lids.rotation.x = -Math.min(1.35, lidAmount);
  }
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const base = (b.brow[i].userData.y ??= b.brow[i].position.y) as number;
    b.brow[i].position.y = base + m.browY;
    b.brow[i].rotation.z = -side * m.browTilt;
  }
  const curve = m.curve + st.curve;
  const open = Math.min(1.2, m.open + st.open);
  const bend = Math.abs(curve * 1.6) < 0.08 ? 0.08 : curve * 1.6;
  const mw = c.look.mouthWidth * m.width;
  // a toy mouth is one dash, which gives way to the oval as it opens wide
  const dashFade = c.eyes === "toy" || c.eyes === "peg" ? 1 - Math.min(1, Math.max(0, (open - 0.5) * 2)) : 1;
  b.mouth.scale.set(Math.max(0.0001, mw * (1 - open * 0.5) * dashFade), bend * (1 - open * 0.6), 1);
  b.mouthOpen.scale.set(0.5 + open * 1.0, 0.1 + open * 2.4, 1);
}
