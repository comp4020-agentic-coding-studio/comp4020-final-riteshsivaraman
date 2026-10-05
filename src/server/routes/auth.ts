import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getUserForSession, LoginError, login, setFastMode, signup, SignupError } from "../lib/auth.ts";
import type { Vars } from "../lib/context.ts";

export const authRoutes = new Hono<{ Variables: Vars }>();

const SESSION_COOKIE = "seen_session";

function setSessionCookie(c: Parameters<typeof setCookie>[0], sessionId: string): void {
  setCookie(c as never, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

authRoutes.post("/signup", async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  try {
    const { sessionId } = signup(body.username, body.password);
    setSessionCookie(c, sessionId);
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof SignupError) return c.json({ ok: false, error: err.message }, 400);
    throw err;
  }
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  try {
    const sessionId = login(body.username, body.password);
    setSessionCookie(c, sessionId);
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof LoginError) return c.json({ ok: false, error: err.message }, 401);
    throw err;
  }
});

authRoutes.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ ok: false }, 401);
  return c.json({ ok: true, username: user.username, address: user.address, fastMode: user.fastMode });
});

authRoutes.post("/fast-mode", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ ok: false }, 401);
  const body = await c.req.json<{ fast: boolean }>();
  setFastMode(user.id, body.fast);
  return c.json({ ok: true });
});

export function readSessionCookie(c: Parameters<typeof getCookie>[0]): string | undefined {
  return getCookie(c as never, SESSION_COOKIE);
}

export { getUserForSession };
