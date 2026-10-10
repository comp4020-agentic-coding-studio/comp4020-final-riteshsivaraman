// Small instancing helpers for the shell: many boxes or many flat quads in one
// draw call each (trims, mullions, light panels, glows, hot spots).
import { useLayoutEffect, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, Euler, FrontSide, InstancedMesh, NormalBlending, Object3D, type Texture } from "three";
import type { Cuboid } from "./common.tsx";

export function Boxes({
  boxes,
  roughness = 0.5,
  metalness = 0,
  emissive = 0,
}: {
  boxes: Cuboid[];
  roughness?: number;
  metalness?: number;
  emissive?: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const c = new Color();
    boxes.forEach((b, i) => {
      o.position.set(b.x, b.y, b.z);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(b.colour));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [boxes]);
  if (boxes.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={roughness} metalness={metalness} emissive="#ffffff" emissiveIntensity={emissive} />
    </instancedMesh>
  );
}

export interface Quad {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  rx?: number;
  ry?: number;
  rz?: number;
  colour?: string;
}

// Flat quads sharing one texture. `glow` makes them additive (light spill,
// hot spots); otherwise they are unlit and opaque unless the map has alpha.
export function Quads({
  quads,
  map,
  glow = false,
  opacity = 1,
  transparent = false,
  double = false,
  toneMapped = false,
}: {
  quads: Quad[];
  map?: Texture;
  glow?: boolean;
  opacity?: number;
  transparent?: boolean;
  double?: boolean;
  toneMapped?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const c = new Color();
    quads.forEach((q, i) => {
      o.position.set(q.x, q.y, q.z);
      o.rotation.copy(new Euler(q.rx ?? 0, q.ry ?? 0, q.rz ?? 0, "YXZ"));
      o.scale.set(q.w, q.h, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(q.colour ?? "#ffffff"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [quads]);
  if (quads.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, quads.length]} frustumCulled={false} renderOrder={glow ? 2 : 0}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={map}
        transparent={glow || transparent}
        opacity={opacity}
        blending={glow ? AdditiveBlending : NormalBlending}
        depthWrite={!(glow || transparent)}
        side={double ? DoubleSide : FrontSide}
        toneMapped={toneMapped}
      />
    </instancedMesh>
  );
}
