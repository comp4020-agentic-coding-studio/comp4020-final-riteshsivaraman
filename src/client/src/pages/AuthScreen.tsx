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
        <p class="tagline">Everything you do here can be seen by someone.</p>

        {/* A segmented control, not just a button whose label changes ---
            the mode has to be visually unmistakable, not inferred from text. */}
        <div class="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "login"} class={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Log in
          </button>
          <button type="button" role="tab" aria-selected={mode === "signup"} class={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            Sign up
          </button>
        </div>

        <div class="auth-field">
          <label for="username">Username</label>
          <input id="username" value={username} onInput={(e) => setUsername((e.target as HTMLInputElement).value)} autocomplete="username" />
        </div>
        <div class="auth-field">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            autocomplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>

        {error && <span class="error">{error}</span>}
        <button class="btn" type="submit">
          {mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
