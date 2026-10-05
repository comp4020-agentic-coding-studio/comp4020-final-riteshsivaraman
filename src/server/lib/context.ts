// Shared Hono context typing: every authenticated route reads c.var.user.
import type { users } from "../schema.ts";

export type AppUser = typeof users.$inferSelect;

export type Vars = {
  user: AppUser | null;
};
