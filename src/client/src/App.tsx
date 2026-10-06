import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import Router, { route } from "preact-router";
import { api } from "./api.ts";
import { Avatar } from "./Avatar.tsx";
import { ComposeIcon, DraftsIcon, InboxIcon, SearchIcon, SentIcon } from "./icons.tsx";
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

function NavLink({ href, active, class: className, children }: { href: string; active: boolean; class?: string; children: ComponentChildren }) {
  return (
    <a href={href} class={[className, active ? "active" : ""].filter(Boolean).join(" ")} onClick={(e) => (e.preventDefault(), route(href))}>
      {children}
    </a>
  );
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = loading
  const [inboxCount, setInboxCount] = useState(0);
  const [boardCount, setBoardCount] = useState(0);
  const [path, setPath] = useState(window.location.pathname);

  const refreshMe = async () => {
    const res = await api.me();
    setMe(res.ok ? { username: res.username!, address: res.address!, fastMode: res.fastMode! } : null);
  };

  useEffect(() => {
    refreshMe();
  }, []);

  useEffect(() => {
    if (!me) return;
    const refreshCounts = () => {
      api.inbox().then((r) => r.ok && setInboxCount(r.emails.length));
      api.board().then((r) => r.ok && setBoardCount(r.drafts.length));
    };
    refreshCounts();
    const interval = setInterval(refreshCounts, 8000);
    return () => clearInterval(interval);
  }, [me]);

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
        <div class="topbar-search">
          <SearchIcon />
          <span>Search mail</span>
        </div>
        <div class="topbar-right">
          <button class={`icon-btn ${me.fastMode ? "active" : ""}`} onClick={toggleFast}>
            {me.fastMode ? "Fast mode: on" : "Fast mode: off"}
          </button>
          <button class="icon-btn" onClick={logout}>
            Log out
          </button>
          <Avatar address={me.address} size={30} />
        </div>
      </div>
      <div class="sidebar">
        <NavLink href="/compose" active={false} class="compose-btn">
          <ComposeIcon />
          Compose
        </NavLink>
        <NavLink href="/inbox" active={path === "/" || path === "/inbox"}>
          <InboxIcon />
          Inbox
          {inboxCount > 0 && <span class="count">{inboxCount}</span>}
        </NavLink>
        <NavLink href="/sent" active={path === "/sent"}>
          <SentIcon />
          Sent
        </NavLink>
        <NavLink href="/board" active={path === "/board"}>
          <DraftsIcon />
          Public drafts
          {boardCount > 0 && <span class="count">{boardCount}</span>}
        </NavLink>
      </div>
      <Router onChange={(e) => setPath(e.url)}>
        <Inbox path="/" me={me} />
        <Inbox path="/inbox" me={me} />
        <Sent path="/sent" me={me} />
        <Board path="/board" me={me} />
        <Compose path="/compose" me={me} />
      </Router>
    </div>
  );
}
