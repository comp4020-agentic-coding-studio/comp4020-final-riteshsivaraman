import { derive, money, newScene } from "../../src/shared/talk/bank.ts";
import { modelById } from "../../src/shared/talk/data.ts";
import { randomPersona, randomStaff, customerMove, staffMove, type Memory, type Persona, type StaffTraits } from "../../src/shared/talk/npc.ts";
import { makeRng, type Rng } from "../../src/shared/talk/rng.ts";
import { applyCustomer, applyStaff, customerMenu, staffActs } from "../../src/shared/talk/scene.ts";
import { TONES, type CustomerAction, type CustomerReply, type Role, type Scene, type StaffAct, type Tone } from "../../src/shared/talk/types.ts";

// Throwaway page for trying the conversation model by hand. You are either
// the customer or the staff member; the other side is an NPC, or a second
// browser tab (BroadcastChannel, same browser only; the real app needs a
// real transport). Nothing here is persisted or logged.

const app = document.getElementById("app")!;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---- setup from the URL hash: #role=staff&vs=npc&seed=7  or  #role=customer&vs=tab&room=abc ----

const params = new URLSearchParams(location.hash.slice(1));
const me = params.get("role") as Role | null;
const vs = params.get("vs");
const room = params.get("room") ?? "main";
const seed = Number(params.get("seed") ?? Date.now() % 100000);

if (!me || (vs !== "npc" && vs !== "tab")) setupScreen();
else start(me, vs, room, seed);

function setupScreen(): void {
  const s = Number(params.get("seed") ?? Date.now() % 100000);
  app.innerHTML = `
    <h1>Phone specialist: conversation model POC</h1>
    <p class="muted">Pick a side. Every line on both sides is a pick from a menu. Throwaway page; the engine is in src/shared/talk/.</p>
    <div class="card">
      <h2>You are</h2>
      <div class="chips" id="role"><button class="chip on" data-v="customer">the customer</button><button class="chip" data-v="staff">the phone specialist</button></div>
      <h2>The other side is</h2>
      <div class="chips" id="vs"><button class="chip on" data-v="npc">an NPC</button><button class="chip" data-v="tab">a person in another tab</button></div>
      <div id="npcopts"><h2>NPC seed</h2><input id="seed" type="number" value="${s}"> <span class="muted small">the same seed replays the same NPC choices, given the same picks</span></div>
      <p><button class="primary" id="go">Start</button></p>
    </div>`;
  let role = "customer";
  let vsel = "npc";
  const pick = (id: string, set: (v: string) => void) =>
    app.querySelectorAll<HTMLButtonElement>(`#${id} button`).forEach((b) =>
      b.addEventListener("click", () => {
        app.querySelectorAll(`#${id} button`).forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        set(b.dataset.v!);
        (document.getElementById("npcopts") as HTMLElement).style.display = vsel === "npc" ? "" : "none";
      }),
    );
  pick("role", (v) => (role = v));
  pick("vs", (v) => (vsel = v));
  document.getElementById("go")!.addEventListener("click", () => {
    const seedV = (document.getElementById("seed") as HTMLInputElement).value;
    const roomId = Math.random().toString(36).slice(2, 7);
    location.hash = vsel === "npc" ? `role=${role}&vs=npc&seed=${seedV}` : `role=${role}&vs=tab&room=${roomId}`;
    location.reload();
  });
}

function start(role: Role, mode: "npc" | "tab", roomId: string, seedN: number): void {
  const other: Role = role === "staff" ? "customer" : "staff";
  let sc: Scene = newScene();
  const rng: Rng = makeRng(seedN);
  const persona: Persona = randomPersona(rng, `seed-${seedN}`);
  const traits: StaffTraits = randomStaff(rng);
  const mem: Memory = { wants: persona.wants, conceded: new Set() };
  let tone: Tone = "friendly";
  const chan = mode === "tab" ? new BroadcastChannel(`talk-${roomId}`) : null;

  // ---- the second tab: moves are replayed on both sides; a join asks for the current scene ----
  type Msg = { kind: "move"; turn: number; staff?: { act: StaffAct; tone: Tone }; customer?: CustomerReply } | { kind: "hello" } | { kind: "state"; sc: Scene };
  chan?.addEventListener("message", (e: MessageEvent<Msg>) => {
    const m = e.data;
    if (m.kind === "hello") chan.postMessage({ kind: "state", sc } satisfies Msg);
    else if (m.kind === "state") {
      if (m.sc.turn > sc.turn) {
        sc = m.sc;
        render();
      }
    } else if (m.kind === "move" && m.turn === sc.turn) {
      const r = m.staff ? applyStaff(sc, m.staff.act, m.staff.tone) : m.customer ? applyCustomer(sc, m.customer) : sc;
      if (!("error" in r)) {
        sc = r;
        render();
      }
    } else if (m.kind === "move") chan.postMessage({ kind: "hello" } satisfies Msg);
  });
  chan?.postMessage({ kind: "hello" } satisfies Msg);

  let error = "";
  function sendStaff(act: StaffAct): void {
    const before = sc.turn;
    const r = applyStaff(sc, act, tone);
    if ("error" in r) return fail(r.error);
    sc = r;
    chan?.postMessage({ kind: "move", turn: before, staff: { act, tone } } satisfies Msg);
    render();
  }
  function sendCustomer(reply: Omit<CustomerReply, "tone">): void {
    const before = sc.turn;
    const full: CustomerReply = { ...reply, tone };
    const r = applyCustomer(sc, full);
    if ("error" in r) return fail(r.error);
    sc = r;
    chan?.postMessage({ kind: "move", turn: before, customer: full } satisfies Msg);
    render();
  }
  function fail(e: string): void {
    error = e;
    render();
  }

  // ---- NPC turns ----
  function npcTurn(): void {
    if (mode !== "npc" || sc.ended || sc.toMove !== other) return;
    setTimeout(() => {
      if (sc.ended || sc.toMove !== other) return;
      if (other === "staff") {
        const m = staffMove(sc, traits, rng);
        const r = applyStaff(sc, m.act, m.tone);
        if (!("error" in r)) sc = r;
      } else {
        const r = applyCustomer(sc, customerMove(sc, persona, rng, mem));
        if (!("error" in r)) sc = r;
      }
      render();
    }, 650);
  }

  // ---- rendering ----
  const toneChips = (): string => `<div class="chips" id="tones">${TONES.map((t) => `<button class="chip ${t === tone ? "on" : ""}" data-tone="${t}">${t}</button>`).join("")}</div>`;

  function logHtml(): string {
    return sc.log
      .map((l) => {
        const mine = l.who === role;
        const snap = role === "staff" ? `<span class="snap">${l.after.rows} options · ${l.after.models.length} models${l.after.models.length ? ": " + l.after.models.slice(0, 3).map((i) => modelById(i).name.replace("iPhone ", "")).join(", ") : ""}</span>` : "";
        return `<div class="msg ${mine ? "mine" : "theirs"}"><span class="meta">${l.who === "staff" ? "Specialist" : "Customer"} · ${l.tone} · face: ${l.expression}</span>${esc(l.text)}${snap}</div>`;
      })
      .join("");
  }

  function staffSide(): string {
    const acts = staffActs(sc);
    if (sc.ended || sc.toMove !== "staff") return `<p class="muted">${sc.ended ? "" : mode === "npc" ? "The customer is replying…" : "Waiting for the customer…"}</p>`;
    const forced = acts.length === 1 && sc.forced;
    // At the start the route questions come first; after that, whichever narrows most.
    const first = (a: (typeof acts)[number]): number => (sc.turn === 0 && a.act.t === "ask" && (a.act.qid === "opening_intent" || a.act.qid === "known_model") ? 1 : 0);
    const asks = acts.filter((a) => a.act.t === "ask" && !a.act.reopen).sort((a, b) => first(b) - first(a) || b.gain - a.gain);
    const reopens = acts.filter((a) => a.act.t === "ask" && a.act.reopen);
    const rest = acts.filter((a) => a.act.t !== "ask");
    const btn = (a: (typeof acts)[number]): string => `<button class="act" data-act='${esc(JSON.stringify(a.act))}'><span>${esc(a.label)}</span><small>${esc(a.hint)}</small></button>`;
    return `${sc.owed ? `<div class="banner">They threw one back; whatever you do next answers it.</div>` : ""}
      ${forced ? `<div class="banner">The customer asked for this, so it is your only move.</div>` : ""}
      <h2>Your tone</h2>${toneChips()}
      <h2>${forced ? "Your move" : "Questions"}</h2>${asks.map(btn).join("") || (forced ? "" : `<span class="muted small">none worth asking right now</span>`)}
      ${rest.length ? `<h2>Other moves</h2>${rest.map(btn).join("")}` : ""}
      ${forced || !reopens.length ? "" : `<details><summary>Reopen an answered question</summary>${reopens.map(btn).join("")}</details>`}`;
  }

  function customerSide(): string {
    const menu = customerMenu(sc);
    if (sc.ended || !menu) return `<p class="muted">${sc.ended ? "" : mode === "npc" ? "The specialist is thinking…" : "Waiting for the specialist…"}</p>`;
    const opts = menu.options;
    const inGroup = (g?: string) => opts.filter((o) => (o.group ?? "") === (g ?? ""));
    const optHtml = (o: (typeof opts)[number]): string =>
      o.param
        ? `<label class="opt"><input type="${menu.multi ? "checkbox" : "radio"}" name="o" value="${esc(o.id)}" data-param="${esc(o.param.prefix)}"> ${esc(o.label)} <input type="number" id="param" min="${o.param.min}" max="${o.param.max}" step="${o.param.step}" value="${o.param.min + 25 * o.param.step}"></label>`
        : `<label class="opt"><input type="${menu.multi ? "checkbox" : "radio"}" name="o" value="${esc(o.id)}"> ${esc(o.label)}</label>`;
    const groups = [...new Set(opts.map((o) => o.group).filter(Boolean))] as string[];
    return `<h2>Your tone</h2>${toneChips()}
      ${menu.pending.kind === "free" ? "" : `<h2>${menu.multi ? "Pick any" : "Pick one"}</h2><div id="opts">${inGroup(undefined).map(optHtml).join("")}${groups.map((g) => `<details><summary>${esc(g)}</summary>${inGroup(g).map(optHtml).join("")}</details>`).join("")}</div>`}
      ${menu.throwbacks.length ? `<h2>…and ask them something</h2><select id="tb"><option value="">nothing</option>${menu.throwbacks.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("")}</select>` : ""}
      ${menu.pending.kind === "free" ? "" : `<p><button class="primary" id="send">Send</button></p>`}
      <details ${menu.pending.kind === "free" ? "open" : ""}><summary>Or do something else</summary>${menu.actions.map((a) => `<button class="act" data-action='${esc(JSON.stringify(a.action))}'><span>${esc(a.label)}</span></button>`).join("")}</details>`;
  }

  function staffPanel(): string {
    const ctx = derive(sc);
    const facts = sc.order.map((qid) => `<span class="tag">${esc(qid.replace(/_/g, " "))}: ${esc(sc.answers[qid]!.picks.join(", "))}</span>`).join("");
    const mood = sc.patience >= 6 ? "calm" : sc.patience >= 3 ? "a little restless" : "close to leaving";
    return `<div class="card"><h2>Staff view</h2>
      <p><b>${ctx.ranked.length}</b> models · <b>${ctx.pool.length}</b> options still fit</p>
      <div class="muted small">Ranking (the customer never sees this)</div>
      ${ctx.ranked.slice(0, 7).map((m, i) => `<div class="rank"><span>${i + 1}. ${esc(m.name)}</span><span class="muted">from ${money(Math.min(...ctx.pool.filter((r) => r.model === m.id).map((r) => r.price)))}</span></div>`).join("") || `<span class="muted">nothing fits</span>`}
      <h2>What they have told you</h2>${facts || `<span class="muted small">nothing yet</span>`}
      <h2>Customer seems</h2><span>${mood}</span></div>`;
  }

  function customerPanel(): string {
    return `<div class="card"><h2>Your visit</h2><p class="muted small">Pick from the menu each turn. You can answer, throw a question back, ask for a demo, change an earlier answer, or leave.</p></div>`;
  }

  function personaPanel(): string {
    if (!(mode === "npc" && other === "customer")) return "";
    return `<div class="card" style="margin-top:12px"><details><summary>Debug: who is this customer?</summary><pre class="small">${esc(JSON.stringify({ target: persona.target, wants: persona.wants, relax: persona.relax, opening: persona.opening, signals: persona.signals, unsure: +persona.unsure.toFixed(2) }, null, 1))}</pre></details></div>`;
  }

  function endBanner(): string {
    if (!sc.ended) return "";
    const e = sc.ended;
    return e.how === "bought"
      ? `<div class="banner sold"><b>Sold:</b> ${esc(modelById(e.sku.model).name)}, ${e.sku.storage}, ${esc(e.sku.colour)}, ${money(e.sku.price)}. The scene ends here; payment would be a different conversation. <button id="again">Play again</button></div>`
      : `<div class="banner left"><b>Ended:</b> ${esc(e.why)}. <button id="again">Play again</button></div>`;
  }

  function render(): void {
    const iMove = sc.toMove === role && !sc.ended;
    const link = mode === "tab" ? `${location.origin}${location.pathname}#role=${other}&vs=tab&room=${roomId}` : "";
    app.innerHTML = `
      <h1>You are the ${role === "staff" ? "phone specialist" : "customer"}</h1>
      <p class="muted small">${mode === "npc" ? `NPC ${other}, seed ${seedN}.` : `Open this in a second tab to be the ${other}: <a href="${link}" target="_blank">${esc(link)}</a>`} <a href="#" id="reset">Change setup</a></p>
      ${endBanner()}
      <div class="layout">
        <div>
          <div class="card"><div class="log" id="log">${logHtml() || `<span class="muted">${role === "staff" ? "The customer has just walked up to you." : "You have just walked up to the phone table."}</span>`}</div></div>
          ${error ? `<div class="banner left">${esc(error)}</div>` : ""}
          <div class="card" style="margin-top:12px">${iMove ? (role === "staff" ? staffSide() : customerSide()) : sc.ended ? "" : `<p class="muted">${mode === "npc" ? "The other side is thinking…" : "Waiting for the other tab…"}</p>`}</div>
        </div>
        <div>${role === "staff" ? staffPanel() : customerPanel()}${personaPanel()}</div>
      </div>`;
    error = "";
    const log = document.getElementById("log");
    if (log) log.scrollTop = log.scrollHeight;
    bind();
    npcTurn();
  }

  function bind(): void {
    app.querySelectorAll<HTMLButtonElement>("#tones button").forEach((b) => b.addEventListener("click", () => { tone = b.dataset.tone as Tone; app.querySelectorAll("#tones button").forEach((x) => x.classList.toggle("on", x === b)); }));
    app.querySelectorAll<HTMLButtonElement>("button[data-act]").forEach((b) => b.addEventListener("click", () => sendStaff(JSON.parse(b.dataset.act!))));
    app.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((b) => b.addEventListener("click", () => sendCustomer({ action: JSON.parse(b.dataset.action!) as CustomerAction })));
    document.getElementById("send")?.addEventListener("click", () => {
      const picks = [...app.querySelectorAll<HTMLInputElement>("#opts input[name=o]:checked")].map((i) => (i.dataset.param ? `${i.dataset.param}${(document.getElementById("param") as HTMLInputElement).value}` : i.value));
      const tb = (document.getElementById("tb") as HTMLSelectElement | null)?.value;
      sendCustomer({ picks, throwback: tb || undefined });
    });
    document.getElementById("again")?.addEventListener("click", () => location.reload());
    document.getElementById("reset")?.addEventListener("click", (e) => { e.preventDefault(); location.hash = ""; location.reload(); });
    app.querySelectorAll<HTMLLabelElement>(".opt").forEach((l) => l.addEventListener("click", () => setTimeout(() => app.querySelectorAll<HTMLLabelElement>(".opt").forEach((x) => x.classList.toggle("sel", !!x.querySelector<HTMLInputElement>("input:checked"))), 0)));
  }

  render();
}
