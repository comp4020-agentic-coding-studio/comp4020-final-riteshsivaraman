import { useState } from "preact/hooks";
import { api } from "../api.ts";

export function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    const res = mode === "login" ? await api.login(username, password) : await api.signup(username, password);
    if (res.ok) onAuthed();
    else setError(res.error ?? "something went wrong");
  };

  return (
    <div class="auth-screen">
      <form class="auth-card" onSubmit={submit}>
        <span class="brand">Panopticorp Mail</span>
        <p style={{ color: "var(--muted)", fontSize: 12 }}>Everything you do here can be seen by someone.</p>
        <input placeholder="username" value={username} onInput={(e) => setUsername((e.target as HTMLInputElement).value)} />
        <input
          type="password"
          placeholder="password"
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        />
        {error && <span class="error">{error}</span>}
        <button class="btn" type="submit">
          {mode === "login" ? "Log in" : "Sign up"}
        </button>
        <button type="button" class="btn secondary" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
      </form>
    </div>
  );
}
