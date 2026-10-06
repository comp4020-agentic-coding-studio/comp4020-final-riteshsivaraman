import { createContext } from "preact";
import type { ComponentChildren } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";

// Single global `/api/stream` SSE connection (ADR 2), lifted out of any one
// page so it --- and whatever it's carrying --- survives navigation. Owned
// here, for the lifetime of a logged-in session, rather than inside
// whichever route happens to be mounted.
//
// Shaped to carry more than one kind of live state: today it's just
// liveDrafts, but a later feature adds a second SSE event type on this same
// connection. Add its state as another field on LiveStreamState (and another
// addEventListener in the provider) rather than restructuring this --- this
// is why the context exposes a small state object instead of being
// hardcoded to "the live drafts map".
export interface LiveDraftPreview {
  subject: string;
  body: string;
}

export interface LiveStreamState {
  liveDrafts: Map<string, LiveDraftPreview>;
  // Future event types' state goes here alongside liveDrafts.
}

const LiveStreamContext = createContext<LiveStreamState>({ liveDrafts: new Map() });

/** Mount once, above the router, for as long as `active` is true (i.e. a
 * user is logged in). Opens exactly one EventSource and closes it on
 * logout/unmount. */
export function LiveStreamProvider({ active, children }: { active: boolean; children: ComponentChildren }) {
  const [liveDrafts, setLiveDrafts] = useState<Map<string, LiveDraftPreview>>(new Map());
  const draftsRef = useRef(liveDrafts);
  draftsRef.current = liveDrafts;

  useEffect(() => {
    if (!active) {
      setLiveDrafts(new Map());
      return;
    }

    const source = new EventSource("/api/stream");
    const onDraft = (e: Event) => {
      const data = JSON.parse((e as MessageEvent).data) as { draftId: string; subject: string; body: string };
      setLiveDrafts((prev) => {
        const next = new Map(prev);
        next.set(data.draftId, { subject: data.subject, body: data.body });
        return next;
      });
    };
    source.addEventListener("draft", onDraft);
    return () => source.close();
  }, [active]);

  return <LiveStreamContext.Provider value={{ liveDrafts }}>{children}</LiveStreamContext.Provider>;
}

export function useLiveStream(): LiveStreamState {
  return useContext(LiveStreamContext);
}
