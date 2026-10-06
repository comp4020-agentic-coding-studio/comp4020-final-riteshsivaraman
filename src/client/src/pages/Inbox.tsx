import { useEffect, useState } from "preact/hooks";
import { api, type MailItem } from "../api.ts";
import type { Me } from "../App.tsx";
import { EmailDetail, EmailListRow, WatchStrip } from "./EmailView.tsx";

interface LiveDraft {
  subject: string;
  body: string;
}

// Live draft preview (ADR 2): a draft addressed to this user (to/cc/bcc)
// streams its content here as the sender types, before it's ever sent. Read
// side only --- the server (src/server/routes/stream.ts) publishes a
// "draft" SSE event on every saveDraft(), keyed by draftId; this just
// renders whatever the latest event for each draftId said. No polling, no
// queue: if the tab wasn't open when an edit saved, that edit is simply
// never seen, same as the server's fan-out being purely live.
function LiveDrafts({ drafts }: { drafts: Map<string, LiveDraft> }) {
  if (drafts.size === 0) return null;
  return (
    <div class="live-draft-stack">
      {[...drafts.entries()].map(([id, d]) => (
        <div class="live-draft-card" key={id}>
          <div class="live-draft-label">a draft addressed to you is being written</div>
          <div class="live-draft-subject">{d.subject || "(no subject yet)"}</div>
          {d.body && <p class="live-draft-body">{d.body}</p>}
        </div>
      ))}
    </div>
  );
}

export function Inbox({ me }: { me: Me; path?: string }) {
  const [emails, setEmails] = useState<MailItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [liveDrafts, setLiveDrafts] = useState<Map<string, LiveDraft>>(new Map());

  const load = async () => {
    const [res, n] = await Promise.all([api.inbox(), api.notices()]);
    if (res.ok) setEmails(res.emails);
    if (n.ok) {
      setNotices(
        n.notices.slice(0, 5).map((notice) => {
          if (notice.type === "forward") return `your email was forwarded to ${(notice.payload.toAddresses as string[])?.join(", ")}`;
          if (notice.type === "self_destruct")
            return notice.payload.opened === false ? "an email self-destructed unread" : "an email self-destructed";
          if (notice.type === "bounce") return `bounced: ${notice.payload.address} doesn't exist here`;
          return notice.type;
        }),
      );
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/stream");
    const onDraft = (e: Event) => {
      const data = JSON.parse((e as MessageEvent).data) as { draftId: string; subject: string; body: string };
      setLiveDrafts((prev) => {
        const next = new Map(prev);
        next.set(data.draftId, { subject: data.subject, body: data.body });
        return next;
      });
    };
    source.addEventListener("draft", onDraft);
    return () => source.close();
  }, []);

  const open = async (id: string) => {
    setSelected(id);
    await api.openEmail(id);
    load();
  };

  const current = emails.find((e) => e.id === selected) ?? null;

  return (
    <div class="split-view">
      <div class="list-pane">
        <LiveDrafts drafts={liveDrafts} />
        <WatchStrip lines={notices} />
        {emails.map((e) => (
          <EmailListRow email={e} active={e.id === selected} onClick={() => open(e.id)} />
        ))}
        {emails.length === 0 && <p class="empty-state">Nothing here yet.</p>}
      </div>
      <div class="reading-pane">
        {current ? <EmailDetail email={current} myAddress={me.address} /> : <p class="empty-state">Select an email to read it.</p>}
      </div>
    </div>
  );
}
