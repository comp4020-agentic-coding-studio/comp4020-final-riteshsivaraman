import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeGains, type SoundSource } from "../src/client/src/sound.ts";

type Gain = { id: string; gain: number };

// Promise (issue #11, spec line): "The sound module exposes a pure mixer:
// given listener and source positions it returns gains, capped at N voices;
// no audio files are imported." This is the one blocking check for the
// soundscape; calm feel, mute persistence and perceptual distance falloff
// are advisory (feel-check), not here. No WebAudio context, no renderer: a
// plain function of positions in, gains out.
//
// Walk every source position returned by `computeGains` and look up its gain
// by id, so the test does not assume the function preserves input order.
function gainOf(result: Gain[], id: string): number {
  const found = result.find((r) => r.id === id);
  if (!found) throw new Error(`no gain entry for source ${id}`);
  return found.gain;
}

const listener = { x: 0, z: 0 };

describe("computeGains: the pure mixer", () => {
  it("gives every source a gain between 0 and 1, one entry per source", () => {
    const sources: SoundSource[] = [
      { id: "a", x: 1, z: 0 },
      { id: "b", x: 0, z: 2 },
    ];
    const result = computeGains(listener, sources, 8);
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.gain).toBeGreaterThanOrEqual(0);
      expect(r.gain).toBeLessThanOrEqual(1);
    }
  });

  it("is quieter the further the source is from the listener", () => {
    const sources: SoundSource[] = [
      { id: "near", x: 1, z: 0 },
      { id: "far", x: 10, z: 0 },
    ];
    const result = computeGains(listener, sources, 8);
    expect(gainOf(result, "near")).toBeGreaterThan(gainOf(result, "far"));
  });

  it("does not silence anything when there are no more sources than the voice cap", () => {
    const sources: SoundSource[] = [
      { id: "a", x: 1, z: 0 },
      { id: "b", x: 2, z: 0 },
      { id: "c", x: 3, z: 0 },
    ];
    const result = computeGains(listener, sources, 8);
    for (const s of sources) {
      expect(gainOf(result, s.id)).toBeGreaterThan(0);
    }
  });

  it("caps at N voices: only the N closest keep a non-zero gain, by distance not array position", () => {
    // Distances 1..5 from the listener, deliberately NOT given in distance
    // order, so a bug that caps "the first N in the array" instead of "the N
    // closest" would pass this test's sibling below but fail this one.
    const sources: SoundSource[] = [
      { id: "d5", x: 5, z: 0 },
      { id: "d2", x: 2, z: 0 },
      { id: "d4", x: 4, z: 0 },
      { id: "d1", x: 1, z: 0 },
      { id: "d3", x: 3, z: 0 },
    ];
    const result = computeGains(listener, sources, 3);
    const loud = result.filter((r: Gain) => r.gain > 0).map((r: Gain) => r.id).sort();
    expect(loud).toEqual(["d1", "d2", "d3"]);
    expect(gainOf(result, "d4")).toBe(0);
    expect(gainOf(result, "d5")).toBe(0);
  });

  it("reverses which sources are silenced when which ones are closest reverses", () => {
    // Same five distances, but now the FAR ones are first in the array and
    // the cap should still follow distance, not position: assert the
    // opposite direction of the defect above (silencing the wrong half).
    const sources: SoundSource[] = [
      { id: "d1", x: 1, z: 0 },
      { id: "d2", x: 2, z: 0 },
      { id: "d3", x: 3, z: 0 },
      { id: "d4", x: 4, z: 0 },
      { id: "d5", x: 5, z: 0 },
    ];
    const result = computeGains(listener, sources, 2);
    const loud = result.filter((r: Gain) => r.gain > 0).map((r: Gain) => r.id).sort();
    expect(loud).toEqual(["d1", "d2"]);
    expect(gainOf(result, "d3")).toBe(0);
    expect(gainOf(result, "d4")).toBe(0);
    expect(gainOf(result, "d5")).toBe(0);
  });

  it("never returns more than N non-zero voices even with far more sources than the cap", () => {
    const sources: SoundSource[] = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      x: i + 1,
      z: 0,
    }));
    const result = computeGains(listener, sources, 6);
    expect(result.filter((r: Gain) => r.gain > 0)).toHaveLength(6);
  });
});

// Acceptance criterion 4: no audio asset files appear in the repo. There is
// no sound-assets directory yet (checked by hand: a repo-wide search for
// .mp3/.wav/.ogg/.m4a/.flac/.aac/.webm under src/ and src/client/public/
// found nothing), so this walks those directories and fails the day
// someone drops a sample in rather than relying on review to catch it.
describe("no audio files are imported", () => {
  const AUDIO_EXT = [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".webm"];
  const ROOTS = ["src", join("src", "client", "public")];

  function walk(dir: string): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) files.push(...walk(full));
      else if (AUDIO_EXT.some((ext) => entry.toLowerCase().endsWith(ext))) files.push(full);
    }
    return files;
  }

  it("has no audio asset files under src/ or the client's public/ folder", () => {
    const found = ROOTS.flatMap(walk);
    expect(found).toEqual([]);
  });
});
