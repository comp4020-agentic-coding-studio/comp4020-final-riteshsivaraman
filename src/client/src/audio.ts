// The WebAudio layer for issue #11. Everything here is synthesised: noise
// buffers generated in code and oscillators, never a sample file (no .mp3,
// .wav etc. anywhere — see spec/11-procedural-soundscape.test.ts, which
// walks the repo for them). This module is the only place that touches
// `AudioContext`; it consumes the pure mixer in sound.ts rather than
// recomputing distance falloff itself.
//
// Browsers refuse to play anything before a user gesture, so nothing here
// makes sound until `unlock()` runs (wired to the first pointerdown/keydown
// on the page in main.tsx). The mute toggle flips a master gain to zero and
// remembers the choice in localStorage, same pattern as net.ts's token.

import { computeGains, type SoundSource } from "./sound.ts";

const MUTE_KEY = "sound-muted";
// how many people's ambient murmur can be live at once — the issue's "a
// phone does not choke" budget. Far more people than this can be in the
// room; computeGains always keeps the nearest MAX_VOICES of them audible.
const MAX_VOICES = 6;
// a voice whose gain has sat at (or very near) zero for this long is torn
// down rather than kept running silently
const VOICE_IDLE_MS = 4000;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false; // private window or blocked storage: starts unmuted
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* the choice just won't survive a reload */
  }
}

interface Voice {
  gain: GainNode;
  source: AudioBufferSourceNode;
  lastAudibleAt: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private voices = new Map<string, Voice>();
  private listeners = new Set<() => void>();
  muted = readMuted();
  unlocked = false;

  // Subscribe to mute changes (for the toggle button's React state).
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  // Called once, from the first pointerdown/keydown anywhere on the page.
  // A no-op on every call after the first.
  unlock(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // WebAudio unavailable: the store stays silent, nothing else breaks
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoiseBuffer(this.ctx);
    this.unlocked = true;
    this.startRoomTone();
    this.notify();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeMuted(muted);
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : 1, now, 0.08);
    }
    this.notify();
  }
  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  // A few seconds of white noise, looped. Cheap to generate, reused for the
  // room tone, every murmur voice and every one-shot cue (each filters and
  // shapes it differently) so there is exactly one buffer in memory.
  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseSource(ctx: AudioContext, loop: boolean): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = loop;
    return src;
  }

  // A quiet, constant low-passed hiss: the store's own air handling and
  // distant mall noise, always on once unlocked, not spatialised and not
  // part of the voice cap.
  private startRoomTone(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const src = this.noiseSource(ctx, true);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 300;
    const gain = ctx.createGain();
    gain.gain.value = 0.02; // barely there: a calm room, not white noise
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  // One murmur voice per nearby person: filtered noise, shaped to sit in a
  // voice-like frequency band, amplitude-modulated slowly so a held gain
  // doesn't read as a tone. Created lazily the first time a source becomes
  // audible, torn down once it has been silent for a while (see sweep()).
  private makeVoice(ctx: AudioContext): Voice {
    const src = this.noiseSource(ctx, true);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 500 + Math.random() * 400;
    band.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    // a slow wobble on the gain so a sustained voice reads as chatter, not a drone
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 2.5 + Math.random() * 2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain);
    const wobble = ctx.createGain();
    wobble.gain.value = 1;
    lfoGain.connect(wobble.gain);
    src.connect(band).connect(wobble).connect(gain).connect(this.master!);
    src.start();
    lfo.start();
    return { gain, source: src, lastAudibleAt: ctx.currentTime };
  }

  // Call every frame (or as often as convenient) with the listener's
  // position and every nearby person's id and position. Delegates the
  // falloff and the voice cap entirely to computeGains (sound.ts); this
  // method only turns the result into actual WebAudio nodes.
  updateAmbience(listener: { x: number; z: number }, sources: SoundSource[]): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const gains = computeGains(listener, sources, MAX_VOICES);
    const now = ctx.currentTime;
    for (const { id, gain } of gains) {
      let voice = this.voices.get(id);
      if (gain <= 0) {
        if (voice) voice.gain.gain.setTargetAtTime(0, now, 0.25);
        continue;
      }
      if (!voice) {
        voice = this.makeVoice(ctx);
        this.voices.set(id, voice);
      }
      voice.gain.gain.setTargetAtTime(gain * 0.05, now, 0.25); // murmur stays under the room tone and cues
      voice.lastAudibleAt = now;
    }
    this.sweepIdleVoices(now);
  }

  private sweepIdleVoices(now: number): void {
    for (const [id, voice] of this.voices) {
      if (now - voice.lastAudibleAt > VOICE_IDLE_MS / 1000) {
        try {
          voice.source.stop();
          voice.source.disconnect();
        } catch {
          /* already stopped */
        }
        this.voices.delete(id);
      }
    }
  }

  // --- one-shot cues: all short envelopes on an oscillator or the shared
  // noise buffer, never spatialised (the player is always the one who
  // triggers them, or they're ambient to everyone the same way) ---

  private ping(freq: number, durationMs: number, type: OscillatorType = "sine", peak = 0.12): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const end = now + durationMs / 1000;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(end + 0.02);
  }

  private click(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const src = this.noiseSource(ctx, false);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2000;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + 0.05);
  }

  // The entrance: two rising notes, like a shop door chime.
  playDoorChime(): void {
    this.ping(660, 180, "sine", 0.1);
    setTimeout(() => this.ping(880, 220, "sine", 0.09), 120);
  }

  // A single footstep: a short, soft noise thump, filtered low. Call this
  // when the local player's walked distance crosses a stride length
  // (Store.tsx owns the timing; this just plays one).
  playFootstep(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const src = this.noiseSource(ctx, false);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + 0.1);
  }

  // UI feedback: a soft click for menu/button taps.
  playUiClick(): void {
    this.click();
  }

  // Hook points for later features (issue #11 says these wire in once #2
  // payment and #7 unboxing land — not called from anywhere yet).
  playScanBeep(): void {
    this.ping(1200, 90, "square", 0.08);
  }
  playNfcChirp(): void {
    this.ping(1800, 50, "sine", 0.07);
    setTimeout(() => this.ping(2200, 50, "sine", 0.06), 60);
  }
}

export const sound = new SoundEngine();

// Unlock on the very first user gesture anywhere on the page, then stop
// listening — this satisfies the "muted until first click or tap" rule
// without gating every individual interaction on it.
let armed = false;
export function armAutoplayGate(): void {
  if (armed) return;
  armed = true;
  const go = () => {
    sound.unlock();
    window.removeEventListener("pointerdown", go);
    window.removeEventListener("keydown", go);
  };
  window.addEventListener("pointerdown", go, { once: true });
  window.addEventListener("keydown", go, { once: true });
}

// A soft click on every UI button tap (issue #11's "a soft click on UI
// taps"), wired once here rather than imported into every component that
// renders a <button> — new UI gets the cue for free.
let clicksWired = false;
export function wireUiClicks(): void {
  if (clicksWired) return;
  clicksWired = true;
  document.addEventListener(
    "click",
    (e) => {
      if ((e.target as HTMLElement | null)?.closest("button")) sound.playUiClick();
    },
    { capture: true },
  );
}
