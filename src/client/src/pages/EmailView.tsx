import type { MailItem } from "../api.ts";
import { Avatar } from "../Avatar.tsx";

// The signature watch-strip: every surveillance cue renders inside this
// tinted red card under otherwise ordinary email chrome.
export function WatchStrip({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div class="watch-strip">
      {lines.map((l) => (
        <div>{l}</div>
      ))}
    </div>
  );
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString();
}

export function EmailDetail({ email, myAddress }: { email: MailItem; myAddress: string }) {
  if (email.tombstone) {
    return (
      <div class="content-col">
        <div class="email-header">
          <div>
            <h1>{email.subject || "(no subject)"}</h1>
            <p style={{ color: "var(--muted)", margin: 0, fontSize: 13 }}>This email self-destructed.</p>
          </div>
        </div>
        <WatchStrip lines={email.tombstone.map((t) => `${t.address}: ${t.read ? "read before it went" : "never opened it"}`)} />
      </div>
    );
  }

  const watchLines: string[] = [];
  watchLines.push(`hesitated ${(email.hesitationMs / 1000).toFixed(1)}s before sending`);
  if (email.recipients.some((r) => r.kind === "bcc")) {
    const bcc = email.recipients.filter((r) => r.kind === "bcc").map((r) => r.address);
    watchLines.push(`bcc: ${bcc.join(", ")}`);
  }
  if (email.contributors.length > 1) {
    watchLines.push(`contributors: ${email.contributors.length} people edited this before it sent`);
  }
  if (email.fastMode) watchLines.push("sent in fast mode");
  if (email.selfDestructAt && !email.destroyedAt) {
    watchLines.push(`self-destructs at ${new Date(email.selfDestructAt).toLocaleTimeString()}`);
  }

  return (
    <div class="content-col">
      <div class="email-header">
        <div style={{ display: "flex", gap: 12 }}>
          <Avatar address={email.senderAddress} size={36} />
          <div>
            <h1>{email.subject || "(no subject)"}</h1>
            <div class="from-line">
              <strong style={{ color: "var(--ink)" }}>{email.senderAddress}</strong>
              <span>to {email.recipients.map((r) => r.address).join(", ")}</span>
            </div>
          </div>
        </div>
        <span class="when">{fmtTime(email.sentAt)}</span>
      </div>
      {email.quotedBody && <blockquote class="quoted">{email.quotedBody}</blockquote>}
      <p class="email-body">{email.body}</p>
      <WatchStrip lines={watchLines} />
    </div>
  );
}

export function EmailListRow({ email, active, onClick }: { email: MailItem; active: boolean; onClick: () => void }) {
  return (
    <button class={`list-row ${active ? "active" : ""}`} onClick={onClick}>
      <Avatar address={email.senderAddress} />
      <div class="row-main">
        <div class="row-top">
          <span class="sender">{email.senderAddress}</span>
          <span class="time">{fmtTime(email.sentAt)}</span>
        </div>
        <span class="subject">{email.subject || "(no subject)"}</span>
        {email.destroyedAt && <span class="tombstone-tag">self-destructed</span>}
      </div>
    </button>
  );
}
