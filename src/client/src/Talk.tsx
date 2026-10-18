import { useEffect, useMemo, useRef, useState } from "react";
import { useNet } from "./net.ts";

// The conversation box, at the bottom of the screen like a Pokemon text box:
// who is speaking, what they say, and your choices as numbered buttons (press
// 1 to 9, or click). When it is the employee's turn it says so, and when it has
// ended Space, Enter or Esc closes it. Esc also works mid-conversation, before
// it has ended (Ritesh, 2026-10-12: there was previously no way to walk away
// without finishing it). The mouse is never captured, so it stays visible.
//
// A choice's optional `group` (protocol.ts) folds it under a named, collapsed
// heading instead of listing it at the same weight as everything else — the
// old engine never sets it (every one of its choices is ungrouped, rendered
// exactly as before); the new talk engine's phone scene uses it for things
// that are always technically legal but rarely what you want right now
// (every model's demo/pick action, a colour this model doesn't come in)
// (Ritesh, 2026-10-19, live feedback: a flat wall of ~30 buttons "is HORRIBLE").
// Numbered 1-9 shortcuts stay on the top-level (ungrouped) choices only, since
// that's the list short enough for them to mean anything.
//
// Presentation (Ritesh, 2026-10-19: "a mix of contextual choices and better
// presentation"): the line types out and the choices only appear once it has
// finished (Space/Enter/click skips ahead; reduced-motion users get it at
// once). The question's own answers are big cards; the always-available exits
// ("standing": leave, back, carry on) are small quiet buttons underneath, so
// they stop competing with the answers. The old engine doesn't set `standing`,
// so its leave/back/ok ids are recognised here.
interface Choice {
  id: string;
  label: string;
  group?: string;
  standing?: boolean;
}

const STANDING_IDS = new Set(["leave", "back", "ok"]);
const isStanding = (c: Choice) => c.standing ?? STANDING_IDS.has(c.id);

function useTypewriter(text: string, key: unknown): [string, boolean, () => void] {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) {
      setN(text.length);
      return;
    }
    setN(0);
    const id = window.setInterval(() => setN((v) => (v >= text.length ? v : v + 2)), 18);
    return () => window.clearInterval(id);
  }, [text, key, reduce]);
  return [text.slice(0, n), n >= text.length, () => setN(text.length)];
}

function groupChoices(choices: Choice[]): { top: Choice[]; standing: Choice[]; groups: Map<string, Choice[]> } {
  const top: Choice[] = [];
  const standing: Choice[] = [];
  const groups = new Map<string, Choice[]>();
  for (const c of choices) {
    if (!c.group) {
      (isStanding(c) ? standing : top).push(c);
      continue;
    }
    const list = groups.get(c.group);
    if (list) list.push(c);
    else groups.set(c.group, [c]);
  }
  return { top, standing, groups };
}

export function Talk() {
  const net = useNet();
  const turn = net.talking;
  const [open, setOpen] = useState<string | null>(null);

  const { top, standing, groups } = useMemo(() => groupChoices(turn?.choices ?? []), [turn?.choices]);

  const [shown, done, skip] = useTypewriter(turn?.say ?? "", turn?.conversationId);
  const doneRef = useRef(done);
  doneRef.current = done;
  const skipRef = useRef(skip);
  skipRef.current = skip;

  useEffect(() => {
    setOpen(null); // a fresh turn's groups start collapsed, every time
  }, [turn?.conversationId, turn?.say]);

  useEffect(() => {
    if (!turn) return;
    const key = (e: KeyboardEvent) => {
      const t = net.talking;
      if (!t) return;
      if (t.ended) {
        if (e.code === "Space" || e.code === "Enter" || e.code === "Escape") {
          e.preventDefault();
          net.closeTurn();
        }
        return;
      }
      if (e.code === "Escape") {
        e.preventDefault();
        net.talkLeave();
        return;
      }
      if (!doneRef.current) {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          skipRef.current();
        }
        return;
      }
      const n = Number(e.key);
      // Only the top-level (ungrouped) choices get a number shortcut — a
      // grouped one is reached by opening its heading first, by design.
      if (Number.isInteger(n) && n >= 1 && n <= top.length && t.awaiting === "customer") net.choose(top[n - 1]!.id);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [turn, top, net]);

  if (!turn) return null;
  return (
    <div className="talk" role="dialog" aria-label={`Conversation with ${turn.withName}`}>
      <div className="talk-name">{turn.withName}</div>
      <div className="talk-head">
        <div className="talk-avatar" aria-hidden="true">{turn.withName.trim().charAt(0).toUpperCase()}</div>
        <p className="talk-say" onClick={skip} aria-label={turn.say}>
          <span aria-hidden="true">{shown}</span>
        </p>
      </div>
      {!turn.ended && <div className="talk-leave-hint"><kbd>Esc</kbd> to step away</div>}
      {turn.awaiting === "staff" && !turn.ended && <div className="talk-wait">Waiting for {turn.withName}…</div>}
      {done && !turn.ended && turn.awaiting === "customer" && (
        <div className="talk-choices">
          {top.map((c, i) => (
            <button key={c.id} type="button" className="talk-card" onClick={() => net.choose(c.id)}>
              <kbd>{i + 1}</kbd> {c.label}
            </button>
          ))}
          {[...groups.entries()].map(([name, items]) => (
            <div key={name} className="talk-group">
              <button type="button" className="talk-group-toggle" aria-expanded={open === name} onClick={() => setOpen(open === name ? null : name)}>
                <span>{name}</span>
                <span className="talk-group-count">{items.length}</span>
                <span className="talk-group-caret">{open === name ? "▾" : "▸"}</span>
              </button>
              {open === name && (
                <div className="talk-group-items">
                  {items.map((c) => (
                    <button key={c.id} type="button" onClick={() => net.choose(c.id)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {standing.length > 0 && (
            <div className="talk-standing">
              {standing.map((c) => (
                <button key={c.id} type="button" onClick={() => net.choose(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {done && turn.ended && (
        <div className="talk-choices">
          <button type="button" onClick={() => net.closeTurn()}>
            <kbd>Space</kbd> Close
          </button>
        </div>
      )}
    </div>
  );
}
