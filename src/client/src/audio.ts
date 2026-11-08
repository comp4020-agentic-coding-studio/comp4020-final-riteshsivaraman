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

// The background music is generated, like every other sound here: light, upbeat store music in a major key, the kind
// you stop noticing: a soft kick and clap, ticking hats, a bouncy bass, off-beat chord stabs and a sparkling arpeggio
// with an echo. There are five tracks (different keys, tempos, chords and grooves) that play in turn, in a shuffled
// order that never repeats the same one twice running, so it does not wear thin. No file: nothing to download.
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
interface Track {
  bpm: number;
  chords: Array<[root: number, kind: "maj" | "min"]>; // a bar each; the root is a MIDI note
  kick: Array<[step: number, level: number]>;
  clap: number[];
  bass: number[]; // sixteenths the bass plays on
  stab: number[];
  arp: number[]; // sixteenths the arpeggio plays on, cycling through `tones` (0 root, 1 third, 2 fifth, 3 octave)
  tones: number[];
}
const TRACKS: Track[] = [
  { bpm: 112, chords: [[48, "maj"], [55, "maj"], [57, "min"], [53, "maj"]], kick: [[0, 0.1], [8, 0.07]], clap: [4, 12], bass: [0, 6, 8, 14], stab: [2, 10], arp: [0, 3, 6, 8, 11, 14], tones: [0, 2, 1, 3, 2, 1] },
  { bpm: 120, chords: [[50, "maj"], [57, "maj"], [59, "min"], [55, "maj"]], kick: [[0, 0.09], [4, 0.06], [8, 0.08], [12, 0.06]], clap: [4, 12], bass: [0, 3, 6, 10, 14], stab: [2, 6, 10, 14], arp: [1, 3, 5, 7, 9, 11, 13, 15], tones: [0, 1, 2, 3, 2, 1, 2, 3] },
  { bpm: 104, chords: [[53, "maj"], [48, "maj"], [50, "min"], [58, "maj"]], kick: [[0, 0.1], [7, 0.06], [10, 0.07]], clap: [8], bass: [0, 7, 10, 12], stab: [3, 11], arp: [2, 4, 7, 10, 12, 15], tones: [1, 3, 2, 0, 2, 3] },
  { bpm: 116, chords: [[55, "maj"], [50, "maj"], [52, "min"], [48, "maj"]], kick: [[0, 0.09], [8, 0.07], [14, 0.04]], clap: [4, 12], bass: [0, 2, 8, 10, 14], stab: [2, 6, 10], arp: [0, 2, 4, 8, 10, 12], tones: [0, 1, 2, 1, 3, 2] },
  { bpm: 108, chords: [[52, "maj"], [47, "maj"], [49, "min"], [45, "maj"]], kick: [[0, 0.1], [6, 0.05], [8, 0.07]], clap: [4, 12], bass: [0, 4, 8, 12], stab: [2, 10, 11], arp: [3, 5, 8, 11, 13, 14], tones: [2, 3, 1, 2, 3, 0] },
];
const TRACK_REPEATS = 6; // each track runs its four chords this many times (about 50 s) before the next
const MUSIC_LEVEL = 1.0;
// how loud a talking person is at its loudest (right beside you), before the master volume
const CHATTER_LEVEL = 0.1;

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

// One person's distant chatter, in the manner of the Sims' Simlish and Animal Crossing's "Animalese": not real words
// but quick, high, cartoonish syllables, each with its own pitch (a wandering little melody, never a flat drone) and a
// vowel colour, many a second, in bursts with pauses between. Each syllable is a soft consonant tick then a short vowel:
// a bright pulse wave through two vowel filters, kept high and fast so it reads as a cheerful babble rather than
// robotic speech. A few at once, quiet and softened by distance.
const VOWELS: Array<[number, number]> = [
  [730, 1090], // ah
  [530, 1840], // eh
  [300, 2290], // ee
  [570, 840], // oh
  [660, 1720], // a
];
const MELODY = [-3, -1, 0, 2, 4, 7, 9]; // semitones a syllable's pitch can sit at: a pleasant set, never sour
interface Voice {
  gain: GainNode; // how loud they are from where the listener stands
  env: GainNode; // the vowels
  tick: GainNode; // the consonant ticks
  osc: OscillatorNode;
  noise: AudioBufferSourceNode;
  f1: BiquadFilterNode;
  f2: BiquadFilterNode;
  tickFilter: BiquadFilterNode;
  base: number; // this voice's pitch, Hz
  step: number; // where its melody is now (an index into MELODY)
  nextAt: number; // audio time the next syllable (or burst) is due
  talkUntil: number; // the end of the current burst
  lastAudibleAt: number;
}

// ---- rendering a music track (used by SoundEngine.pumpMusic) ----
interface MusicRig {
  ctx: BaseAudioContext;
  bus: AudioNode;
  delay: DelayNode;
  noise: AudioBuffer;
}

function noiseBufferFor(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function kick(r: MusicRig, at: number, peak: number): void {
  const osc = r.ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(130, at);
  osc.frequency.exponentialRampToValueAtTime(48, at + 0.12);
  const g = r.ctx.createGain();
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  osc.connect(g).connect(r.bus);
  osc.start(at);
  osc.stop(at + 0.25);
}

function noiseHit(r: MusicRig, at: number, type: BiquadFilterType, freq: number, peak: number, length: number): void {
  const src = r.ctx.createBufferSource();
  src.buffer = r.noise;
  const f = r.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = r.ctx.createGain();
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(f).connect(g).connect(r.bus);
  src.start(at, Math.random() * 1.5);
  src.stop(at + length + 0.02);
}

function tone(r: MusicRig, freq: number, at: number, type: OscillatorType, peak: number, length: number, cutoff: number, echo = false): void {
  const osc = r.ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const lp = r.ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoff;
  const g = r.ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(lp).connect(g);
  g.connect(r.bus);
  if (echo) g.connect(r.delay);
  osc.start(at);
  osc.stop(at + length + 0.03);
}

function playStep(r: MusicRig, t: Track, i: number, at: number): void {
  const [root, kind] = t.chords[Math.floor(i / 16) % t.chords.length]!;
  const third = kind === "maj" ? 4 : 3;
  const s = i % 16;
  const k = t.kick.find(([step]) => step === s);
  if (k) kick(r, at, k[1]);
  if (t.clap.includes(s)) noiseHit(r, at, "bandpass", 1600, 0.07, 0.14);
  if (s % 4 === 2) noiseHit(r, at, "highpass", 7500, 0.05, 0.04); // the off-beat tick
  else if (s % 2 === 0) noiseHit(r, at, "highpass", 7500, 0.02, 0.04);
  if (t.bass.includes(s)) tone(r, hz(root - 12), at, "triangle", 0.14, 0.28, 600);
  if (t.stab.includes(s)) for (const n of [root + 12, root + 12 + third, root + 19]) tone(r, hz(n), at, "triangle", 0.05, 0.3, 2200);
  const a = t.arp.indexOf(s);
  if (a >= 0) tone(r, hz(root + 24 + [0, third, 7, 12][t.tones[a % t.tones.length]!]!), at, "sine", 0.05, 0.4, 5000, true);
}

// One whole track (its four chords, repeated) as an audio buffer, plus how many seconds its body lasts (the buffer is
// a little longer, so the echo's tail rings out under the start of the next).
async function renderTrack(live: AudioContext, index: number): Promise<{ buffer: AudioBuffer; body: number }> {
  const t = TRACKS[index]!;
  const stepS = 60 / t.bpm / 4;
  const steps = TRACK_REPEATS * t.chords.length * 16;
  const body = steps * stepS;
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error("no OfflineAudioContext");
  const off = new Offline(1, Math.ceil((body + 2) * live.sampleRate), live.sampleRate);
  const bus = off.createGain();
  bus.connect(off.destination);
  // a soft echo so the arpeggio shimmers
  const delay = off.createDelay(1);
  delay.delayTime.value = (60 / t.bpm) * 0.75; // a dotted eighth
  const fb = off.createGain();
  fb.gain.value = 0.35;
  const wet = off.createGain();
  wet.gain.value = 0.45;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(bus);
  const rig: MusicRig = { ctx: off, bus, delay, noise: noiseBufferFor(off) };
  for (let i = 0; i < steps; i++) playStep(rig, t, i, i * stepS);
  return { buffer: await off.startRendering(), body };
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private listeners = new Set<() => void>();
  muted = readMuted();
  musicOn = !readFlag(MUSIC_OFF_KEY);
  chatterOn = !readFlag(CHATTER_OFF_KEY);
  unlocked = false;
  private musicBus: GainNode | null = null;
  private musicActive = false;
  private musicRendering = false;
  private musicEnds = 0; // audio time the music already queued runs out
  private musicSources = new Set<AudioBufferSourceNode>();
  private track = -1;
  private trackBag: number[] = [];

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
    this.ctx.onstatechange = () => {
      if (this.ctx && this.ctx.state === "running" && this.musicOn) this.startMusic();
      this.notify(); // the button says whether sound is actually running
    };
    // a watchdog: the browser can suspend the audio, and a busy page can starve the timer that queues the music, so
    // every couple of seconds it checks the audio is running and the music is queued, and puts either right
    this.watchdog = window.setInterval(() => this.tend(), 2000);
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

  // A browser can suspend the audio (a tab put in the background, a phone call, power saving); any later tap or key,
  // or coming back to the tab, starts it again.
  resume(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
    if (this.musicOn && !this.musicActive) this.startMusic();
  }

  // true when no sound can be heard yet: nothing has been tapped on this page load (a reload starts silent: the browser
  // only lets audio start after a tap or key), or the browser has paused it
  get needsTap(): boolean {
    return !this.unlocked || (this.ctx !== null && this.ctx.state !== "running");
  }
  private watchdog: number | null = null;
  private tend(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== "running") {
      void ctx.resume().catch(() => undefined);
      return;
    }
    if (this.musicOn && !this.muted) {
      if (!this.musicActive) this.startMusic();
      else this.pumpMusic();
    }
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
  //
  // Each track is rendered once, ahead of time, into an audio buffer (an OfflineAudioContext runs faster than real time
  // and off the page's thread), and the buffers are simply queued one after another on the audio clock. Playing a
  // buffer needs nothing from the page while it runs, so a busy page, a throttled tab or a slow machine cannot starve
  // it the way a timer that queues notes one by one can.
  private startMusic(): void {
    if (!this.ctx || !this.master || this.musicActive) return;
    const ctx = this.ctx;
    if (!this.musicBus) {
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
    }
    this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 1.2); // fades in
    this.musicActive = true;
    this.musicEnds = 0;
    this.pumpMusic();
  }

  private stopMusic(): void {
    this.musicActive = false;
    if (!this.ctx || !this.musicBus) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setTargetAtTime(0, now, 0.3); // fades out
    for (const src of this.musicSources) {
      try {
        src.stop(now + 1.5);
      } catch {
        /* already stopped */
      }
    }
    this.musicSources.clear();
    this.musicEnds = 0;
  }

  // Keeps about twenty seconds or more of music queued: renders the next track when it is needed and queues it to
  // start exactly where the last one ends. Called when music starts, whenever a track has been queued, and by the watchdog.
  private pumpMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.musicActive || this.musicRendering) return;
    if (this.musicEnds > ctx.currentTime + 20) return;
    this.musicRendering = true;
    this.track = this.nextTrack(this.track);
    renderTrack(ctx, this.track)
      .then(({ buffer, body }) => {
        this.musicRendering = false;
        if (!this.ctx || !this.musicBus || !this.musicActive) return;
        const at = Math.max(this.musicEnds, this.ctx.currentTime + 0.05);
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.musicBus);
        src.onended = () => this.musicSources.delete(src);
        src.start(at);
        this.musicSources.add(src);
        this.musicEnds = at + body;
        this.pumpMusic();
      })
      .catch((e) => {
        this.musicRendering = false;
        console.warn("could not render a music track, will retry", e);
      });
  }

  // The next track in a shuffled order: every track once, then reshuffled, never the same one twice in a row.
  private nextTrack(current: number): number {
    if (this.trackBag.length === 0) {
      const bag = TRACKS.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      if (bag[bag.length - 1] === current) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[0]!];
      this.trackBag = bag;
    }
    return this.trackBag.pop()!;
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

  // Someone is talking to you: a burst of their cartoon babble, as long as their line takes to say (nobody else in the
  // store makes a sound: always-on chatter from the crowd was irritating). Off with the Chatter switch.
  private talker: Voice | null = null;
  speak(chars: number): void {
    if (!this.ctx || !this.master || !this.chatterOn || this.muted || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const v = this.talker ?? (this.talker = this.makeVoice("talker", now));
    const seconds = Math.min(6, Math.max(1, chars * 0.04));
    // a new line cuts off whatever was still being said
    v.env.gain.cancelScheduledValues(now);
    v.tick.gain.cancelScheduledValues(now);
    v.osc.frequency.cancelScheduledValues(now);
    v.env.gain.setValueAtTime(0, now);
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(CHATTER_LEVEL, now, 0.05);
    let t = now + 0.05;
    while (t < now + seconds) t = this.syllable(v, t);
    v.gain.gain.setTargetAtTime(0, now + seconds, 0.08);
  }

  private makeVoice(id: string, now: number): Voice {
    const ctx = this.ctx!;
    const base = 300 + Math.random() * 170; // a high, cartoonish voice; each person a little different
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = base;
    const env = ctx.createGain();
    env.gain.value = 0;
    // two wide vowel filters (wide, so it is soft and cartoonish rather than a pinched, robotic buzz)
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.Q.value = 3.5;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.Q.value = 4;
    const f2Level = ctx.createGain();
    f2Level.gain.value = 0.45;
    osc.connect(f1).connect(env);
    osc.connect(f2).connect(f2Level).connect(env);
    // the soft consonant tick at the front of a syllable
    const noise = this.noiseSource(ctx, true);
    const tickFilter = ctx.createBiquadFilter();
    tickFilter.type = "bandpass";
    tickFilter.frequency.value = 3000;
    tickFilter.Q.value = 1.2;
    const tick = ctx.createGain();
    tick.gain.value = 0;
    noise.connect(tickFilter).connect(tick);
    // softened, as if across the room
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 3800;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    env.connect(soften);
    tick.connect(soften);
    soften.connect(gain).connect(this.master!);
    osc.start(now);
    noise.start(now, Math.random() * 1.5);
    const first = now + Math.random() * 4;
    const voice: Voice = { gain, env, tick, osc, noise, f1, f2, tickFilter, base, step: 2 + Math.floor(Math.random() * 3), nextAt: first, talkUntil: first + 0.8 + Math.random() * 1.2, lastAudibleAt: now };
    return voice;
  }

  // One syllable at time t: a consonant tick and a short vowel at a pitch that wanders a step or two from the last
  // (a little tune). Returns when the next one starts.
  private syllable(v: Voice, t: number): number {
    const dur = 0.07 + Math.random() * 0.05;
    // the pitch wanders: mostly a step or two from the last syllable, now and then a leap
    v.step = Math.min(MELODY.length - 1, Math.max(0, v.step + (Math.random() < 0.2 ? Math.floor(Math.random() * 5) - 2 : Math.floor(Math.random() * 3) - 1)));
    const pitch = v.base * 2 ** (MELODY[v.step]! / 12);
    const vowel = VOWELS[Math.floor(Math.random() * VOWELS.length)]!;
    v.f1.frequency.setValueAtTime(vowel[0] * 1.1, t);
    v.f2.frequency.setValueAtTime(vowel[1] * 1.1, t);
    v.osc.frequency.setValueAtTime(pitch * 0.97, t);
    v.osc.frequency.linearRampToValueAtTime(pitch * (1 + (Math.random() - 0.4) * 0.06), t + dur);
    // the consonant: a tiny soft tick on most syllables
    if (Math.random() < 0.7) {
      v.tickFilter.frequency.setValueAtTime(1800 + Math.random() * 3200, t);
      v.tick.gain.setValueAtTime(0, t);
      v.tick.gain.linearRampToValueAtTime(0.18, t + 0.004);
      v.tick.gain.linearRampToValueAtTime(0, t + 0.022);
    }
    // the vowel just after it
    v.env.gain.setValueAtTime(0, t + 0.008);
    v.env.gain.linearRampToValueAtTime(0.6 + Math.random() * 0.4, t + 0.03);
    v.env.gain.linearRampToValueAtTime(0, t + dur);
    // a short breath between words now and then, so it phrases like talk
    return t + dur + 0.015 + Math.random() * 0.04 + (Math.random() < 0.12 ? 0.12 : 0);
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
  // and from then on, any tap or key (and coming back to the tab) wakes the audio if the browser put it to sleep
  const wake = () => sound.resume();
  window.addEventListener("pointerdown", wake, { capture: true });
  window.addEventListener("keydown", wake, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wake();
  });
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
