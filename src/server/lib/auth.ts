// Plain TS auth module: password hashing (scrypt, node:crypto, no extra
// dependency), session tokens, address assignment. CLAUDE.md: company name
// is [TK] --- Panopticorp is a placeholder, swap it before shipping.
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db.ts";
import { sessions, users } from "../schema.ts";
import { logEvent } from "./events.ts";

export const COMPANY_DOMAIN = "panopticorp.test"; // [TK] swap before shipping

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class SignupError extends Error {}

export function signup(username: string, password: string): { userId: string; sessionId: string } {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,32}$/.test(normalized)) {
    throw new SignupError("usernames are 2-32 characters: letters, digits, dot, dash, underscore");
  }
  if (password.length < 8) {
    throw new SignupError("password needs at least 8 characters");
  }
  const existing = db.select().from(users).where(eq(users.username, normalized)).get();
  if (existing) throw new SignupError("that username is taken");

  const userId = randomUUID();
  const address = `${normalized}@${COMPANY_DOMAIN}`;
  db.insert(users)
    .values({
      id: userId,
      username: normalized,
      address,
      passwordHash: hashPassword(password),
      fastMode: false,
      createdAt: Date.now(),
    })
    .run();
  logEvent(userId, "signup", { username: normalized });
  return { userId, sessionId: createSession(userId) };
}

export class LoginError extends Error {}

export function login(username: string, password: string): string {
  const normalized = username.trim().toLowerCase();
  const user = db.select().from(users).where(eq(users.username, normalized)).get();
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new LoginError("wrong username or password");
  }
  return createSession(user.id);
}

function createSession(userId: string): string {
  const id = randomBytes(32).toString("hex");
  const now = Date.now();
  db.insert(sessions)
    .values({ id, userId, createdAt: now, expiresAt: now + SESSION_TTL_MS })
    .run();
  return id;
}

export function getUserForSession(sessionId: string | undefined): (typeof users.$inferSelect) | null {
  if (!sessionId) return null;
  const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!row || row.expiresAt < Date.now()) return null;
  return db.select().from(users).where(eq(users.id, row.userId)).get() ?? null;
}

export function setFastMode(userId: string, fast: boolean): void {
  db.update(users).set({ fastMode: fast }).where(eq(users.id, userId)).run();
  logEvent(userId, "fast_mode_toggle", { fast });
}
