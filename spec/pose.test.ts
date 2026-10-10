import { expect, it } from "vitest";
import { poseChanged } from "../src/shared/pose.ts";

// Promise: the client really sends its movement. The server tests drive raw
// sockets, so they cannot catch the client forgetting to send. This is the
// decision the client makes each frame, and it once never fired (a NaN
// "last sent" makes every comparison false).
const at = { x: 1, z: 2, ry: 0.5 };

it("sends the first pose, whatever it is", () => {
  expect(poseChanged(null, at)).toBe(true);
  expect(poseChanged(null, { x: 0, z: 0, ry: 0 })).toBe(true);
});

it("sends again when the visitor has walked", () => {
  expect(poseChanged(at, { ...at, x: 1.5 })).toBe(true);
  expect(poseChanged(at, { ...at, z: 2.2 })).toBe(true);
});

it("sends again when the visitor has only turned", () => {
  expect(poseChanged(at, { ...at, ry: 0.9 })).toBe(true);
});

it("stays quiet when nothing has really changed", () => {
  expect(poseChanged(at, at)).toBe(false);
  expect(poseChanged(at, { x: 1.001, z: 2.001, ry: 0.505 })).toBe(false);
});
