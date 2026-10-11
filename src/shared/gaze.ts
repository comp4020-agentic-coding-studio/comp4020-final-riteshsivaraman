import { wrap } from "./steering.ts";

// Where a head should point to look at something, on two axes at once:
// sideways (yaw) and up or down (pitch), relative to the way the body faces.
// Pure, so a spec can pin the signs down. Conventions match the character rig:
// heading h faces (-sin h, -cos h); a positive yaw turns the same way as a
// positive heading; a positive pitch looks DOWN.

export interface GazePoint {
  x: number;
  y: number; // height above the floor
  z: number;
}

export interface Gaze {
  yaw: number;
  pitch: number;
}

export const EYE_HEIGHT = 1.55;
// how far a head turns on its own before the body would have to follow, and
// how far it tips up or down
export const MAX_YAW = 1.1;
export const MAX_UP = 0.6;
export const MAX_DOWN = 0.75;

export function gazeAt(from: { x: number; z: number; ry: number }, target: GazePoint, eyeY: number = EYE_HEIGHT): Gaze {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const flat = Math.hypot(dx, dz);
  const yaw = flat < 0.05 ? 0 : wrap(Math.atan2(-dx, -dz) - from.ry);
  const pitch = Math.atan2(eyeY - target.y, Math.max(flat, 0.3));
  return {
    yaw: Math.max(-MAX_YAW, Math.min(MAX_YAW, yaw)),
    pitch: Math.max(-MAX_UP, Math.min(MAX_DOWN, pitch)),
  };
}
