// Every events row also becomes one line on stdout, so `flyctl logs` can narrate
// who did what (week 10: the app writes to stdout, the platform collects it).
// Shape: `<time> [<tag>] <type> user=<id> key=value ...`. The tag ties lines of
// one conversation together; without one it is the visitor. The visitor's
// session token is never in an event's data, and never printed here.

// a UUID is cut to its first 8 characters; an NPC id such as greeter-1 stays whole
const short = (id: unknown): string => {
  const s = String(id);
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(s) ? s.slice(0, 8) : s;
};

const scalar = (v: unknown): string => {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string") return /^[\w.:-]+$/.test(v) ? v : JSON.stringify(v);
  return JSON.stringify(v);
};

// A visitor's or character's name, so a line can say "Pebble" and not only a
// short id. Set once by the server; without it lines carry ids alone. Names are
// public (everyone sees them over heads), never a token.
let nameLookup: (id: string) => string | undefined = () => undefined;
export function setNameLookup(fn: (id: string) => string | undefined): void {
  nameLookup = fn;
}

// the keys whose value is a person or character
const ID_KEYS = new Set(["customerId", "with", "to", "from", "by", "npcId", "spec", "stockId", "staffId"]);

export function formatEvent(ts: number, visitorId: string | null, type: string, data?: unknown): string {
  const fields: string[] = [];
  let tag = visitorId ? short(visitorId) : "-";
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (v === undefined || v === null || k === "token") continue;
      if (k === "conversationId") {
        tag = short(v);
        continue;
      }
      if (k === "note") {
        fields.push("note=yes"); // free text a visitor typed: kept in the table, not in the log
        continue;
      }
      const isId = ID_KEYS.has(k);
      fields.push(`${k}=${isId ? short(v) : scalar(v)}`);
      const who = isId ? nameLookup(String(v)) : undefined;
      if (who) fields.push(`${k}Name=${scalar(who)}`);
    }
  }
  const me = visitorId && !(data && typeof data === "object" && "name" in (data as object)) ? nameLookup(visitorId) : undefined;
  const user = visitorId ? ` user=${short(visitorId)}${me ? ` who=${scalar(me)}` : ""}` : "";
  return `${new Date(ts).toISOString()} [${tag}] ${type}${user}${fields.length ? " " + fields.join(" ") : ""}`;
}

export function emitEvent(ts: number, visitorId: string | null, type: string, data?: unknown): void {
  console.log(formatEvent(ts, visitorId, type, data));
}
