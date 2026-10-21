import { useSyncExternalStore } from "react";
import type { PlayerStateName } from "../../shared/conversation.ts";
import { waitSpotFor } from "../../shared/duty.ts";
import { engagedMoment, type Release } from "../../shared/engage.ts";
import type { Profile } from "../../shared/profile.ts";
import type {
  ClientMessage,
  CustomerView,
  Engagement,
  Identity,
  ChatPair,
  OrderView,
  Inspection,
  Present,
  Role,
  ServerMessage,
  StaffMenuView,
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
// how long a line of this many characters takes to say, as time spent drawn talking
export const talkMs = (chars: number): number => Math.min(9000, Math.max(1500, chars * 65));

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
  // a real specialist's side of a conversation: the chat, the moves allowed now,
  // and the customer's facts; null when they are not in one
  staffConv: StaffMenuView | null = null;
  // the corner's feed of updates for a specialist (newest last)
  updates: Array<{ text: string; at: number }> = [];
  customers: CustomerView[] = [];
  notice: { text: string; at: number } | null = null;
  // who is close enough to talk to, set by the scene
  hint: { id: string; name: string } | null = null;
  // who is sitting at a table with someone (by visitor id), and where
  seats = new Map<string, { x: number; z: number; fx: number; fz: number }>();
  // real people in a conversation: who each is talking with, and whose turn it is to talk
  chats = new Map<string, { with: string; speaker?: string; until: number }>();
  // when the latest line from the other side arrived (their talking is drawn for as long as the line is long)
  turnAt = 0;
  staffAt = 0; // the same, for a specialist: when their panel last changed
  // where the server put you on joining: the view moves there once
  spawn: { x: number; z: number; ry: number } | null = null;
  // seeing your own character from behind (V)
  thirdPerson = false;
  // sales after the chat: the bag on its way, then with the specialist (everyone sees who carries it)
  orders: OrderView[] = [];
  // the stock person has come to you and you may take the bag (set by the scene)
  runnerNear = false;
  // told where to go for the help you asked for: the spot of the post you need
  get waitingAt(): { x: number; z: number; label: string } | null {
    if (this.state === "waiting_for_help" && !this.escort) {
      const spot = this.needs ? waitSpotFor(this.needs) : null;
      if (spot) return spot;
    }
    return null;
  }
  // a member of staff is walking you somewhere (to a demo device, to the till)
  escort: { id: string; kind: "demo" | "seat"; npcId: string; npcName: string; text: string; goal: { x: number; z: number } } | null = null;
  // the conversation as the scene should treat it: while you are being walked
  // somewhere it is on hold, so you can move and the camera is free
  get talking(): TurnView | null {
    return this.escort ? null : this.turn;
  }
  // a specialist in a conversation (the same hold while walking applies)
  get staffTalking(): StaffMenuView | null {
    // while the phone is brought out the chat is on hold: they can walk over and take it
    return this.escort ? null : this.staffConv;
  }
  // locked into a conversation, as either side: no walking, the camera on the other
  get locked(): boolean {
    return this.talking !== null || this.staffTalking !== null;
  }
  private settlePoller: ReturnType<typeof setInterval> | null = null;
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
        this.setChats(message.chats);
        this.orders = message.orders;
        this.spawn = message.spawn;
        this.seats = new Map(message.seated.map((s) => [s.visitorId, { x: s.at.x, z: s.at.z, fx: s.face.x, fz: s.face.z }]));
        this.pollSettle();
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
        this.turnAt = Date.now();
        return true;
      case "staff_menu": {
        const { type: _t, ...view } = message;
        this.staffConv = view;
        this.staffAt = Date.now();
        return true;
      }
      case "staff_menu_end":
        if (this.staffConv?.conversationId === message.conversationId) this.staffConv = null;
        this.pushUpdate(message.note);
        return true;
      case "chats":
        this.setChats(message.pairs);
        return true;
      case "orders":
        this.orders = message.orders;
        this.pollSettle();
        return true;
      case "update":
        this.pushUpdate(message.text);
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
      case "seated":
        this.seats.set(message.visitorId, { x: message.at.x, z: message.at.z, fx: message.face.x, fz: message.face.z });
        if (message.visitorId === this.you?.id) {
          // they have walked to the stool: you are on it now
          this.me.x = message.at.x;
          this.me.z = message.at.z;
          this.send({ type: "move", x: message.at.x, z: message.at.z, ry: Math.atan2(message.at.x - message.face.x, message.at.z - message.face.z) });
        }
        return true;
      case "unseated":
        this.seats.delete(message.visitorId);
        return true;
      case "escort": {
        const { type: _t, ...e } = message;
        this.escort = e;
        this.pollSettle();
        return true;
      }
      case "escort_end":
        if (this.escort?.id === message.id) this.escort = null;
        this.pollSettle();
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
        this.pushUpdate(message.text);
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
    this.pollSettle();
  }

  private addRemote(v: Present): void {
    const { x, z, ry, role, kind, specialty, look, ...info } = v;
    this.remotes.set(info.id, { info, role, identity: { kind, specialty, look }, x, z, ry, tx: x, tz: z, try: ry });
  }

  // ---- what the visitor does ----

  // the server decides when a beat has passed, but it has no timer: while a
  // walk or an order involving you is open, ask it to catch up
  private pollSettle(): void {
    const mine = this.escort !== null || this.orders.some((o) => o.customerId === this.you?.id || o.specId === this.you?.id);
    if (mine && !this.settlePoller) this.settlePoller = setInterval(() => this.send({ type: "settle" }), 500);
    else if (!mine && this.settlePoller) {
      clearInterval(this.settlePoller);
      this.settlePoller = null;
    }
  }

  escortCancel(): void {
    if (this.escort && !this.myInspectSlot) this.send({ type: "escort_cancel" });
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

  // a specialist's move: one of the offered ones, in a tone
  staffMove(actId: string, tone: string): void {
    if (!this.staffConv || this.staffConv.awaiting !== "staff") return;
    this.send({ type: "staff_move", conversationId: this.staffConv.conversationId, actId, tone });
  }

  // a specialist steps away from the conversation (Esc)
  staffLeave(): void {
    if (this.staffConv) this.send({ type: "talk_leave" });
  }

  private setChats(pairs: ChatPair[]): void {
    this.chats = new Map();
    for (const p of pairs) {
      // whoever spoke last is drawn talking for as long as their line takes to say
      const until = p.speaker && p.since !== undefined ? p.since + talkMs(p.chars ?? 0) : 0;
      this.chats.set(p.customerId, { with: p.staffId, speaker: p.speaker, until });
      this.chats.set(p.staffId, { with: p.customerId, speaker: p.speaker, until });
    }
  }

  // the specialist takes the bag from the stock person who has come to them
  takeOrder(): void {
    this.send({ type: "order_take" });
  }

  // the order you are part of, on either side
  get myOrderAsCustomer(): OrderView | undefined {
    return this.orders.find((o) => o.customerId === this.you?.id && o.stage !== "paying");
  }
  get myOrderAsSpecialist(): OrderView | undefined {
    return this.orders.find((o) => o.specId === this.you?.id);
  }
  // who is carrying a bag right now
  carrying(id: string): boolean {
    return this.orders.some((o) => (o.stage === "fetching" && o.stockId === id) || ((o.stage === "with_spec" || o.stage === "paying") && o.specId === id));
  }

  private pushUpdate(text: string): void {
    this.updates = [...this.updates, { text, at: Date.now() }].slice(-6);
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
