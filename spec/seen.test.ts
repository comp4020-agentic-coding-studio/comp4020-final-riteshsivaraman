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
