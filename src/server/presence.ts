import { randomBytes, randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  SPAWN,
  type ClientMessage,
  type Identity,
  type Pose,
  type Present,
  type Role,
  type ServerMessage,
  type VisitorInfo,
} from "../shared/protocol.ts";
import { validateProfile, type Kind, type Specialty } from "../shared/profile.ts";
import type { LookChoice } from "../shared/look.ts";
import {
  chooseTurn,
  claim,
  customersView,
  dutyMessage,
  endInspect,
  engagements,
  enter,
  handOn,
  inspections,
  leaveStore,
  startInspect,
  startTalk,
  staffRespond,
  stateOf,
  type Ctx,
  type Employee,
  type Outgoing,
} from "./service.ts";
import { avoidPeople } from "../shared/people.ts";
import { clampToWalkable } from "../shared/world.ts";
import { db } from "./db.ts";

// Presence: who is in the store right now, where they stand and which role
// they are acting as. Held in memory on purpose. Positions change ten times a
// second and mean nothing after a restart, so only the visitor's identity and
// an event log are written to SQLite (see db.ts).

interface Session extends VisitorInfo, Pose {
  role: Role; // what they may walk through: customers stay on the floor
  kind: Kind; // who they chose to be (customer, or an employee kind)
  specialty?: Specialty;
  look?: LookChoice;
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

const identityOf = (s: Session): Identity => ({ kind: s.kind, specialty: s.specialty, look: s.look });

const present = (s: Session): Present => ({
  id: s.id,
  name: s.name,
  colour: s.colour,
  x: s.x,
  z: s.z,
  ry: s.ry,
  role: s.role,
  ...identityOf(s),
});

// The store service (service.ts) holds the rules and takes a database; this
// hands it who is online and where, and delivers what it returns.
function serviceCtx(): Ctx {
  const all = [...sessions.values()];
  const employees: Employee[] = all
    .filter((s) => s.kind !== "customer")
    .map((s) => ({ id: s.id, name: s.name, kind: s.kind as Employee["kind"], specialty: s.specialty }));
  return {
    db,
    now: Date.now(),
    employees,
    present: all.map((s) => s.id),
    position: (id) => {
      const s = sessions.get(id);
      return s ? { x: s.x, z: s.z } : undefined;
    },
  };
}

const staffViewFor = (ctx: Ctx): Outgoing[] => [{ to: "staff", message: { type: "staff_view", customers: customersView(ctx) } }];

function deliver(out: Outgoing[]): void {
  for (const o of out) {
    if (o.to === "all") {
      for (const s of sessions.values()) send(s.socket, o.message);
    } else if (o.to === "staff") {
      for (const s of sessions.values()) if (s.kind !== "customer") send(s.socket, o.message);
    } else {
      const s = sessions.get(o.to);
      if (s) send(s.socket, o.message);
    }
  }
}

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
      // their conversation ends, what they had put aside is given back, and
      // the posts and the customers employees see are updated
      deliver(leaveStore(serviceCtx(), me.id));
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
      // who they chose to be: validated, so nothing arbitrary reaches the
      // database or other visitors. Without a profile, a customer.
      const profile = validateProfile(message.profile);
      if (profile.name) visitor.name = profile.name;

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
      me = {
        ...visitor,
        ...SPAWN,
        x: spot.x,
        z: spot.z,
        role: profile.kind === "customer" ? "customer" : "staff",
        kind: profile.kind,
        specialty: profile.specialty,
        look: profile.look,
        socket,
        lastMoveAt: 0,
      };
      const others = [...sessions.values()].map(present);
      sessions.set(me.id, me);

      touchVisitor.run(Date.now(), me.id);
      logEvent(me.id, "join");
      const ctx = serviceCtx();
      enter(ctx, me.id, profile, profile.name);

      send(socket, {
        type: "welcome",
        you: visitor,
        token,
        others,
        serverTime: Date.now(),
        identity: identityOf(me),
        state: stateOf(db, me.id)?.state ?? null,
        offDuty: (dutyMessage(ctx).message as { offDuty: string[] }).offDuty,
        engaged: engagements(db),
        inspecting: inspections(db),
      });
      broadcast({ type: "joined", visitor: present(me) }, me.id);
      // someone has come in: the posts held, and the customers employees see
      deliver([dutyMessage(ctx)]);
      deliver(staffViewFor(ctx));
      return;
    }

    if (message.type === "bye") {
      leave();
      return;
    }

    // conversations and employees coordinating (service.ts)
    if (me && message.type === "talk_start" && typeof message.withId === "string") {
      deliver(startTalk(serviceCtx(), me.id, message.withId));
      return;
    }
    if (me && message.type === "talk_choose" && typeof message.conversationId === "string" && typeof message.choice === "string") {
      deliver(chooseTurn(serviceCtx(), me.id, message.conversationId, message.choice));
      return;
    }
    if (me && message.type === "staff_respond" && typeof message.conversationId === "string") {
      if (message.action === "reply" || message.action === "hand_to_genius" || message.action === "end") {
        deliver(staffRespond(serviceCtx(), me.id, message.conversationId, message.action));
      }
      return;
    }
    if (me && message.type === "claim" && typeof message.customerId === "string") {
      deliver(claim(serviceCtx(), me.id, message.customerId));
      return;
    }
    if (me && message.type === "hand_on" && typeof message.customerId === "string" && typeof message.to === "string") {
      deliver(handOn(serviceCtx(), me.id, message.customerId, message.to, typeof message.note === "string" ? message.note : undefined));
      return;
    }
    if (me && message.type === "inspect_start" && typeof message.slotId === "string") {
      deliver(startInspect(serviceCtx(), me.id, message.slotId));
      return;
    }
    if (me && message.type === "inspect_end") {
      deliver(endInspect(serviceCtx(), me.id, "stopped inspecting"));
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
