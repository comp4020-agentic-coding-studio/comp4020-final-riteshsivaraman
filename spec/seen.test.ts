// Seen's own checks, against the running app (same contract as
// invariants.test.ts). What's covered here vs left advisory: see
// seen-spec.md §13 and CLAUDE.md "Spec traceability" / "Sensor admission
// bar". The draft-auto-send-after-its-real-world deadline check is
// deliberately NOT here --- even fast mode's 2 minutes is too slow for a
// blocking suite; it's a manual/crit-time check instead.
import { describe, expect, it } from "vitest";
import { Client, newUser } from "./helpers.ts";

describe("sending", () => {
  it("a sent email reaches its recipient", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const send = await alice.client.post<{ ok: boolean; emailId: string }>("/api/mail/send", {
      to: [bob.address],
      subject: "hello",
      body: "world",
      hesitationMs: 100,
    });
    expect(send.ok).toBe(true);

    const inbox = await bob.client.json<{ ok: boolean; emails: { id: string; subject: string }[] }>("/api/mail/inbox");
    expect(inbox.emails.some((e) => e.id === send.emailId && e.subject === "hello")).toBe(true);
  });

  it("an unknown address bounces privately to the sender only, not the recipient's inbox", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const send = await alice.client.post<{ ok: boolean; bounced: string[] }>("/api/mail/send", {
      to: [bob.address, "nobody-at-all@panopticorp.test"],
      subject: "partial bounce",
      body: "x",
      hesitationMs: 50,
    });
    expect(send.bounced).toEqual(["nobody-at-all@panopticorp.test"]);
    const aliceNotices = await alice.client.json<{ notices: { type: string }[] }>("/api/mail/notices");
    expect(aliceNotices.notices.some((n) => n.type === "bounce")).toBe(true);
  });

  it("BCC is exposed both ways: a To recipient sees who was BCC'd", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const carol = await newUser();
    await alice.client.post("/api/mail/send", { to: [bob.address], bcc: [carol.address], subject: "s", body: "b", hesitationMs: 10 });
    const inbox = await bob.client.json<{ emails: { recipients: { address: string; kind: string }[] }[] }>("/api/mail/inbox");
    expect(inbox.emails[0].recipients.some((r) => r.address === carol.address && r.kind === "bcc")).toBe(true);
  });
});

describe("recent recipients", () => {
  it("returns this user's recently-sent-to addresses, most-recent-first and deduplicated, never another user's", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const carol = await newUser();
    const dave = await newUser();

    await alice.client.post("/api/mail/send", { to: [bob.address], subject: "first", body: "x", hesitationMs: 10 });
    await alice.client.post("/api/mail/send", { to: [carol.address], subject: "second", body: "x", hesitationMs: 10 });
    await alice.client.post("/api/mail/send", { to: [bob.address], subject: "third", body: "x", hesitationMs: 10 }); // bob again, most recent

    // Dave only ever hears from carol, never from alice --- his recent list
    // must not leak alice's sent history.
    await carol.client.post("/api/mail/send", { to: [dave.address], subject: "unrelated", body: "x", hesitationMs: 10 });

    const aliceRecent = await alice.client.json<{ ok: boolean; addresses: string[] }>("/api/mail/recent-recipients");
    expect(aliceRecent.addresses[0]).toBe(bob.address); // most recent occurrence wins over the earlier one
    expect(aliceRecent.addresses.filter((a) => a === bob.address).length).toBe(1); // deduped
    expect(aliceRecent.addresses).toContain(carol.address);
    expect(aliceRecent.addresses).not.toContain(dave.address); // alice never sent to dave

    const daveRecent = await dave.client.json<{ ok: boolean; addresses: string[] }>("/api/mail/recent-recipients");
    expect(daveRecent.addresses).toEqual([]); // dave has never sent anything
  });
});

describe("the public draft board", () => {
  it("never exposes recipients or the quoted thread to a stranger", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const create = await alice.client.post<{ id: string }>("/api/drafts", {
      subject: "board test",
      body: "visible text",
      recipients: [{ address: bob.address, kind: "to" }],
      quotedBody: "the hidden quoted thread",
    });
    await alice.client.post(`/api/drafts/${create.id}/save`, { publish: true });

    const strangerView = await bob.client.json<{ drafts: Record<string, unknown>[] }>("/api/drafts/board");
    const draft = strangerView.drafts.find((d) => d.id === create.id)!;
    expect(draft.subject).toBe("board test");
    expect(draft.body).toBe("visible text");
    expect(draft.recipients).toBeUndefined();
    expect(draft.quotedBody).toBeUndefined();
  });

  it("every editor lands in the contributors list on the sent email, and nothing a non-owner wrote sends without the owner's draft existing", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const create = await alice.client.post<{ id: string }>("/api/drafts", {
      subject: "collab",
      body: "alice's words",
      recipients: [{ address: bob.address, kind: "to" }],
    });
    await alice.client.post(`/api/drafts/${create.id}/save`, { publish: true });
    await bob.client.post(`/api/drafts/${create.id}/lock`, {});
    await bob.client.post(`/api/drafts/${create.id}/save`, { body: "bob's edit" });
    const send = await alice.client.post<{ ok: boolean; emailId: string }>(`/api/drafts/${create.id}/send`, { hesitationMs: 20 });
    expect(send.ok).toBe(true);

    const sent = await alice.client.json<{ emails: { id: string; contributors: string[]; body: string }[] }>("/api/mail/sent");
    const email = sent.emails.find((e) => e.id === send.emailId)!;
    expect(email.contributors).toContain(alice.address);
    expect(email.contributors).toContain(bob.address);
    expect(email.body).toBe("bob's edit"); // frozen as whatever was there when sent
  });

  it("a stranger can't edit without the lock", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const carol = await newUser();
    const create = await alice.client.post<{ id: string }>("/api/drafts", { subject: "lock test", body: "orig", recipients: [] });
    await alice.client.post(`/api/drafts/${create.id}/save`, { publish: true });
    await bob.client.post(`/api/drafts/${create.id}/lock`, {});
    const carolSave = await carol.client.post<{ ok: boolean; error?: string }>(`/api/drafts/${create.id}/save`, { body: "carol was here" });
    expect(carolSave.ok).toBe(false);
  });
});

describe("self-destruct", () => {
  it("notifies both sides when never opened, and tombstones the body", async () => {
    const alice = await newUser();
    const bob = await newUser();
    await alice.client.post("/api/mail/send", {
      to: [bob.address],
      subject: "ephemeral",
      body: "gone soon",
      hesitationMs: 10,
      selfDestructDurationMs: 50,
    });
    await new Promise((r) => setTimeout(r, 150));

    const inbox = await bob.client.json<{ emails: { subject: string; body: string | null; tombstone: unknown }[] }>("/api/mail/inbox");
    const found = inbox.emails.find((e) => e.subject === "ephemeral")!;
    expect(found.body).toBeNull();
    expect(found.tombstone).not.toBeNull();

    const aliceNotices = await alice.client.json<{ notices: { type: string; payload: { opened: boolean } }[] }>("/api/mail/notices");
    expect(aliceNotices.notices.some((n) => n.type === "self_destruct" && n.payload.opened === false)).toBe(true);
  });

  it("stays silent (no notice) when opened before destruction", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const send = await alice.client.post<{ emailId: string }>("/api/mail/send", {
      to: [bob.address],
      subject: "read in time",
      body: "caught it",
      hesitationMs: 10,
      selfDestructDurationMs: 300,
    });
    await bob.client.post(`/api/mail/${send.emailId}/open`, {});
    await new Promise((r) => setTimeout(r, 400));
    await bob.client.json("/api/mail/inbox"); // touch it so catch-up runs

    const aliceNotices = await alice.client.json<{ notices: { type: string; payload: { emailId: string } }[] }>("/api/mail/notices");
    expect(aliceNotices.notices.some((n) => n.type === "self_destruct" && n.payload.emailId === send.emailId)).toBe(false);
  });
});

describe("forward alerts", () => {
  it("notifies the original sender, including a forward of a forward", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const carol = await newUser();
    const original = await alice.client.post<{ emailId: string }>("/api/mail/send", {
      to: [bob.address],
      subject: "chain start",
      body: "x",
      hesitationMs: 10,
    });
    const firstForward = await bob.client.post<{ emailId: string }>("/api/mail/send", {
      to: [carol.address],
      subject: "fwd: chain start",
      body: "fyi",
      forwardedFromId: original.emailId,
      forwardRootId: original.emailId,
      hesitationMs: 10,
    });
    const dave = await newUser();
    await carol.client.post("/api/mail/send", {
      to: [dave.address],
      subject: "fwd: fwd: chain start",
      body: "fyi again",
      forwardedFromId: firstForward.emailId,
      forwardRootId: original.emailId, // the very first email, not the immediate parent
      hesitationMs: 10,
    });

    const aliceNotices = await alice.client.json<{ notices: { type: string }[] }>("/api/mail/notices");
    const forwardNotices = aliceNotices.notices.filter((n) => n.type === "forward");
    expect(forwardNotices.length).toBe(2); // both the original forward and the forward-of-forward
  });
});

interface DraftPreviewPush {
  draftId: string;
  subject: string;
  body: string;
}

/** Opens `/api/stream` as this client and returns a function that reads the
 * next SSE "draft" push off it, racing a timeout so a missing push fails the
 * test instead of hanging. */
async function openPreviewStream(client: Client): Promise<() => Promise<DraftPreviewPush>> {
  const res = await client.request("/api/stream");
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return async function nextEvent(): Promise<DraftPreviewPush> {
    for (;;) {
      const match = buffer.match(/data: (.*)\n\n/);
      if (match) {
        buffer = buffer.slice(match.index! + match[0].length);
        return JSON.parse(match[1]);
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("SSE stream closed before an event arrived");
      buffer += decoder.decode(value, { stream: true });
    }
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(label)), ms))]);
}

describe("live draft preview (ADR 2)", () => {
  it("pushes a draft's content to a To recipient over SSE as the sender saves it", async () => {
    const alice = await newUser();
    const bob = await newUser();

    // Open bob's SSE connection before alice saves anything, same as a
    // recipient who already has the app open.
    const nextEvent = await openPreviewStream(bob.client);

    const draft = await alice.client.post<{ ok: boolean; id: string }>("/api/drafts", {
      subject: "being watched",
      recipients: [{ address: bob.address, kind: "to" }],
    });

    await alice.client.post(`/api/drafts/${draft.id}/save`, { body: "typing, live" });

    const event = await withTimeout(nextEvent(), 5000, "timed out waiting for the SSE push");
    expect(event.draftId).toBe(draft.id);
    expect(event.subject).toBe("being watched");
    expect(event.body).toBe("typing, live");
  });

  it("also pushes to a Bcc recipient --- ADR 2's audience is to/cc/bcc, same as the BCC-exposed-both-ways precedent", async () => {
    const alice = await newUser();
    const bob = await newUser(); // ordinary To recipient, included for contrast
    const carol = await newUser(); // Bcc

    const bobNext = await openPreviewStream(bob.client);
    const carolNext = await openPreviewStream(carol.client);

    const draft = await alice.client.post<{ ok: boolean; id: string }>("/api/drafts", {
      subject: "quietly cc'd",
      recipients: [
        { address: bob.address, kind: "to" },
        { address: carol.address, kind: "bcc" },
      ],
    });

    await alice.client.post(`/api/drafts/${draft.id}/save`, { body: "bcc should see this too" });

    const [bobEvent, carolEvent] = await Promise.all([
      withTimeout(bobNext(), 5000, "timed out waiting for the To recipient's SSE push"),
      withTimeout(carolNext(), 5000, "timed out waiting for the Bcc recipient's SSE push"),
    ]);
    expect(bobEvent.body).toBe("bcc should see this too");
    expect(carolEvent.draftId).toBe(draft.id);
    expect(carolEvent.body).toBe("bcc should see this too");
  });
});
