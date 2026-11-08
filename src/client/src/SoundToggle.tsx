import { useSyncExternalStore } from "react";
import { sound } from "./audio.ts";

// Issue #11's sound controls: small fixed buttons, always visible. "Sound" is the master switch (everything,
// including the cues); "Music" and "Chatter" are the two background layers, each with its own switch. The
// choices persist in localStorage (audio.ts), so they survive a reload the same way the visitor's token does.
const useSound = <T,>(read: () => T): T => useSyncExternalStore((fn) => sound.subscribe(fn), read);

export function SoundToggle() {
  const muted = useSound(() => sound.muted);
  const music = useSound(() => sound.musicOn);
  const chatter = useSound(() => sound.chatterOn);
  return (
    <div className="sound-controls">
      <button type="button" className="sound-toggle" aria-pressed={!music} onClick={() => sound.setMusic(!music)}>
        {music ? "Music on" : "Music off"}
      </button>
      <button type="button" className="sound-toggle" aria-pressed={!chatter} onClick={() => sound.setChatter(!chatter)}>
        {chatter ? "Chatter on" : "Chatter off"}
      </button>
      <button type="button" className="sound-toggle" aria-pressed={muted} onClick={() => sound.toggleMuted()}>
        {muted ? "Sound off" : "Sound on"}
      </button>
    </div>
  );
}
