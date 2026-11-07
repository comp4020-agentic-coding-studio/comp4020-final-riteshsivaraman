// Issue #11's pure mixer: given the listener's position and a list of sound
// sources, decide how loud each one should be. No WebAudio here at all —
// this file is a plain function of numbers so it can be unit tested without
// a browser audio context (see spec/11-procedural-soundscape.test.ts). The
// WebAudio layer that actually plays sound lives in audio.ts and consumes
// this function's output; it never needs to know about distance or caps.

export interface SoundSource {
  id: string;
  x: number;
  z: number;
}

export interface SourceGain {
  id: string;
  gain: number;
}

// Beyond this distance (metres) a source is inaudible even if it would
// otherwise have a voice free under the cap — the store isn't that big, but
// this keeps the falloff curve bounded rather than asymptoting forever.
const FALLOFF_RADIUS = 14;

// Smooth, monotonically decreasing 0..1 falloff: full volume at distance 0,
// silent at and beyond FALLOFF_RADIUS. Squared so it falls off faster near
// the listener and tails off more gently further out, closer to how a room
// actually sounds than a straight linear ramp.
function distanceGain(distance: number): number {
  if (distance <= 0) return 1;
  const linear = 1 - distance / FALLOFF_RADIUS;
  return linear > 0 ? linear * linear : 0;
}

// One gain per source, in [0,1], louder the closer a source is to the
// listener. At most `maxVoices` sources keep a non-zero gain — chosen by
// actual distance from the listener, not by where they sit in the input
// array, so a phone with 20 people in the room only ever mixes the nearest
// few. Order of the returned array matches the order of `sources`.
export function computeGains(
  listener: { x: number; z: number },
  sources: SoundSource[],
  maxVoices: number,
): SourceGain[] {
  const withDistance = sources.map((s) => ({
    id: s.id,
    distance: Math.hypot(s.x - listener.x, s.z - listener.z),
  }));
  // closest first, so the cap below always keeps the N nearest regardless of
  // what order the sources were passed in
  const byDistance = [...withDistance].sort((a, b) => a.distance - b.distance);
  const cap = Math.max(0, maxVoices);
  const audible = new Set(byDistance.slice(0, cap).map((s) => s.id));
  return withDistance.map((s) => ({
    id: s.id,
    gain: audible.has(s.id) ? distanceGain(s.distance) : 0,
  }));
}
