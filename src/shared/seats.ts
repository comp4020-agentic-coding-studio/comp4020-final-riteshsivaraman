import { BAR_STOOL_SEAT_H, STOOL_SEAT_H } from "./plan.ts";
import { STOOL_LIST } from "./world.ts";

// How high someone sits, and so where their eyes are, depends on the stool: the bar stools are tall enough that a
// customer sat on one is eye to eye with the staff member standing behind the bar; the stools at the square
// tables are lower, where both people sit.

// the height of the seat of the stool nearest this spot (where a seated person is placed)
export function seatHeightAt(x: number, z: number): number {
  let best = STOOL_SEAT_H;
  let bestD = 0.7;
  for (const s of STOOL_LIST) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bestD) {
      bestD = d;
      best = s.kind === "bar" ? BAR_STOOL_SEAT_H : STOOL_SEAT_H;
    }
  }
  return best;
}

// the eye height of someone sat on a seat that high: the pelvis rests a little above the seat, the eyes about
// 0.65 m above the pelvis (a standing eye height of 1.6 m is the same body standing)
export const seatEyeY = (seatH: number): number => seatH + 0.1 + 0.65;
