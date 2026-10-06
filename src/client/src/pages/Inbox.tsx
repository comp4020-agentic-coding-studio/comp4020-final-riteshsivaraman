import { useEffect, useState } from "preact/hooks";
import { api, type MailItem } from "../api.ts";
import type { Me } from "../App.tsx";
import { EmailDetail, EmailListRow, WatchStrip } from "./EmailView.tsx";

export function Inbox({ me }: { me: Me; path?: string }) {
  const [emails, setEmails] = useState<MailItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

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

  const open = async (id: string) => {
    setSelected(id);
    await api.openEmail(id);
    load();
  };

  const current = emails.find((e) => e.id === selected) ?? null;

  return (
    <div class="split-view">
      <div class="list-pane">
        <WatchStrip lines={notices} />
        {emails.map((e) => (
          <EmailListRow email={e} active={e.id === selected} onClick={() => open(e.id)} myAddress={me.address} />
        ))}
        {emails.length === 0 && <p class="empty-state">Nothing here yet.</p>}
      </div>
      <div class="reading-pane">
        {current ? <EmailDetail email={current} myAddress={me.address} /> : <p class="empty-state">Select an email to read it.</p>}
      </div>
    </div>
  );
}
