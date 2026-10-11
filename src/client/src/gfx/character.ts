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

// A whole person as ONE skinned mesh: one draw call, about 2,500 triangles,
// a 16-bone skeleton. Every part is rigidly bound to one bone (no blending),
// which suits a faceted look. The face moves through bones too: brows tilt and
// lift, the lids close, the mouth scales into a smile or a frown and opens.
//
// Proportions follow the 7.5-head figure canon: a 0.23 m head, 1.72 m tall,
// chin at 1.49 m, shoulders at 1.38 m, crotch at the midpoint, knees at 0.48 m.
// Shoulders against hips comes from `shoulderHip` in the appearance.
// Metres, y up, the figure faces -z.

const HEAD_Y = 1.605; // centre of the head
const EYE = { y: 0.002, z: -0.0855 }; // half-embedded: the face surface here is at about -0.087
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

// A faceted tube through rings: each ring is a height, half-width, half-depth.
function loft(rings: Array<{ y: number; wx: number; wz: number; cz?: number }>, sides = 8): BufferGeometry {
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

// A hanging limb segment between two heights, tapering from r0 to r1.
function segment(x: number, yTop: number, yBottom: number, r0: number, r1: number, sides = 7): BufferGeometry {
  const len = yTop - yBottom;
  const g = new CylinderGeometry(r0, r1, len, sides, 1);
  g.translate(x, (yTop + yBottom) / 2, 0);
  return g;
}

// A brow: a few short boxes along a gentle arch, thick at the inner end and
// tapering outward. Local to the brow bone, which sits at the brow's centre.
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
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}

export function buildCharacter(look: Appearance, shirtHex: string): Character {
  const skin = new Color(look.skin);
  const shirt = new Color(shirtHex);
  const pants = new Color(look.pants);
  const shoes = new Color(look.shoes);
  const dark = (c: Color, k: number): Color => c.clone().multiplyScalar(k);

  // ---- frame ----
  const shoulderHalf = 0.185 * look.build * (0.82 + 0.3 * look.shoulderHip) * 0.95;
  const hipHalf = Math.max(0.1, (shoulderHalf * 1.05) / look.shoulderHip);
  const waistHalf = Math.min(shoulderHalf, hipHalf) * 0.84;
  const legX = hipHalf * 0.52;
  const armX = shoulderHalf * 1.02;

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
  const root = mk("root", 0, 0.9, 0, null);
  const spine = mk("spine", 0, 0.95, 0, root);
  const head = mk("head", 0, 1.5, 0, spine);
  const eyeX = 0.034 * look.eyeSpacing * look.faceWidth;
  const browBones = SIDES.map((s) => mk(`brow${s}`, s * eyeX, HEAD_Y + BROW.y, BROW.z, head)) as [Bone, Bone];
  const lids = mk("lids", 0, HEAD_Y + EYE.y, EYE.z, head);
  const mouth = mk("mouth", 0, HEAD_Y + MOUTH.y, MOUTH.z, head);
  const mouthOpen = mk("mouthOpen", 0, HEAD_Y + MOUTH.y - 0.002, MOUTH.z, head);
  const sh = SIDES.map((s) => mk(`sh${s}`, s * armX, 1.37, 0, spine)) as [Bone, Bone];
  const el = SIDES.map((s, i) => mk(`el${s}`, s * (armX + 0.01), 1.1, 0, sh[i])) as [Bone, Bone];
  const hip = SIDES.map((s) => mk(`hip${s}`, s * legX, 0.88, 0, root)) as [Bone, Bone];
  const kn = SIDES.map((s, i) => mk(`kn${s}`, s * legX, 0.48, 0, hip[i])) as [Bone, Bone];
  const idx = (b: Bone): number => list.indexOf(b);

  // ---- parts ----
  const geos: BufferGeometry[] = [];
  const add = (g: BufferGeometry, bone: Bone, color: Color | null, m?: Matrix4): void => {
    geos.push(prep(g, idx(bone), color, m));
  };

  // pelvis to the root bone; chest, shoulders and neck base to the spine
  add(
    loft([
      { y: 0.78, wx: hipHalf * 0.9, wz: 0.1 },
      { y: 0.92, wx: hipHalf * 1.12, wz: 0.115 },
      { y: 1.07, wx: waistHalf, wz: 0.095 },
    ]),
    root,
    pants,
  );
  add(
    loft([
      { y: 1.07, wx: waistHalf, wz: 0.095 },
      { y: 1.26, wx: shoulderHalf * 0.92, wz: 0.115 },
      { y: 1.38, wx: shoulderHalf * 1.0, wz: 0.1 },
      { y: 1.46, wx: 0.06, wz: 0.055 },
    ]),
    spine,
    shirt,
  );
  // neck turns with the head
  add(new CylinderGeometry(0.046, 0.05, 0.1, 8), head, skin, at(0, 1.5, 0.004));

  for (let i = 0; i < 2; i++) {
    const s = SIDES[i];
    const ax = s * armX;
    // arm: shoulder ball, upper arm in the sleeve, elbow, bare forearm, hand
    add(new IcosahedronGeometry(0.047, 0), spine, shirt, at(ax, 1.365, 0));
    add(segment(ax, 1.37, 1.11, 0.046, 0.038), sh[i], shirt);
    add(new IcosahedronGeometry(0.038, 0), el[i], shirt, at(ax + s * 0.01, 1.1, 0));
    add(segment(ax + s * 0.01, 1.1, 0.9, 0.035, 0.027), el[i], skin);
    add(new BoxGeometry(0.05, 0.085, 0.028), el[i], skin, at(ax + s * 0.01, 0.855, 0));
    // leg: thigh, knee, shin, shoe
    const lx = s * legX;
    add(segment(lx, 0.9, 0.5, 0.09, 0.062), hip[i], pants);
    add(new IcosahedronGeometry(0.058, 0), kn[i], pants, at(lx, 0.48, 0));
    add(segment(lx, 0.48, 0.1, 0.057, 0.04), kn[i], pants);
    add(new BoxGeometry(0.095, 0.075, 0.24), kn[i], shoes, at(lx, 0.045, -0.04));
    add(new SphereGeometry(0.05, 6, 4), kn[i], shoes, at(lx, 0.05, -0.15));
  }

  // head, with hair painted on and the ears built into it
  const headGeo = buildHead(
    { width: look.faceWidth, jaw: look.jaw, brow: look.brow, nose: look.noseSize, cheek: look.cheek, chin: look.chin },
    look.hairStyle,
    look.hairColour,
    look.skin,
  );
  headGeo.translate(0, HEAD_Y, 0);
  add(headGeo, head, null);
  for (const s of SIDES) {
    add(new IcosahedronGeometry(0.026, 1), head, skin, new Matrix4().makeTranslation(s * 0.081 * look.faceWidth, HEAD_Y - 0.012, 0.006).multiply(new Matrix4().makeScale(0.4, 1, 0.75)));
  }
  const hair = new Color(look.hairColour);
  if (look.hairStyle === "long") {
    add(new IcosahedronGeometry(1, 1), head, hair, new Matrix4().makeTranslation(0, HEAD_Y - 0.09, 0.07).multiply(new Matrix4().makeScale(0.088, 0.15, 0.042)));
  }
  if (look.hairStyle === "bun") {
    add(new IcosahedronGeometry(1, 1), head, hair, new Matrix4().makeTranslation(0, HEAD_Y + 0.095, 0.075).multiply(new Matrix4().makeScale(0.04, 0.04, 0.04)));
  }

  // eyes: a ball, then flat discs stacked on its front (limbal ring, iris,
  // pupil, a highlight), so each eye has depth for very few triangles
  const eyeR = 0.0112 * look.eyeSize;
  const iris = new Color(look.eyeColour);
  const sclera = new Color("#ffffff");
  const front = (rho: number): number => -Math.sqrt(1 - rho * rho) * eyeR - 0.0004;
  for (const s of SIDES) {
    const ex = s * eyeX;
    const ey = HEAD_Y + EYE.y;
    add(new SphereGeometry(eyeR, 12, 8), head, sclera, at(ex, ey, EYE.z));
    const disc = (rho: number, c: Color, dx = 0, dy = 0, lift = 0): void => {
      const g = new CircleGeometry(rho * eyeR, 8);
      g.rotateY(Math.PI);
      add(g, head, c, at(ex + dx, ey + dy, EYE.z + front(rho) - lift));
    };
    disc(0.64, dark(iris, 0.45)); // limbal ring
    disc(0.54, iris, 0, 0, 0.0005);
    disc(0.4, iris.clone().lerp(new Color("#ffffff"), 0.18), 0, -0.0006, 0.001);
    disc(0.26, new Color("#0c0a09"), 0, 0, 0.0015);
    disc(0.1, new Color("#ffffff"), s * -0.0025, 0.0032, 0.002);
  }
  // nostrils under the tip of the nose
  for (const s of SIDES) {
    add(new SphereGeometry(0.0034, 5, 4), head, dark(skin, 0.45), new Matrix4().makeTranslation(s * 0.0072 * look.noseSize, HEAD_Y - 0.0425, -0.1035).multiply(new Matrix4().makeScale(1, 0.6, 1)));
  }

  // lids: a cap over each eyeball and a dark lash line along its rim
  const rim = 1.08 * eyeR;
  for (const s of SIDES) {
    const ex = s * eyeX;
    const ey = HEAD_Y + EYE.y;
    add(new SphereGeometry(rim, 12, 6, 0, Math.PI * 2, 0, 0.95), lids, skin, at(ex, ey, EYE.z));
    const lash = new TorusGeometry(rim * Math.sin(0.95), 0.0007, 3, 12);
    lash.rotateX(Math.PI / 2);
    add(lash, lids, new Color("#1c1512"), at(ex, ey + rim * Math.cos(0.95), EYE.z));
  }

  // brows, in the hair colour a little deeper
  const browColour = new Color(look.browColour).multiplyScalar(0.8);
  for (let i = 0; i < 2; i++) {
    const s = SIDES[i];
    const g = browGeo(-s, 0.036 * look.eyeSize, 0.0068 * (0.75 + look.brow * 0.45));
    add(g, browBones[i], browColour, at(s * eyeX, HEAD_Y + BROW.y, BROW.z));
  }

  // lips: an upper and a fuller lower arc that scale together into a smile or
  // a frown, and a dark opening that grows with the jaw
  const arc = (radius: number, tube: number, colour: string, dy: number): void => {
    const t = new TorusGeometry(radius, tube, 4, 12, 1.2);
    t.rotateZ(-Math.PI / 2 - 0.6);
    add(t, mouth, new Color(colour), at(0, HEAD_Y + MOUTH.y + radius + dy, MOUTH.z));
  };
  arc(0.024, 0.0032, "#a8514f", 0.0014);
  arc(0.026, 0.0046, "#c46a66", -0.0022);
  const inside = new SphereGeometry(0.008, 8, 6);
  add(inside, mouthOpen, new Color("#4a1c20"), at(0, HEAD_Y + MOUTH.y - 0.002, MOUTH.z + 0.0015));

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

  const triangles = merged.getAttribute("position").count / 3;
  return {
    root: group,
    bones: { root, spine, head, brow: browBones, lids, mouth, mouthOpen, sh, el, hip, kn },
    triangles,
    look,
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
  if (w < 0.05) {
    aL = 0.06;
    aR = 0.06;
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
    }
  }
  b.root.position.y = 0.9 + Math.abs(s) * 0.03 * w;
  b.hip[0].rotation.x = -leg;
  b.hip[1].rotation.x = leg;
  // knees bend back as a leg swings through, and a little when standing
  b.kn[0].rotation.x = -(0.04 + Math.max(0, Math.sin(p.phase + 1.2 + Math.PI)) * 0.95 * w);
  b.kn[1].rotation.x = -(0.04 + Math.max(0, Math.sin(p.phase + 1.2)) * 0.95 * w);
  b.sh[0].rotation.x = aL;
  b.sh[1].rotation.x = aR;
  b.el[0].rotation.x = eL;
  b.el[1].rotation.x = eR;
  b.spine.rotation.x += (-lean - b.spine.rotation.x) * 0.15;
  b.head.rotation.x += (-headPitch - b.head.rotation.x) * 0.15;
  b.head.rotation.y += (headYaw - b.head.rotation.y) * 0.1;

  // face: lids (with a blink), brows (lift and tilt, inner ends up is
  // positive), and the mouth as an arc that bends and an opening that grows
  b.lids.rotation.x = -Math.min(1.35, m.lid + blink);
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
