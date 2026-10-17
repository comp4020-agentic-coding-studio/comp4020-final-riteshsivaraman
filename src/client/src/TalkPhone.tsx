import { useEffect, useState } from "react";
import { makeRng } from "../../shared/talk/rng.ts";
import { randomStaff, staffMove, type StaffTraits } from "../../shared/talk/npc.ts";
import { applyCustomer, applyStaff, customerMenu, newScene } from "../../shared/talk/scene.ts";
import type { CustomerReply, Scene } from "../../shared/talk/types.ts";

// A client-only trial of the new conversation-model engine (docs/conversation-model/),
// dropped into the real 3D store beside the old server-authoritative Talk.tsx, not
// replacing it. Everything here is local React state: no socket message, no SQLite
// row, no events-table write. That wiring is explicitly future work (README.md's
// "Not done" list) — this is just "can the engine run inside the actual store",
// the way poc/talk/ already proved it could run inside a bare HTML page.
//
// The player always plays the customer; an NPC (npc.ts's staffMove) plays the phone
// specialist, seeded fresh each time the panel opens so repeat visits aren't identical.

export function TalkPhone({ onClose }: { onClose: () => void }) {
  const [scene, setScene] = useState<Scene>(() => newScene());
  const [staff] = useState<StaffTraits>(() => randomStaff(makeRng(Date.now())));
  const [rng] = useState(() => makeRng(Date.now() ^ 0x9e3779b9));

  // Staff moves itself the moment it's staff's turn; the customer (the player)
  // only acts through the buttons below.
  useEffect(() => {
    if (scene.ended || scene.toMove !== "staff") return;
    const { act, tone } = staffMove(scene, staff, rng);
    const next = applyStaff(scene, act, tone);
    if ("error" in next) return; // the NPC never proposes an illegal move; a stuck scene just stops here
    setScene(next);
  }, [scene, staff, rng]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const menu = customerMenu(scene);
  const last = scene.log[scene.log.length - 1];

  const reply = (r: CustomerReply) => {
    const next = applyCustomer(scene, r);
    if ("error" in next) return;
    setScene(next);
  };

  return (
    <div className="talk" role="dialog" aria-label="Conversation with the phones specialist">
      <div className="talk-name">the phones specialist [new engine, local only]</div>
      <p className="talk-say">{last?.text ?? ""}</p>
      {!scene.ended && <div className="talk-leave-hint"><kbd>Esc</kbd> to step away</div>}
      {!scene.ended && !menu && <div className="talk-wait">Thinking…</div>}
      {!scene.ended && menu && (
        <div className="talk-choices">
          {menu.options.map((o, i) => (
            <button key={o.id} type="button" onClick={() => reply({ picks: [o.id], tone: "neutral" })}>
              <kbd>{i + 1}</kbd> {o.label}
            </button>
          ))}
          {menu.actions.map((a, i) => (
            <button key={JSON.stringify(a.action)} type="button" onClick={() => reply({ action: a.action, tone: "neutral" })}>
              <kbd>{menu.options.length + i + 1}</kbd> {a.label}
            </button>
          ))}
        </div>
      )}
      {scene.ended && (
        <div className="talk-choices">
          <button type="button" onClick={onClose}>
            <kbd>1</kbd> {scene.ended.how === "bought" ? "Done" : "Leave"}
          </button>
        </div>
      )}
    </div>
  );
}
