import { ComputerDevice } from "./computers.tsx";
import type { Kind } from "./common.tsx";
import { PhoneDevice, type ScreenMode } from "./phones.tsx";

// One product on a surface at height `y`, facing along `rotY` (0 faces +z).
// Each family is drawn by its own module: computers.tsx (laptops and tablets)
// and phones.tsx (phones, watches, earbuds, headphones, speakers, trackers).
export function Device({
  kind,
  x,
  y,
  z,
  rotY,
  colour,
  model,
  screenMode,
  held,
}: {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  rotY: number;
  colour: string;
  model?: string;
  screenMode?: ScreenMode;
  held?: boolean; // in a hand: no stand, centred on the origin, screen to +z
}) {
  if (kind === "laptop" || kind === "tabletKb" || kind === "tablet") {
    return <ComputerDevice kind={kind} x={x} y={y} z={z} rotY={rotY} colour={colour} model={model} screenMode={screenMode} held={held} />;
  }
  return <PhoneDevice kind={kind} x={x} y={y} z={z} rotY={rotY} colour={colour} model={model} screenMode={screenMode} held={held} />;
}
