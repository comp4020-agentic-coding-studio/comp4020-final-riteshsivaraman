// Live draft preview (ADR 2): a recipient (to/cc/bcc) watching the app sees
// a draft's content update as the sender types, before it's sent. Pure
// in-process pub/sub, ephemeral --- no persistence, resets on restart. The
// `drafts` row stays the single source of truth; this is just fan-out to
// whoever currently has an SSE connection open for a given userId.
export interface DraftPreviewEvent {
  draftId: string;
  subject: string;
  body: string;
}

type Subscriber = (event: DraftPreviewEvent) => void;

const subscribers = new Map<string, Set<Subscriber>>();

/** Registers a callback for every live-preview event addressed to this user.
 * Returns an unsubscribe function --- callers must call it on disconnect, or
 * the channel leaks the closed connection's callback forever. */
export function subscribe(userId: string, onEvent: Subscriber): () => void {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(onEvent);
  return () => {
    const current = subscribers.get(userId);
    if (!current) return;
    current.delete(onEvent);
    if (current.size === 0) subscribers.delete(userId);
  };
}

/** Pushes a draft-preview event to every currently-connected subscriber for
 * this user. A no-op if they're not connected (no queue, no replay --- this
 * is a live feed, not a mailbox). */
export function publish(userId: string, event: DraftPreviewEvent): void {
  const set = subscribers.get(userId);
  if (!set) return;
  for (const onEvent of set) onEvent(event);
}

/** Test/diagnostic only: how many live subscribers a user currently has. */
export function subscriberCount(userId: string): number {
  return subscribers.get(userId)?.size ?? 0;
}
