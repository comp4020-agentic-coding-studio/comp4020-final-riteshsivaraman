import { useEffect, useState } from "preact/hooks";
import { api, type DraftItem } from "../api.ts";
import type { Me } from "../App.tsx";
import { Avatar } from "../Avatar.tsx";

export function Board({ me }: { me: Me; path?: string }) {
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [locked, setLocked] = useState(false);

  const load = () => api.board().then((res) => res.ok && setDrafts(res.drafts));

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000); // live-ish: poll the board (v0.2 upgrades this to real pushes)
    return () => clearInterval(interval);
  }, []);

  const startEditing = async (d: DraftItem) => {
    const ok = await api.lockDraft(d.id).then((r) => r.ok);
    setLocked(ok);
    setEditing(d.id);
    setBody(d.body);
  };

  const stopEditing = async () => {
    if (editing) await api.unlockDraft(editing);
    setEditing(null);
  };

  const save = async () => {
    if (!editing) return;
    const res = await api.saveDraft(editing, { body });
    if (!res.ok) alert(res.error ?? "couldn't save");
    load();
  };

  return (
    <div class="reading-pane">
      <div class="content-col">
        <h1 style={{ fontSize: 19, margin: "0 0 4px" }}>Public drafts</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0, marginBottom: 20 }}>
          Everyone here left a draft unsent. You can see the subject and edit the body --- never the recipients, never what it's replying
          to.
        </p>
        {drafts.length === 0 && <p class="empty-state">Nobody's slipping up right now.</p>}
        {drafts.map((d) => (
          <div class="draft-card">
            <div class="draft-meta">
              <Avatar address={d.creatorAddress} size={22} />
              <span class="draft-subject">{d.subject || "(no subject)"}</span>
              {d.fastMode && <span class="pill fast">fast</span>}
            </div>
            {editing === d.id ? (
            <>
              <textarea value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button class="btn" onClick={save} disabled={!locked}>
                  Save edit
                </button>
                <button class="btn secondary" onClick={stopEditing}>
                  Done
                </button>
              </div>
              {!locked && <p class="error">Someone else is editing this right now.</p>}
            </>
          ) : (
            <p style={{ whiteSpace: "pre-wrap" }}>{d.body || "(empty so far)"}</p>
          )}
          {editing !== d.id && (
            <button class="btn secondary" onClick={() => startEditing(d)}>
              Edit
            </button>
          )}
            <div class="watch-strip">
              {d.contributors.length > 0 && <div>edited by: {d.contributors.join(", ")}</div>}
              {d.autoSendAt && <div>auto-sends at {new Date(d.autoSendAt).toLocaleTimeString()} with whatever's there then</div>}
              {d.lockedBy && <div>currently locked by {d.lockedBy}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
