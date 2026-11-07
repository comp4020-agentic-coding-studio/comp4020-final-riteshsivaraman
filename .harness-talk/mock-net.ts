// Throwaway harness mock of useNet(), fed by real captured server turns
// (fetched from ./turns.json, produced by driving the real WebSocket server).
// Not part of the app; deleted after verifying the Talk.tsx UI fix.
import { useState, useEffect } from "react";

let turns: any[] = [];
let idx = 0;

export function useNet() {
  const [, force] = useState(0);
  useEffect(() => {
    if (turns.length === 0) {
      fetch("/turns.json").then((r) => r.json()).then((t) => {
        turns = t;
        force((n) => n + 1);
      });
    }
  }, []);
  const turn = turns[idx];
  return {
    turn,
    choose: (id: string) => {
      idx = Math.min(idx + 1, turns.length - 1);
      force((n) => n + 1);
    },
    closeTurn: () => {},
    talkLeave: () => {},
  };
}
