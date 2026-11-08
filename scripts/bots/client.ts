// A headless bot client over the real protocol (WebSocket + the hello/welcome
// handshake), built the same way spec/*-live.test.ts's `Visitor` class is,
// but reusable outside vitest: scripts/bots/*.ts scenarios import this
// instead of each reimplementing a socket wrapper.
//
// Not mocked: every bot opens a real `ws` connection to a running server
// (local dev, local Docker image, or -- only on the orchestrator's say-so,
// at low volume -- the live Fly URL) and speaks the same ClientMessage /
// ServerMessage protocol the browser client does (src/shared/protocol.ts).
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "../../src/shared/protocol.ts";
import type { Profile } from "../../src/shared/profile.ts";

export const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Latency injection (SKILL.md #3): wraps outgoing sends in an artificial
// delay so a scenario can be run "slow" without the server knowing the
// difference -- this is bot-side latency, not a server feature, so it never
// touches src/.
export interface LatencyMode {
  minMs: number;
  maxMs: number;
}

export const NO_LATENCY: LatencyMode = { minMs: 0, maxMs: 0 };
export const SLOW_CONNECTION: LatencyMode = { minMs: 100, maxMs: 400 };

function jitter(mode: LatencyMode): number {
  if (mode.maxMs <= 0) return 0;
  return mode.minMs + Math.random() * (mode.maxMs - mode.minMs);
}

export interface RttSample {
  label: string;
  ms: number;
}

// One bot's connection: join, send, and wait for a message matching a
// predicate (the same `next()` shape as the spec/*-live.test.ts Visitor
// classes this is built on, generalised into a shared module instead of
// being copy-pasted per scenario file).
export class BotClient {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  readonly label: string;
  readonly latency: LatencyMode;
  id = "";
  closed = false;
  private readonly rtts: RttSample[] = [];

  constructor(wsUrl: string | URL, label: string, latency: LatencyMode = NO_LATENCY) {
    this.label = label;
    this.latency = latency;
    this.socket = new WebSocket(wsUrl);
    this.socket.on("message", (raw) => {
      const m = JSON.parse(raw.toString()) as ServerMessage;
      this.messages.push(m);
      // like the real client: while an NPC is walking over to this bot, ask the server to catch up (it only notices an
      // arrival on a request, and a bot standing still sends none), until the chat opens
      if (m.type === "engaged" && m.visitorId === this.id && m.pending) this.startSettling();
      if (m.type === "turn") this.stopSettling();
    });
    this.socket.on("close", () => {
      this.closed = true;
      this.stopSettling();
    });
  }

  private settler: ReturnType<typeof setInterval> | null = null;
  private startSettling(): void {
    if (!this.settler) this.settler = setInterval(() => void this.send({ type: "settle" }), 500);
  }
  private stopSettling(): void {
    if (this.settler) clearInterval(this.settler);
    this.settler = null;
  }

  async waitOpen(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
  }

  // Sends with the configured artificial delay, so a "slow connection" run
  // mode changes nothing about the server, only how quickly this bot's own
  // messages leave it -- real latency injection, not a mocked protocol.
  async send(m: ClientMessage): Promise<void> {
    const delay = jitter(this.latency);
    if (delay > 0) await pause(delay);
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(m));
  }

  mark(): number {
    return this.messages.length;
  }

  async next(want: (m: ServerMessage) => boolean, ms = 8000, from = 0): Promise<ServerMessage> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = this.messages.slice(from).find(want);
      if (found) return found;
      await pause(20);
    }
    throw new Error(
      `[${this.label}] timed out waiting for a message after ${ms}ms (have: ${this.messages
        .map((m) => (m.type === "notice" ? `notice "${m.text}"` : m.type))
        .join(", ")})`,
    );
  }

  // Sends a message, times the round trip to the first new message the
  // predicate accepts, and records it for the report's p95. This is wall
  // time, so it includes whatever artificial latency this bot injected on
  // the way out -- a slow-connection run is expected to show a higher p95,
  // not a hidden one.
  async timed(label: string, send: () => Promise<void>, want: (m: ServerMessage) => boolean, ms = 8000): Promise<ServerMessage> {
    const from = this.mark();
    const start = Date.now();
    await send();
    const msg = await this.next(want, ms, from);
    this.rtts.push({ label, ms: Date.now() - start });
    return msg;
  }

  takeRtts(): RttSample[] {
    return this.rtts.splice(0);
  }

  async join(profile?: Profile): Promise<Extract<ServerMessage, { type: "welcome" }>> {
    await this.waitOpen();
    const start = Date.now();
    await this.send({ type: "hello", token: null, profile });
    const w = (await this.next((m) => m.type === "welcome")) as Extract<ServerMessage, { type: "welcome" }>;
    this.id = w.you.id;
    this.rtts.push({ label: "hello->welcome", ms: Date.now() - start });
    return w;
  }

  close(): void {
    if (!this.closed) this.socket.close();
  }
}

// Resolves ws:// vs wss:// from an http(s) base URL, the same conversion
// every spec/*-live.test.ts file does inline.
export function wsUrlFor(baseUrl: string): URL {
  const wsUrl = new URL("/ws", baseUrl);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  return wsUrl;
}

// Standard p95 over a flat array of millisecond samples (nearest-rank).
export function p95(samples: number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[idx]!;
}
