import { useState } from "preact/hooks";
import { useLiveStream } from "./LiveStreamContext.tsx";

// Pinned at the top of .app-shell, outside <Router> --- visible on every
// route, not just Inbox (that was the bug: the old version only existed
// inside Inbox.tsx's own mount effect, so it vanished on navigation). Calm/
// neutral on purpose (ADR 2): a feature surface, not a third "dread" device
// alongside the unread asterisk and the ghost-read line.
export function LiveStreamBanner() {
  const { liveDrafts } = useLiveStream();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (liveDrafts.size === 0) return null;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div class="live-stream-banner">
      {[...liveDrafts.entries()].map(([id, d]) => (
        <div class="live-stream-line" key={id}>
          <button type="button" class="live-stream-row" onClick={() => toggle(id)} aria-expanded={expanded.has(id)}>
            a draft addressed to you is being written: {d.subject || "(no subject yet)"}
          </button>
          {expanded.has(id) && <p class="live-stream-body">{d.body || "(nothing written yet)"}</p>}
        </div>
      ))}
    </div>
  );
}
