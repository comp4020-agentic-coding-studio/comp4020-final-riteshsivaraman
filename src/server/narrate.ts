// Turns the log's lines back into sentences, so "who did what" can be read from
// `flyctl logs` alone (crit 10, "Fly by instruments"). The line format is the one
// eventlog.ts writes: `<time> [<tag>] <type> user=<id> who=<name> key=value ...`.
// Pure, no app and no database: whatever is not in the line is not in the story.

export interface ParsedLine {
  ts: string;
  tag: string;
  type: string;
  user?: string;
  fields: Record<string, string>;
}

// key=value pairs, where a value is a bare word, a "quoted string" or a {json object}
function pairs(rest: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < rest.length) {
    while (rest[i] === " ") i++;
    const eq = rest.indexOf("=", i);
    if (eq < 0) break;
    const key = rest.slice(i, eq);
    i = eq + 1;
    let value: string;
    if (rest[i] === '"') {
      let j = i + 1;
      while (j < rest.length && !(rest[j] === '"' && rest[j - 1] !== "\\")) j++;
      value = JSON.parse(rest.slice(i, j + 1)) as string;
      i = j + 1;
    } else if (rest[i] === "{") {
      let depth = 0;
      let j = i;
      let inString = false;
      for (; j < rest.length; j++) {
        const c = rest[j];
        if (inString) {
          if (c === "\\") j++;
          else if (c === '"') inString = false;
        } else if (c === '"') inString = true;
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) break;
      }
      value = rest.slice(i, j + 1);
      i = j + 1;
    } else {
      let j = i;
      while (j < rest.length && rest[j] !== " ") j++;
      value = rest.slice(i, j);
      i = j;
    }
    out[key] = value;
  }
  return out;
}

export function parseLine(line: string): ParsedLine | null {
  const m = /^(\d{4}-\d\d-\d\dT[\d:.]+Z) \[([^\]]*)\] ([a-z_]+)(?: (.*))?$/.exec(line.trim());
  if (!m) return null;
  const fields = pairs(m[4] ?? "");
  const user = fields.user;
  delete fields.user;
  return { ts: m[1]!, tag: m[2]!, type: m[3]!, user, fields };
}

const sale = (f: Record<string, string>): string => {
  try {
    const s = JSON.parse(f.sale ?? "{}") as { colour?: string; name?: string; price?: number };
    return s.name ? `${s.colour ?? ""} ${s.name}${s.price ? ` (A$${s.price})` : ""}`.trim() : "a phone";
  } catch {
    return "a phone";
  }
};

// a character or visitor, by name when the line has it, else by id
const named = (f: Record<string, string>, key: string): string => f[`${key}Name`] ?? f[key] ?? "someone";

export function sentence(p: ParsedLine): string {
  const f = p.fields;
  const who = f.who ?? f.name ?? p.user ?? "someone";
  switch (p.type) {
    case "join":
      return `${who} came in as ${f.kind === "customer" ? "a customer" : `a ${f.specialty ?? ""} ${f.kind}`.replace("  ", " ")} (${f.zone ?? "somewhere"})`;
    case "leave":
      return `${who} left`;
    case "zone":
      return `${who} went from ${f.from} to ${f.to}`;
    case "role":
      return `${who} switched to ${f.role}`;
    case "staff_area_refused":
      return `${who} was kept out of the staff area`;
    case "notice":
      return `the store told ${who}: "${f.text}"`;
    case "announcement":
      return `announcement: "${f.text}"`;
    case "npc_approached":
      return `${named(f, "npcId")} went up to ${who}`;
    case "pay_visit_started":
      return `${named(f, "by")} set off to take payment from ${who}${f.queued === "true" ? " (still with someone, so it waits)" : ""}`;
    case "pay_visit_ended":
      return `${named(f, "by")}'s payment visit to ${who} ended: ${f.why} (${f.detail})`;
    case "staff_approached":
      return `${named(f, "staffId")} went up to ${who}`;
    case "conversation_started":
      return `${who} began talking with ${named(f, "with")}${f.script === "payment" ? " about paying" : ""}`;
    case "talk_turn":
      return `${who} chose "${f.choice}"; ${f.say ? `they were told: "${f.say}"` : "the talk moved on"}`;
    case "talk_staff_move":
      return `${named(f, "by")} (${f.tone}) to ${who}: ${f.move}`;
    case "conversation_ended":
      return `the conversation with ${who} ended (${f.why})`;
    case "conversation_closed":
      return `${who} dismissed the last line of the conversation`;
    case "conversation_handed_to_npc":
      return `${named(f, "from")} left; ${named(f, "to")} carried on talking with ${who}`;
    case "customer_stood_in_for":
      return `${named(f, "npcId")} stood in for ${who}, who had left`;
    case "post_handed_over":
      return `${named(f, "npcId")} took over from ${who}, who left`;
    case "seat_offered":
      return `${named(f, "by")} offered ${who} a table`;
    case "seat_accepted":
      return `${who} agreed to sit at ${f.tableId}`;
    case "seat_declined":
      return `${who} preferred to stand`;
    case "seated":
      return `${who} sat down at ${f.tableId}`;
    case "stood_up":
      return `${who} got up from the table`;
    case "escort_started":
      return `${named(f, "staff")} began walking ${who} to a ${f.kind === "seat" ? "table" : "device"}`;
    case "escort_ended":
      return `the walk with ${who} to a ${f.kind === "seat" ? "table" : "device"} ended (${f.why})`;
    case "inspect_start":
      return `${who} picked up the device at ${f.slotId}`;
    case "inspect_end":
      return `${who} put the device down (${f.why})`;
    case "reserved":
      return `a ${f.colour} ${f.product} was set aside for ${who}`;
    case "reserve_lost":
      return `${who} lost the last ${f.colour} ${f.product} to someone else`;
    case "reservation_released":
      return `the ${f.colour} ${f.product} held for ${who} went back on the shelf (${f.why})`;
    case "reservation_expired":
      return `the ${f.colour} ${f.product} held for ${who} timed out`;
    case "stock_checked":
      return `${named(f, "by")} checked stock for ${who}: ${sale(f)}`;
    case "order_placed":
      return `order placed for ${who}: ${sale(f)}, specialist ${named(f, "spec")}, runner ${named(f, "stockId")}`;
    case "stock_ordered":
      return `${named(f, "stockId")} was sent for ${who}'s phone`;
    case "stock_handed_over":
      return `${named(f, "stockId")} handed the bag to ${named(f, "to")}`;
    case "order_handed_to_npc":
      return `${who}'s order moved from ${named(f, "from")} to ${named(f, "to")}`;
    case "payment_started":
      return `payment began with ${who} for ${sale(f)}`;
    case "purchase_paid":
      return `${who} paid for ${sale(f)} (${f.method ?? "card"})`;
    case "purchase_cancelled":
      return `${who} called off the purchase of ${sale(f)} at the payment`;
    case "order_cancelled":
      return `${who}'s order was called off (${f.why})`;
    default: {
      const rest = Object.entries(f)
        .filter(([k]) => k !== "who")
        .map(([k, v]) => `${k}=${v}`).join(" ");
      return `${who}: ${p.type}${rest ? ` ${rest}` : ""}`;
    }
  }
}

// One line of the log, as a sentence with its time, or null if it is not an event
// line (the platform's own lines, "listening on ...").
export function narrateLine(line: string): string | null {
  const p = parseLine(line);
  return p ? `${p.ts.slice(11, 19)}  ${sentence(p)}` : null;
}
