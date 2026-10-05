import type { MailItem } from "../api.ts";

// The signature watch-strip: every surveillance cue renders as a thin
// monospace red line under otherwise ordinary email chrome.
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

export function EmailDetail({ email, myAddress }: { email: MailItem; myAddress: string }) {
  if (email.tombstone) {
    return (
      <div>
        <h2>{email.subject}</h2>
        <p style={{ color: "var(--muted)" }}>This email self-destructed.</p>
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
    <div>
      <h2>{email.subject}</h2>
      <p style={{ color: "var(--muted)" }}>
        from {email.senderAddress} to {email.recipients.map((r) => r.address).join(", ")}
      </p>
      {email.quotedBody && (
        <blockquote style={{ borderLeft: "2px solid var(--line)", paddingLeft: 10, color: "var(--muted)" }}>
          {email.quotedBody}
        </blockquote>
      )}
      <p style={{ whiteSpace: "pre-wrap" }}>{email.body}</p>
      <WatchStrip lines={watchLines} />
    </div>
  );
}

export function EmailListRow({ email, active, onClick }: { email: MailItem; active: boolean; onClick: () => void }) {
  return (
    <button class={`list-row ${active ? "active" : ""}`} onClick={onClick}>
      <span class="subject">{email.subject || "(no subject)"}</span>
      <span class="meta">
        {email.senderAddress} · {new Date(email.sentAt).toLocaleString()}
        {email.destroyedAt ? " · self-destructed" : ""}
      </span>
    </button>
  );
}
