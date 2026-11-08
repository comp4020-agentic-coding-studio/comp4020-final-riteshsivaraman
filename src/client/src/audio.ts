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
// music and chatter each have their own switch (on unless the visitor turned them off)
const MUSIC_OFF_KEY = "sound-music-off";
const CHATTER_OFF_KEY = "sound-chatter-off";
const readFlag = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const writeFlag = (key: string, on: boolean): void => {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* the choice just won't survive a reload */
  }
};

// The background music is generated, like every other sound here: a slow loop of four warm chords
// (a soft pad of detuned triangle waves through a low-pass filter) with a sparse pentatonic melody
// plinking over it and an echo, so it never repeats exactly and never needs a file. Chords are Hz.
const CHORDS: number[][] = [
  [130.81, 196.0, 246.94, 329.63], // C major 7
  [110.0, 164.81, 196.0, 261.63], // A minor 7
  [87.31, 174.61, 220.0, 329.63], // F major 7
  [98.0, 196.0, 246.94, 293.66], // G6
];
const CHORD_SECONDS = 8;
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C major pentatonic
const MUSIC_LEVEL = 0.9;
// how loud a talking person is at its loudest (right beside you), before the master volume
const CHATTER_LEVEL = 0.2;
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

// One person's distant talk: breath noise through two band-pass "vowel" filters, shaped into syllables in
// phrases with silences between, so the room has people talking in it rather than a constant hiss.
interface Voice {
  gain: GainNode; // how loud they are from where the listener stands
  env: GainNode; // the syllables
  f1: BiquadFilterNode;
  f2: BiquadFilterNode;
  source: AudioBufferSourceNode;
  base1: number;
  base2: number;
  nextAt: number; // audio time the next syllable (or phrase) is due
  talkUntil: number; // the end of the current phrase
  lastAudibleAt: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private voices = new Map<string, Voice>();
  private listeners = new Set<() => void>();
  muted = readMuted();
  musicOn = !readFlag(MUSIC_OFF_KEY);
  chatterOn = !readFlag(CHATTER_OFF_KEY);
  unlocked = false;
  private musicBus: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextChordAt = 0;
  private nextNoteAt = 0;
  private chordIndex = 0;

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
    // Background sound: cut on 2026-11-07 (a constant murmur read as a net negative), brought back on
    // 2026-11-09 ("the store feels eerily silent") as two things with their own switches: music, and
    // chatter that is speech-like and bursty with real silences, not a hum.
    if (this.musicOn) this.startMusic();
    this.notify();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    writeFlag(MUSIC_OFF_KEY, !on);
    if (on) this.startMusic();
    else this.stopMusic();
    this.notify();
  }
  setChatter(on: boolean): void {
    this.chatterOn = on;
    writeFlag(CHATTER_OFF_KEY, !on);
    this.notify();
  }

  // ---- music ----
  private startMusic(): void {
    if (!this.ctx || !this.master || this.musicTimer !== null) return;
    const ctx = this.ctx;
    if (!this.musicBus) {
      const bus = ctx.createGain();
      bus.gain.value = 0;
      // a soft echo so the plinks shimmer
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.375;
      const fb = ctx.createGain();
      fb.gain.value = 0.35;
      const wet = ctx.createGain();
      wet.gain.value = 0.45;
      delay.connect(fb).connect(delay);
      delay.connect(wet).connect(bus);
      this.musicDelay = delay;
      bus.connect(this.master);
      this.musicBus = bus;
    }
    this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 1.5); // fades in
    this.nextChordAt = ctx.currentTime + 0.2;
    this.nextNoteAt = ctx.currentTime + 3;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 500);
    this.scheduleMusic();
  }
  private musicDelay: DelayNode | null = null;

  private stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); // fades out; notes already queued die quietly
    }
  }

  // Looks a little ahead and queues whatever chords and notes fall inside it.
  private scheduleMusic(): void {
    if (!this.ctx || !this.musicBus) return;
    const horizon = this.ctx.currentTime + 1.5;
    while (this.nextChordAt < horizon) {
      this.playChord(CHORDS[this.chordIndex % CHORDS.length]!, this.nextChordAt);
      this.chordIndex++;
      this.nextChordAt += CHORD_SECONDS;
    }
    while (this.nextNoteAt < horizon) {
      this.playPluck(PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]!, this.nextNoteAt);
      this.nextNoteAt += 1.4 + Math.random() * 3.2;
    }
  }

  private playChord(freqs: number[], at: number): void {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const end = at + CHORD_SECONDS;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.02, at + 2.5);
    env.gain.setValueAtTime(0.02, end - 0.5);
    env.gain.linearRampToValueAtTime(0, end + 2.5); // overlaps the next chord, so it flows
    lp.connect(env).connect(this.musicBus);
    for (const f of freqs) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = f;
        osc.detune.value = detune;
        osc.connect(lp);
        osc.start(at);
        osc.stop(end + 2.6);
      }
    }
  }

  private playPluck(freq: number, at: number): void {
    if (!this.ctx || !this.musicBus || !this.musicDelay) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.045, at + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
    osc.connect(env);
    env.connect(this.musicBus);
    env.connect(this.musicDelay);
    osc.start(at);
    osc.stop(at + 2.3);
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

  // Room tone and the per-person murmur voice were cut after feel-check
  // (Ritesh, 2026-11-07): background noise read as a net negative, even
  // though the one-shot cues read fine. See the comment on unlock() and
  // updateAmbience() for what replaced them.

  // Call every few frames with the listener's position and every nearby person's id and position.
  // computeGains (sound.ts, pure and spec-covered) decides who is audible and how loud, nearest first and
  // capped; this turns the result into a few voices that talk in bursts.
  updateAmbience(listener: { x: number; z: number }, sources: SoundSource[]): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const gains = computeGains(listener, sources, MAX_VOICES);
    const audible = new Set<string>();
    if (this.chatterOn) {
      for (const g of gains) {
        if (g.gain < 0.01) continue;
        audible.add(g.id);
        const v = this.voices.get(g.id) ?? this.makeVoice(g.id, now);
        v.gain.gain.setTargetAtTime(g.gain * CHATTER_LEVEL, now, 0.2);
        v.lastAudibleAt = now;
        this.talk(v, now);
      }
    }
    for (const [id, voice] of this.voices) if (!audible.has(id)) voice.gain.gain.setTargetAtTime(0, now, 0.25);
    this.sweepIdleVoices(now);
  }

  private makeVoice(id: string, now: number): Voice {
    const ctx = this.ctx!;
    const source = this.noiseSource(ctx, true);
    // a different voice each: a different pitch of "vowel" sound
    const base1 = 380 + Math.random() * 320;
    const base2 = 1100 + Math.random() * 1100;
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = base1;
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = base2;
    f2.Q.value = 6;
    const env = ctx.createGain();
    env.gain.value = 0;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(f1).connect(env);
    source.connect(f2).connect(env);
    env.connect(gain).connect(this.master!);
    source.start(now, Math.random() * 1.5);
    const first = now + Math.random() * 4;
    const voice: Voice = { gain, env, f1, f2, source, base1, base2, nextAt: first, talkUntil: first + 1.5 + Math.random() * 3, lastAudibleAt: now };
    this.voices.set(id, voice);
    return voice;
  }

  // Queues a voice's syllables a little ahead: a phrase of short rises and falls, then a silence.
  private talk(v: Voice, now: number): void {
    while (v.nextAt < now + 1.2) {
      if (v.nextAt >= v.talkUntil) {
        v.nextAt = Math.max(v.nextAt, v.talkUntil) + 2 + Math.random() * 7; // quiet, then another phrase
        v.talkUntil = v.nextAt + 1.5 + Math.random() * 3.5;
        continue;
      }
      const t = Math.max(v.nextAt, now);
      const dur = 0.09 + Math.random() * 0.14;
      v.f1.frequency.setValueAtTime(v.base1 * (0.8 + Math.random() * 0.5), t);
      v.f2.frequency.setValueAtTime(v.base2 * (0.8 + Math.random() * 0.5), t);
      v.env.gain.setValueAtTime(0, t);
      v.env.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, t + dur * 0.35);
      v.env.gain.linearRampToValueAtTime(0, t + dur);
      v.nextAt = t + dur + 0.03 + Math.random() * 0.1;
    }
  }

  private sweepIdleVoices(now: number): void {
    for (const [id, voice] of this.voices) {
      if (now - voice.lastAudibleAt > VOICE_IDLE_MS / 1000) {
        try {
          voice.source.stop();
          voice.source.disconnect();
          voice.gain.disconnect();
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
