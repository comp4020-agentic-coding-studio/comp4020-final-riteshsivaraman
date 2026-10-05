// Thin fetch wrapper. Session is a cookie, so every call just needs
// credentials included.
async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  return res.json() as Promise<T>;
}

export const api = {
  me: () => req<{ ok: boolean; username?: string; address?: string; fastMode?: boolean }>("/api/auth/me"),
  signup: (username: string, password: string) =>
    req<{ ok: boolean; error?: string }>("/api/auth/signup", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    req<{ ok: boolean; error?: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  setFastMode: (fast: boolean) => req<{ ok: boolean }>("/api/auth/fast-mode", { method: "POST", body: JSON.stringify({ fast }) }),

  inbox: () => req<{ ok: boolean; emails: MailItem[] }>("/api/mail/inbox"),
  notices: () => req<{ ok: boolean; notices: { type: string; at: number; payload: Record<string, unknown> }[] }>("/api/mail/notices"),
  sent: () => req<{ ok: boolean; emails: MailItem[] }>("/api/mail/sent"),
  openEmail: (id: string) => req<{ ok: boolean }>(`/api/mail/${id}/open`, { method: "POST" }),
  send: (payload: SendPayload) => req<{ ok: boolean; emailId?: string; bounced?: string[]; voice?: string }>("/api/mail/send", { method: "POST", body: JSON.stringify(payload) }),

  board: () => req<{ ok: boolean; drafts: DraftItem[] }>("/api/drafts/board"),
  createDraft: (payload: Partial<DraftPayload>) => req<{ ok: boolean; id: string }>("/api/drafts", { method: "POST", body: JSON.stringify(payload) }),
  heartbeat: (id: string) => req<{ ok: boolean }>(`/api/drafts/${id}/heartbeat`, { method: "POST" }),
  saveDraft: (id: string, payload: Partial<DraftPayload> & { publish?: boolean }) =>
    req<{ ok: boolean; error?: string; voice?: string }>(`/api/drafts/${id}/save`, { method: "POST", body: JSON.stringify(payload) }),
  lockDraft: (id: string) => req<{ ok: boolean }>(`/api/drafts/${id}/lock`, { method: "POST" }),
  unlockDraft: (id: string) => req<{ ok: boolean }>(`/api/drafts/${id}/unlock`, { method: "POST" }),
  sendDraft: (id: string, hesitationMs: number) =>
    req<{ ok: boolean; error?: string; emailId?: string }>(`/api/drafts/${id}/send`, { method: "POST", body: JSON.stringify({ hesitationMs }) }),
};

export interface SendPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  quotedBody?: string | null;
  threadId?: string | null;
  forwardedFromId?: string | null;
  forwardRootId?: string | null;
  hesitationMs: number;
  selfDestructDurationMs?: number | null;
}

export interface DraftPayload {
  subject: string;
  body: string;
  recipients: { address: string; kind: "to" | "cc" | "bcc" }[];
  quotedBody?: string | null;
  threadId?: string | null;
  forwardedFromId?: string | null;
  forwardRootId?: string | null;
  selfDestructDurationMs?: number | null;
}

export interface MailItem {
  id: string;
  senderId: string;
  senderAddress: string;
  subject: string;
  body: string | null;
  quotedBody: string | null;
  threadId: string | null;
  forwardRootId: string | null;
  hesitationMs: number;
  sentAt: number;
  selfDestructAt: number | null;
  destroyedAt: number | null;
  fastMode: boolean;
  contributors: string[];
  recipients: { address: string; kind: string; openedAt: number | null }[];
  tombstone: { address: string; read: boolean }[] | null;
}

export interface DraftItem {
  id: string;
  creatorAddress: string;
  subject: string;
  body: string;
  recipients?: { address: string; kind: string }[];
  quotedBody?: string | null;
  isOwner: boolean;
  contributors: string[];
  autoSendAt: number | null;
  lockedBy: string | null;
  fastMode: boolean;
}
