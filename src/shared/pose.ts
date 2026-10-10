import type { Pose } from "./protocol.ts";

// Whether a pose is different enough from the last one sent to be worth
// sending again (1 cm of position or about 1 degree of heading).
export function poseChanged(prev: Pose | null, next: Pose): boolean {
  // Nothing sent yet: always send. (A NaN stand-in for "last" does not work:
  // every comparison with NaN is false, so the pose would never be sent.)
  if (!prev) return true;
  return (
    Math.abs(next.x - prev.x) > 0.01 ||
    Math.abs(next.z - prev.z) > 0.01 ||
    Math.abs(next.ry - prev.ry) > 0.02
  );
}
