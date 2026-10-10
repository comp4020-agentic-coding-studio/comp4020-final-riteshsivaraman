import { useSyncExternalStore } from "react";
import type { ClientMessage, Present, Role, ServerMessage, VisitorInfo } from "../../shared/protocol.ts";

export type Status = "connecting" | "open" | "closed" | "replaced";

// A remote visitor: where the server last said they were (tx/tz/try) and where
// we are drawing them (x/z/ry), eased towards it each frame.
export interface Remote {
  info: VisitorInfo;
  role: Role;
  x: number;
  z: number;
  ry: number;
  tx: number;
  tz: number;
  try: number;
}

const TOKEN_KEY = "visitor-token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // private window or blocked storage: a fresh identity each load
  }
}

function writeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* identity just won't survive a reload */
  }
}

// Plain store, not React state: positions change many times a second, so the
// scene reads `remotes` directly in its frame loop and React only re-renders
// when the roster or connection status changes.
class Net {
  status: Status = "connecting";
  you: VisitorInfo | null = null;
  // Dev: which role this visitor is acting as. Kept across reconnects.
  // (`?role=staff` starts as staff, for checks.)
  role: Role = new URLSearchParams(location.search).get("role") === "staff" ? "staff" : "customer";
  // our own position, written by the player loop, read by door and NPC code
  me = { x: 0, z: 0 };
  remotes = new Map<string, Remote>();
  private socket: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private retry = 0;
  // server clock minus ours, set on welcome; NPCs are drawn at server time
  private clockOffset = 0;

  serverNow = (): number => Date.now() + this.clockOffset;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private changed(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  connect(): void {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${location.host}/ws`);
    this.socket = socket;
    this.status = "connecting";
    this.changed();

    socket.onopen = () => {
      this.retry = 0;
      this.send({ type: "hello", token: readToken() });
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "welcome") {
        writeToken(message.token);
        this.clockOffset = message.serverTime - Date.now();
        this.you = message.you;
        this.remotes.clear();
        for (const o of message.others) this.addRemote(o);
        this.status = "open";
        if (this.role !== "customer") this.send({ type: "role", role: this.role });
      } else if (message.type === "joined") {
        this.addRemote(message.visitor);
      } else if (message.type === "moved") {
        const r = this.remotes.get(message.id);
        if (r) {
          r.tx = message.x;
          r.tz = message.z;
          r.try = message.ry;
        }
        return; // pose only: no re-render needed
      } else if (message.type === "role") {
        const r = this.remotes.get(message.id);
        if (r) r.role = message.role;
      } else if (message.type === "left") {
        this.remotes.delete(message.id);
      }
      this.changed();
    };

    socket.onclose = (event) => {
      this.remotes.clear();
      if (event.code === 4000) {
        this.status = "replaced"; // opened in another tab: do not fight for it
        this.changed();
        return;
      }
      this.status = "closed";
      this.changed();
      // Back off 1s, 2s, 4s ... up to 10s. The machine may be waking up.
      const wait = Math.min(10_000, 1000 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
  }

  private addRemote(v: Present): void {
    const { x, z, ry, role, ...info } = v;
    this.remotes.set(info.id, { info, role, x, z, ry, tx: x, tz: z, try: ry });
  }

  // Dev switch between customer and staff.
  setRole(role: Role): void {
    this.role = role;
    this.send({ type: "role", role });
    this.changed();
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}

export const net = new Net();

// Tell the server we are going before the connection drops, so others see us
// leave at once (see ClientMessage "bye").
window.addEventListener("pagehide", () => net.send({ type: "bye" }));

// Re-renders the calling component when status or the roster changes.
export function useNet(): Net {
  useSyncExternalStore(net.subscribe, net.getVersion);
  return net;
}
