import { useSyncExternalStore } from "react";
import type { PlayerStateName } from "../../shared/conversation.ts";
import { engagedMoment, type Release } from "../../shared/engage.ts";
import type { Profile } from "../../shared/profile.ts";
import type {
  ClientMessage,
  CustomerView,
  Engagement,
  Identity,
  Inspection,
  IntentView,
  Present,
  Role,
  ServerMessage,
  StaffTurnView,
  TurnView,
  VisitorInfo,
} from "../../shared/protocol.ts";

export type Status = "connecting" | "open" | "closed" | "replaced";

// A remote visitor: where the server last said they were (tx/tz/try) and where
// we are drawing them (x/z/ry), eased towards it each frame.
export interface Remote {
  info: VisitorInfo;
  role: Role;
  identity: Identity;
  x: number;
  z: number;
  ry: number;
  tx: number;
  tz: number;
  try: number;
}

const TOKEN_KEY = "visitor-token";
const PROFILE_KEY = "visitor-profile";

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

export function readProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function writeProfile(p: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* the entry screen just starts blank next time */
  }
}

// Plain store, not React state: positions change many times a second, so the
// scene reads `remotes` directly in its frame loop and React only re-renders
// when the roster, the connection or a conversation changes.
class Net {
  status: Status = "connecting";
  you: VisitorInfo | null = null;
  // who you chose to be (validated by the server), and where you are in your visit
  profile: Profile | null = null;
  identity: Identity = { kind: "customer" };
  state: PlayerStateName | null = null;
  want: string | null = null;
  needs: string | null = null;
  stateSince = 0; // local time the state changed, for "waiting 0:42"
  // Dev: which role this visitor is acting as, for walking (`?dev=1`).
  role: Role = "customer";
  // our own position, written by the player loop, read by door and NPC code
  me = { x: 0, z: 0 };
  remotes = new Map<string, Remote>();
  // NPCs: who is off duty because a person holds their post; who is with a
  // visitor (and since when, and where they stood); who has just been let go
  offDuty = new Set<string>();
  engaged = new Map<string, Engagement>();
  released = new Map<string, Release>();
  // the conversation you are in, the replies waiting on you if you are an
  // employee, and the customers you can see
  turn: TurnView | null = null;
  staffTurns = new Map<string, StaffTurnView>();
  customers: CustomerView[] = [];
  notice: { text: string; at: number } | null = null;
  // who is close enough to talk to, set by the scene
  hint: { id: string; name: string; intentId?: string } | null = null;
  // intent to talk (server-authoritative): who has shown intent to whom
  intents = new Map<string, IntentView>();
  // told to wait somewhere for someone to fetch you, if you are
  get waitingAt(): { x: number; z: number; label: string; who: string; reason: string } | null {
    for (const i of this.intents.values()) if (i.state === "held" && i.toId === this.you?.id && i.wait) return { ...i.wait, who: i.fromName, reason: i.reason };
    return null;
  }
  // a member of staff is walking you somewhere (to a demo device, to the till)
  escort: { id: string; kind: "demo" | "till"; npcId: string; npcName: string; text: string; goal: { x: number; z: number } } | null = null;
  // the conversation as the scene should treat it: while you are being walked
  // somewhere it is on hold, so you can move and the camera is free
  get talking(): TurnView | null {
    return this.escort ? null : this.turn;
  }
  private intentPoller: ReturnType<typeof setInterval> | null = null;
  // devices being inspected right now, by slot id (D39) — server-authoritative,
  // so another visitor sees the same thing live, including one who joins mid-look
  inspections = new Map<string, Inspection>();
  // the slot id you yourself are inspecting, or null
  myInspectSlot: string | null = null;
  // the nearest free, in-range device, set by the scene
  deviceHint: { slotId: string; name: string } | null = null;

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

  changed(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // The entry screen's "enter": remember the choice and join the store.
  enter(profile: Profile): void {
    this.profile = profile;
    writeProfile(profile);
    this.role = profile.kind === "customer" ? "customer" : "staff";
    this.connect();
  }

  get isEmployee(): boolean {
    return this.identity.kind !== "customer";
  }

  connect(): void {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${location.host}/ws`);
    this.socket = socket;
    this.status = "connecting";
    this.changed();

    socket.onopen = () => {
      this.retry = 0;
      this.send({ type: "hello", token: readToken(), profile: this.profile ?? undefined });
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (this.handle(message)) this.changed();
    };

    socket.onclose = (event) => {
      this.remotes.clear();
      this.turn = null;
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

  // Applies a server message. Returns true when something a component shows
  // has changed (pose updates do not, so they cost no render).
  private handle(message: ServerMessage): boolean {
    switch (message.type) {
      case "welcome": {
        writeToken(message.token);
        this.clockOffset = message.serverTime - Date.now();
        this.you = message.you;
        this.identity = message.identity;
        this.setState(message.state, null, null);
        this.offDuty = new Set(message.offDuty);
        this.engaged = new Map(message.engaged.map((e) => [e.npcId, e]));
        this.released.clear();
        this.inspections = new Map(message.inspecting.map((i) => [i.slotId, i]));
        this.intents = new Map(message.intents.map((i) => [i.id, i]));
        this.pollIntents();
        this.myInspectSlot = message.inspecting.find((i) => i.visitorId === message.you.id)?.slotId ?? null;
        this.remotes.clear();
        for (const o of message.others) this.addRemote(o);
        this.status = "open";
        return true;
      }
      case "joined":
        this.addRemote(message.visitor);
        return true;
      case "moved": {
        const r = this.remotes.get(message.id);
        if (r) {
          r.tx = message.x;
          r.tz = message.z;
          r.try = message.ry;
        }
        return false; // pose only: no re-render needed
      }
      case "role": {
        const r = this.remotes.get(message.id);
        if (r) r.role = message.role;
        return true;
      }
      case "left":
        this.remotes.delete(message.id);
        return true;
      case "state":
        this.setState(message.state, message.want, message.needs);
        return true;
      case "turn":
        this.turn = message;
        return true;
      case "staff_turn":
        this.staffTurns.set(message.conversationId, message);
        return true;
      case "staff_view":
        this.customers = message.customers;
        // an employee's pending replies for customers who are gone are dropped
        return true;
      case "duty":
        this.offDuty = new Set(message.offDuty);
        return true;
      case "engaged":
        this.engaged.set(message.npcId, message);
        this.released.delete(message.npcId);
        return true;
      case "intent": {
        const { type: _t, ...view } = message;
        this.intents.set(view.id, view);
        this.pollIntents();
        return true;
      }
      case "escort": {
        const { type: _t, ...e } = message;
        this.escort = e;
        this.pollIntents();
        return true;
      }
      case "escort_end":
        if (this.escort?.id === message.id) this.escort = null;
        this.pollIntents();
        return true;
      case "intent_end":
        this.intents.delete(message.id);
        this.pollIntents();
        return true;
      case "released": {
        const e = this.engaged.get(message.npcId);
        if (e) {
          // where it stands now, so it can walk back from there
          const now = this.serverNow();
          const m = engagedMoment(message.npcId, e, now);
          this.released.set(message.npcId, { at: now, from: { x: m.x, z: m.z } });
          this.engaged.delete(message.npcId);
        }
        return true;
      }
      case "notice":
        this.notice = { text: message.text, at: Date.now() };
        return true;
      case "inspecting":
        this.inspections.set(message.slotId, message);
        if (message.visitorId === this.you?.id) this.myInspectSlot = message.slotId;
        return true;
      case "inspect_ended":
        this.inspections.delete(message.slotId);
        if (this.myInspectSlot === message.slotId) this.myInspectSlot = null;
        return true;
    }
  }

  private setState(state: PlayerStateName | null, want: string | null, needs: string | null): void {
    if (state !== this.state) this.stateSince = Date.now();
    this.state = state;
    this.want = want;
    this.needs = needs;
  }

  private addRemote(v: Present): void {
    const { x, z, ry, role, kind, specialty, look, ...info } = v;
    this.remotes.set(info.id, { info, role, identity: { kind, specialty, look }, x, z, ry, tx: x, tz: z, try: ry });
  }

  // ---- what the visitor does ----

  // the server decides when a beat has passed or someone gave up, but it has
  // no timer: while an intent involving you is open, ask it to catch up
  private pollIntents(): void {
    const mine = (this.you ? [...this.intents.values()].some((i) => i.fromId === this.you!.id || i.toId === this.you!.id) : false) || this.escort !== null;
    if (mine && !this.intentPoller) this.intentPoller = setInterval(() => this.send({ type: "intent_poll" }), 500);
    else if (!mine && this.intentPoller) {
      clearInterval(this.intentPoller);
      this.intentPoller = null;
    }
  }

  escortCancel(): void {
    if (this.escort && !this.myInspectSlot) this.send({ type: "escort_cancel" });
  }

  intentAccept(intentId: string): void {
    this.send({ type: "intent_accept", intentId });
  }

  talkStart(withId: string): void {
    this.send({ type: "talk_start", withId });
  }

  inspectStart(slotId: string): void {
    this.send({ type: "inspect_start", slotId });
  }

  inspectEnd(): void {
    if (!this.myInspectSlot) return;
    this.send({ type: "inspect_end" });
    // leave at once locally; the server's inspect_ended confirms it, but
    // waiting for the round trip would leave the camera stuck mid-ease
    this.myInspectSlot = null;
    this.changed();
  }

  choose(choice: string): void {
    if (this.turn && !this.turn.ended && this.turn.awaiting === "customer") {
      this.send({ type: "talk_choose", conversationId: this.turn.conversationId, choice });
    }
  }

  talkLeave(): void {
    if (this.turn && !this.turn.ended) this.send({ type: "talk_leave" });
  }

  closeTurn(): void {
    if (this.turn?.ended) {
      this.send({ type: "talk_close" });
      this.turn = null;
      this.changed();
    }
  }

  staffRespond(conversationId: string, action: "reply" | "hand_to_genius" | "end"): void {
    this.send({ type: "staff_respond", conversationId, action });
    this.staffTurns.delete(conversationId);
    this.changed();
  }

  claim(customerId: string): void {
    this.send({ type: "claim", customerId });
  }

  handOn(customerId: string, to: string, note: string): void {
    this.send({ type: "hand_on", customerId, to, note });
  }

  // Dev switch between customer and staff, for walking (`?dev=1`).
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

// Re-renders the calling component when status, the roster or a conversation changes.
export function useNet(): Net {
  useSyncExternalStore(net.subscribe, net.getVersion);
  return net;
}
