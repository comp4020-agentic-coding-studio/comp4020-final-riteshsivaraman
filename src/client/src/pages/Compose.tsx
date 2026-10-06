import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../api.ts";
import type { Me } from "../App.tsx";

const SELF_DESTRUCT_OPTIONS = [
  { label: "Never", ms: null as number | null },
  { label: "3 days", ms: 3 * 24 * 60 * 60 * 1000 },
];
const SELF_DESTRUCT_FAST = { label: "1 minute (fast mode)", ms: 60 * 1000 };

function parseAddresses(s: string): string[] {
  return s
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Splits on the same separators as parseAddresses, but keeps them, so the
 * last element is whatever's currently being typed (possibly ""). */
function currentToken(s: string): string {
  const parts = s.split(/[,;\s]+/);
  return parts[parts.length - 1] ?? "";
}

/** A To/Cc/Bcc field with a recent-recipients dropdown layered on top of the
 * plain multi-address text input --- parseAddresses()/the string value is
 * still the source of truth, this is purely a typing aid. */
function AddressField({
  id,
  label,
  value,
  onChange,
  suggestions,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const token = currentToken(value).trim().toLowerCase();
  const matches = token.length === 0 ? [] : suggestions.filter((a) => a.toLowerCase().includes(token) && a.toLowerCase() !== token).slice(0, 6);
  const showDropdown = open && matches.length > 0;
  const boundedIndex = Math.min(activeIndex, matches.length - 1);

  const accept = (address: string) => {
    const token = currentToken(value);
    const prefix = value.slice(0, value.length - token.length);
    onChange(`${prefix}${address}, `);
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  return (
    <div class="field-row address-field">
      <label for={id}>{label}</label>
      <input
        id={id}
        ref={inputRef}
        value={value}
        onInput={(e) => {
          onChange((e.target as HTMLInputElement).value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!showDropdown) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            accept(matches[boundedIndex]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showDropdown && (
        <ul class="address-suggestions">
          {matches.map((a, i) => (
            <li key={a} class={i === boundedIndex ? "active" : ""} onMouseDown={(e) => (e.preventDefault(), accept(a))} onMouseEnter={() => setActiveIndex(i)}>
              {a}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Compose({ me }: { me: Me; path?: string }) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selfDestructMs, setSelfDestructMs] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [recentAddresses, setRecentAddresses] = useState<string[]>([]);
  const lastKeystroke = useRef(Date.now());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A fresh compose is private until saved or abandoned (seen-spec §4): it
  // exists as a draft from the first keystroke so the 30s-silence rule has
  // something to apply to.
  useEffect(() => {
    api.createDraft({ subject: "", body: "", recipients: [] }).then((res) => res.ok && setDraftId(res.id));
  }, []);

  // Recent-recipients autocomplete source --- fetched once, read-only.
  useEffect(() => {
    api.recentRecipients().then((res) => res.ok && setRecentAddresses(res.addresses));
  }, []);

  useEffect(() => {
    if (!draftId) return;
    const interval = setInterval(() => api.heartbeat(draftId), 10_000);
    return () => clearInterval(interval);
  }, [draftId]);

  const buildRecipients = () => [
    ...parseAddresses(to).map((address) => ({ address, kind: "to" as const })),
    ...parseAddresses(cc).map((address) => ({ address, kind: "cc" as const })),
    ...parseAddresses(bcc).map((address) => ({ address, kind: "bcc" as const })),
  ];

  const scheduleSave = () => {
    if (!draftId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.saveDraft(draftId, { subject, body, recipients: buildRecipients(), selfDestructDurationMs: selfDestructMs });
    }, 800);
  };

  const onEdit = () => {
    lastKeystroke.current = Date.now();
    scheduleSave();
  };

  const send = async (e: Event) => {
    e.preventDefault();
    if (!draftId) return;
    const hesitationMs = Date.now() - lastKeystroke.current;
    await api.saveDraft(draftId, { subject, body, recipients: buildRecipients(), selfDestructDurationMs: selfDestructMs });
    const res = await api.sendDraft(draftId, hesitationMs);
    if (res.ok) {
      setStatus("Sent.");
      setDraftId(null);
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      api.createDraft({ subject: "", body: "", recipients: [] }).then((r) => r.ok && setDraftId(r.id));
    } else {
      setStatus(res.error ?? "couldn't send");
    }
  };

  const saveAndPublish = async () => {
    if (!draftId) return;
    const res = await api.saveDraft(draftId, {
      subject,
      body,
      recipients: buildRecipients(),
      selfDestructDurationMs: selfDestructMs,
      publish: true,
    });
    setStatus(res.voice ?? "Draft saved.");
  };

  return (
    <div class="reading-pane">
      <form class="compose content-col" onSubmit={send}>
        <AddressField
          id="to"
          label="To"
          value={to}
          suggestions={recentAddresses}
          onChange={(v) => (setTo(v), onEdit())}
        />
        <AddressField
          id="cc"
          label="Cc"
          value={cc}
          suggestions={recentAddresses}
          onChange={(v) => (setCc(v), onEdit())}
        />
        <AddressField
          id="bcc"
          label="Bcc"
          value={bcc}
          suggestions={recentAddresses}
          onChange={(v) => (setBcc(v), onEdit())}
        />
        <div class="field-row">
          <label for="subject">Subject</label>
          <input id="subject" value={subject} onInput={(e) => (setSubject((e.target as HTMLInputElement).value), onEdit())} />
        </div>
        <textarea placeholder="Write something." value={body} onInput={(e) => (setBody((e.target as HTMLTextAreaElement).value), onEdit())} />
        <div class="compose-footer">
          <button class="btn" type="submit">
            Send
          </button>
          <button type="button" class="btn secondary" onClick={saveAndPublish}>
            Save draft
          </button>
          <label
            style={{
              fontSize: 12.5,
              color: "var(--muted)",
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Self-destruct
            <select
              onChange={(e) => {
                const val = (e.target as HTMLSelectElement).value;
                setSelfDestructMs(val === "" ? null : val === "fast" ? SELF_DESTRUCT_FAST.ms : Number(val));
              }}
            >
              {SELF_DESTRUCT_OPTIONS.map((o) => (
                <option value={o.ms ?? ""}>{o.label}</option>
              ))}
              {me.fastMode && <option value="fast">{SELF_DESTRUCT_FAST.label}</option>}
            </select>
          </label>
        </div>
        {status && <div class="watch-strip">{status}</div>}
      </form>
    </div>
  );
}
