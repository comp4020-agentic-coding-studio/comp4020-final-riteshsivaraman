import { useEffect, useState } from "preact/hooks";
import { api, type MailItem } from "../api.ts";
import type { Me } from "../App.tsx";
import { EmailDetail, EmailListRow } from "./EmailView.tsx";

export function Sent({ me }: { me: Me; path?: string }) {
  const [emails, setEmails] = useState<MailItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.sent().then((res) => res.ok && setEmails(res.emails));
  }, []);

  const current = emails.find((e) => e.id === selected) ?? null;

  return (
    <div class="split-view">
      <div class="list-pane">
        {emails.map((e) => (
          <EmailListRow email={e} active={e.id === selected} onClick={() => setSelected(e.id)} />
        ))}
        {emails.length === 0 && <p class="empty-state">Nothing sent yet.</p>}
      </div>
      <div class="reading-pane">
        {current ? <EmailDetail email={current} myAddress={me.address} /> : <p class="empty-state">Select an email to read it.</p>}
      </div>
    </div>
  );
}
