// Tiny cookie-jar fetch client so spec/*.test.ts can drive the real HTTP API
// as two different logged-in users, same as a browser would (CLAUDE.md:
// visibility claims get checked from a second, genuinely different session).
import { inject } from "vitest";

export class Client {
  private cookie = "";
  readonly baseUrl = inject("baseUrl");

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}), cookie: this.cookie },
      redirect: "manual",
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return res;
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.request(path, init);
    return res.json() as Promise<T>;
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.json<T>(path, { method: "POST", body: JSON.stringify(body) });
  }
}

let counter = 0;
export async function newUser(): Promise<{ client: Client; username: string; address: string }> {
  const client = new Client();
  const username = `spec-${Date.now()}-${counter++}`;
  await client.post("/api/auth/signup", { username, password: "password123" });
  return { client, username, address: `${username}@panopticorp.test` };
}
