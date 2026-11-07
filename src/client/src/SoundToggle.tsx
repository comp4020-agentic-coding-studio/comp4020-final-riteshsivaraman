import { useSyncExternalStore } from "react";
import { sound } from "./audio.ts";

// Issue #11's mute toggle: a small fixed button, always visible, that
// reflects and flips `sound.muted`. The choice persists in localStorage
// (audio.ts), so it survives a reload the same way the visitor's token and
// profile do.
export function SoundToggle() {
  const muted = useSyncExternalStore(
    (fn) => sound.subscribe(fn),
    () => sound.muted,
  );
  return (
    <button type="button" className="sound-toggle" aria-pressed={muted} onClick={() => sound.toggleMuted()}>
      {muted ? "Sound off" : "Sound on"}
    </button>
  );
}
