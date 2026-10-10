import { randomBytes, randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  SPAWN,
  type ClientMessage,
  type Pose,
  type Present,
  type Role,
  type ServerMessage,
  type VisitorInfo,
} from "../shared/protocol.ts";
import { avoidPeople } from "../shared/people.ts";
import { clampToWalkable } from "../shared/world.ts";
import { db } from "./db.ts";

// Presence: who is in the store right now, where they stand and which role
// they are acting as. Held in memory on purpose. Positions change ten times a
// second and mean nothing after a restart, so only the visitor's identity and
// an event log are written to SQLite (see db.ts).

interface Session extends VisitorInfo, Pose {
  role: Role;
  socket: WebSocket;
  lastMoveAt: number;
}

const sessions = new Map<string, Session>(); // visitor id -> live session

const otherVisitors = (id: string): Array<{ x: number; z: number }> =>
  [...sessions.values()].filter((s) => s.id !== id).map((s) => ({ x: s.x, z: s.z }));

// Dev only: a visitor may switch themselves between customer and staff. The
// server trusts the claim, so this has to be turned off (or backed by real
// accounts) before the store is meant for strangers.
const DEV_ROLE_SWITCH = process.env.DEV_ROLE_SWITCH !== "0";

const ADJECTIVES = ["Mellow", "Brisk", "Dusty", "Plucky", "Sleepy", "Jolly", "Nimble", "Quiet"];
const NOUNS = ["Pebble", "Biscuit", "Thistle", "Pickle", "Marlin", "Wombat", "Kettle", "Sprout"];
const COLOURS = ["#e07a5f", "#3d85c6", "#81b29a", "#f2cc8f", "#9b72aa", "#6d9dc5", "#d4a373", "#7a9e7e"];

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const findByToken = db.prepare("SELECT id, name, colour FROM visitors WHERE token = ?");
const insertVisitor = db.prepare(
  "INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
);
const touchVisitor = db.prepare("UPDATE visitors SET last_seen = ? WHERE id = ?");
const insertEvent = db.prepare("INSERT INTO events (ts, visitor_id, type, data) VALUES (?, ?, ?, ?)");

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(message: ServerMessage, exceptId: string): void {
  for (const [id, session] of sessions) {
    if (id !== exceptId) send(session.socket, message);
  }
}

function logEvent(visitorId: string, type: string, data?: unknown): void {
  insertEvent.run(Date.now(), visitorId, type, data === undefined ? null : JSON.stringify(data));
}

const present = (s: Session): Present => ({
  id: s.id,
  name: s.name,
  colour: s.colour,
  x: s.x,
  z: s.z,
  ry: s.ry,
  role: s.role,
});

// A visitor is whoever holds the token. No account, no personal data: the
// token is a random string the browser keeps and sends back on reconnect.
function resolveVisitor(token: string | null): { visitor: VisitorInfo; token: string } {
  if (token) {
    const row = findByToken.get(token) as VisitorInfo | undefined;
    if (row) return { visitor: row, token };
  }
  const visitor: VisitorInfo = {
    id: randomUUID(),
    name: `${pick(ADJECTIVES)} ${pick(NOUNS)}`,
    colour: pick(COLOURS),
  };
  const fresh = randomBytes(24).toString("base64url");
  const now = Date.now();
  insertVisitor.run(visitor.id, fresh, visitor.name, visitor.colour, now, now);
  return { visitor, token: fresh };
}

export function handleConnection(socket: WebSocket): void {
  let me: Session | null = null;

  // Idempotent: both an explicit "bye" and the socket closing land here, and
  // a takeover may already have replaced this session.
  const leave = (): void => {
    if (me && sessions.get(me.id)?.socket === socket) {
      sessions.delete(me.id);
      touchVisitor.run(Date.now(), me.id);
      logEvent(me.id, "leave");
      broadcast({ type: "left", id: me.id }, me.id);
    }
  };

  socket.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }

    if (message.type === "hello" && !me) {
      const { visitor, token } = resolveVisitor(
        typeof message.token === "string" ? message.token : null,
      );

      // One live session per visitor: a second tab with the same token takes
      // over, and the older socket is closed so the client can say so.
      const existing = sessions.get(visitor.id);
      if (existing) {
        sessions.delete(visitor.id);
        broadcast({ type: "left", id: visitor.id }, visitor.id);
        existing.socket.close(4000, "opened elsewhere");
      }

      // appear at the spawn point, or beside whoever is standing on it
      const spot = avoidPeople(SPAWN.x, SPAWN.z, otherVisitors(visitor.id), Date.now());
      me = { ...visitor, ...SPAWN, x: spot.x, z: spot.z, role: "customer", socket, lastMoveAt: 0 };
      const others = [...sessions.values()].map(present);
      sessions.set(me.id, me);

      touchVisitor.run(Date.now(), me.id);
      logEvent(me.id, "join");

      send(socket, { type: "welcome", you: visitor, token, others, serverTime: Date.now() });
      broadcast({ type: "joined", visitor: present(me) }, me.id);
      return;
    }

    if (message.type === "bye") {
      leave();
      return;
    }

    if (message.type === "role" && me && DEV_ROLE_SWITCH) {
      if (message.role !== "customer" && message.role !== "staff") return;
      if (message.role === me.role) return;
      me.role = message.role;
      logEvent(me.id, "role", { role: me.role });
      // a customer cannot stay where only staff may stand
      const p = clampToWalkable(me.role, me.x, me.z);
      me.x = p.x;
      me.z = p.z;
      broadcast({ type: "role", id: me.id, role: me.role }, me.id);
      broadcast({ type: "moved", id: me.id, x: me.x, z: me.z, ry: me.ry }, me.id);
      return;
    }

    if (message.type === "move" && me) {
      const now = Date.now();
      if (now - me.lastMoveAt < 40) return; // at most 25 updates a second
      if (![message.x, message.z, message.ry].every(Number.isFinite)) return;
      me.lastMoveAt = now;
      let p = clampToWalkable(me.role, message.x, message.z);
      // people are solid: not through another visitor, staff or customer
      p = avoidPeople(p.x, p.z, otherVisitors(me.id), now);
      p = clampToWalkable(me.role, p.x, p.z);
      me.x = p.x;
      me.z = p.z;
      me.ry = message.ry;
      broadcast({ type: "moved", id: me.id, x: me.x, z: me.z, ry: me.ry }, me.id);
    }
  });

  socket.on("close", leave);
}
