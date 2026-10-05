import { useEffect, useState } from "preact/hooks";
import Router, { route } from "preact-router";
import { api } from "./api.ts";
import { AuthScreen } from "./pages/AuthScreen.tsx";
import { Inbox } from "./pages/Inbox.tsx";
import { Sent } from "./pages/Sent.tsx";
import { Board } from "./pages/Board.tsx";
import { Compose } from "./pages/Compose.tsx";

export interface Me {
  username: string;
  address: string;
  fastMode: boolean;
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = loading

  const refreshMe = async () => {
    const res = await api.me();
    setMe(res.ok ? { username: res.username!, address: res.address!, fastMode: res.fastMode! } : null);
  };

  useEffect(() => {
    refreshMe();
  }, []);

  if (me === undefined) return null;
  if (me === null) return <AuthScreen onAuthed={refreshMe} />;

  const logout = async () => {
    await api.logout();
    setMe(null);
    route("/");
  };

  const toggleFast = async () => {
    await api.setFastMode(!me.fastMode);
    refreshMe();
  };

  return (
    <div class="app-shell">
      <div class="topbar">
        <span class="brand">Panopticorp Mail</span>
        <span>
          <span class="pill" style={{ marginRight: 8 }}>
            {me.address}
          </span>
          <button class={`btn secondary ${me.fastMode ? "fast" : ""}`} onClick={toggleFast} style={{ marginRight: 8 }}>
            {me.fastMode ? "Fast mode: on" : "Fast mode: off"}
          </button>
          <button class="btn secondary" onClick={logout}>
            Log out
          </button>
        </span>
      </div>
      <div class="sidebar">
        <a href="/inbox">Inbox</a>
        <a href="/sent">Sent</a>
        <a href="/board">Public drafts</a>
        <a href="/compose">Compose</a>
      </div>
      <Router>
        <Inbox path="/" me={me} />
        <Inbox path="/inbox" me={me} />
        <Sent path="/sent" me={me} />
        <Board path="/board" me={me} />
        <Compose path="/compose" me={me} />
      </Router>
    </div>
  );
}
