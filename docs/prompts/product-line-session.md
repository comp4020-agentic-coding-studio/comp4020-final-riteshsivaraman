---
status: draft
what: A prompt for a fresh session: design every device in the store as a distinct, correctly named model from the real current product line, with a catalogue, per-family look, table assignment and inspect card. Stops between steps for Ritesh.
date: 2026-10-12
---

# Prompt: the product line

Paste everything below the line into a new Claude Code session opened in this
repo (branch `new-idea`).

---

You are working on an obvious parody of a famous fruit-themed retail store, as a
shared first-person 3D shop (React Three Fiber client, Hono + ws + SQLite
server, shared pure TypeScript in `src/shared`). Read `CLAUDE.md` first, then
`SCOPE.md` (decisions D1 to D37), `docs/graphics-brief.md`,
`docs/customer-journeys.md` and `docs/adr/0004-cases-and-moves.md`. Follow
CLAUDE.md throughout: no invented facts (mark `[TK]` and ask), small commits,
no push, no amend/rebase, nothing secret in the repo, and **stop and ask before
any decision that is expensive to reverse**.

## The job

Today every table carries a generic device ("PHONE", "TABLET"). The customer
conversations (`docs/customer-journeys.md`) need real products: a customer asks
about a specific model, compares two, picks a storage size and a colour, and
the thing they point at on the table is that model. Design **every device in
the store** as a distinct model from the real, current product line, give each
a real name, and make them look different from each other.

## Naming (Ritesh decided this on 2026-10-12, SCOPE D37)

Use the real, current product names and model names, copied from the maker's
own website. Everything else stays invented: **no logo or brand mark** (use the
existing invented ring-and-dot mark), no company name as the store's name (still
`[TK]`), no photographs, no downloaded models/textures/fonts, no box art or
packaging copied. The shop is an obvious spoof and is never presented as
official.

**Do not rely on memory for names, specs or prices.** The line-up changes. Fetch
the maker's pages in this session, record each URL and the fetch date in the
catalogue's source note, and use the Australian pages (the store is Canberra).
Where a page does not state a number, mark it `estimate`, the way
`references/products-phones.md` and `references/products-computers.md` do
(read both, they already hold sourced dimensions to reuse).

## What to produce, in this order. Stop after each step and report.

**Step 1: the line-up (no code).** A document `references/product-line.md`:
every family and model currently sold that a store like this would stock:
phones (each generation on sale, every size and tier), tablets, laptops,
desktops, displays, watches, earbuds and headphones, speakers, trackers, and
the main accessories (cases, chargers, cables, bands). For each model: real
name, family, tier, sizes, colour names as the maker lists them, storage options,
AUD price per storage, key identifying features (camera layout, button layout,
screen shape, materials), and the source URL. Say what you could not confirm.
**Stop.** Ritesh will cut the list to what goes in the store.

**Step 2: the catalogue (shared data).** Replace the placeholders in
`src/shared/catalogue.ts` with the agreed models: stable ids, names, family,
colours, storage options, price. Keep it pure data, importable by the server and
the client, with a spec for integrity (unique ids, every colour used in stock
exists, no price missing). **Do not change the stock table or its key yet.**
Stock is keyed `(product, colour)` today and storage is a new axis: lay out the
real options (put storage in the product id, widen the key, add a SKU table),
with their migration cost, and let Ritesh choose. This is an ADR-worthy
decision (ADR 5). **Stop.**

**Step 3: distinct looks, one family at a time.** For each family, design what
makes each model recognisable at a glance from across a table and up close:
camera arrangement and count, bezels and corner radius, thickness, buttons,
colour finishes, back-glass vs metal, stands and hinges for laptops and
displays, band and case shapes for watches. Build them procedurally in
`src/client/src/gfx/` in new files (the existing phone, computer and device
kits are `phones-geo.ts`, `phones.tsx`, `computers-geo.ts`, `computers.tsx`,
`Device.tsx`; extend, do not rewrite them). Respect the budget in
`docs/graphics-brief.md` (it runs on a phone). Show a still of the family
(`?stage` or a table view; headless Chrome works with `--virtual-time-budget`
and a background process, **macOS has no `timeout`**) and **stop** for Ritesh's
look after each family, as with the people before.

**Step 4: put them on the tables.** Propose, as a table, which model family
stands on which product table and side (the layout is in
`src/shared/layout.json`; `references/table-map.md` is a reading of the
reference photo; the table ids are T1 to T11, one product on each long side).
Ritesh corrects it, then you place them with stable **slot ids** (D28: table and
position) so a case or an event can name "the blue one on T9, left side".
Do not move anything in `src/shared/world.ts` or `layout.json`; draw on them.

**Step 5: inspect shows the model.** The inspect view (D26 to D28) currently
shows the device with no name, price or stock. Add the model name, finish, and
the spec lines from the catalogue as a small card. Prices and stock are shown
only if Ritesh confirms (they bear on the customer-service script). Every
inspect already logs an event; include the model id in it.

## Do not

- Touch the server, the cases and moves work (ADR 4), the staff panel or
  conversations. A later session joins this catalogue to them.
- Write Ritesh's prose (README, PROCESS, ADR text). Draft facts and `[TK]` only.
- Invent a model that is not in the real line-up, or a spec you did not read.
- Add a dependency without a stated reason in the commit.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` and `pnpm exec vitest run` green
  before each commit; add a spec for anything pure (catalogue integrity, slot
  ids unique and stable).
- Every model is different: add a spec that no two models share the same
  identifying parameters (size, camera layout, finish), so a copy-paste that
  makes two models identical goes red.
- A look is not done until Ritesh has seen a still and said so; say that you
  checked a still and what you could not check.
- Append a line to `WORKLOG.md` and a pointer in `CLAUDE.md` "Where things live"
  for each new document.
