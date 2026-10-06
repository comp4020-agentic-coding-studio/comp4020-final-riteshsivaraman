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

export function Compose({ me }: { me: Me; path?: string }) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selfDestructMs, setSelfDestructMs] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const lastKeystroke = useRef(Date.now());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A fresh compose is private until saved or abandoned (seen-spec §4): it
  // exists as a draft from the first keystroke so the 30s-silence rule has
  // something to apply to.
  useEffect(() => {
    api.createDraft({ subject: "", body: "", recipients: [] }).then((res) => res.ok && setDraftId(res.id));
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
        <div class="field-row">
          <label for="to">To</label>
          <input id="to" value={to} onInput={(e) => (setTo((e.target as HTMLInputElement).value), onEdit())} />
        </div>
        <div class="field-row">
          <label for="cc">Cc</label>
          <input id="cc" value={cc} onInput={(e) => (setCc((e.target as HTMLInputElement).value), onEdit())} />
        </div>
        <div class="field-row">
          <label for="bcc">Bcc</label>
          <input id="bcc" value={bcc} onInput={(e) => (setBcc((e.target as HTMLInputElement).value), onEdit())} />
        </div>
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
