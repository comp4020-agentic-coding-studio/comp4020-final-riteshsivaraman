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
CLAUDE.md throughout: no invented facts (mark it as a gap and ask), small commits,
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
placeholder), no photographs, no downloaded models/textures/fonts, no box art or
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
- Write Ritesh's prose (README, PROCESS, ADR text). Draft facts only and mark gaps.
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



# Additional Info 

An Apple Store is arranged less like a traditional electronics shop and more like a minimalist product gallery. The tables are designed to let customers pick up, touch, compare and test devices, with products grouped mainly by product family and model, rather than by technical specifications or colour alone.

## 1. The overall layout

Apple Jamsil, Latest Apple Retail Store in South Korea, Now Open

Buying Apple gear could get easier than ever with 50+ new or refreshed Apple Stores on the way | iMore

Lấy cắp iPhone 15 trưng bày mang về dùng, kẻ gian nhận được tin nhắn kỳ lạ: Đọc xong muốn vứt ngay điện thoại

Walking into a typical Apple Store, you will usually see:

- Long wooden display tables arranged in parallel rows or islands, with generous space between them.
- Products displayed on top, generally spaced evenly in neat rows, with screens facing upwards or angled towards customers.
- A product-family layout, where iPhones are grouped with iPhones, Macs with Macs, iPads with iPads, and so on.
- Small information cards or digital labels next to devices, showing the model name, starting price or key details, depending on the store.
- Accessories on separate shelves or wall displays, rather than mixed in with the main product tables.
- A largely uncluttered appearance — few promotional signs, little visible packaging and no piles of boxed products.

The exact arrangement varies by store size, location and current product lineup, but the basic visual language is consistent.

## 2. What's on each table?

Buying Apple gear could get easier than ever with 50+ new or refreshed Apple Stores on the way | iMore

## iPhone table

The iPhones are normally grouped together on one or more tables.

- By model tier: base iPhone models alongside one another, with Pro models displayed in their own section or in a clearly ordered sequence.
- By generation: current-generation devices are the main focus; older models may be absent or shown in a separate retail area if stocked.
- By size: smaller and larger screen versions are easy to compare side by side.
- By colour: several colour options are displayed together, often with the same model available in multiple finishes.
- By configuration: storage capacity, chip and camera differences are usually explained on labels or the product page, not represented by separate physical devices for every specification.

Customers can pick up a phone, switch between devices, test the camera and compare screens.

FRANCE-TECHNOLOGY-APPLE-STORE

## Mac table

MacBooks are generally laid out in orderly rows with their lids open, so customers can use the keyboards, trackpads and displays.

- By family: MacBook Air and MacBook Pro are separated or arranged in identifiable groups.
- By screen size: different sizes sit beside one another for direct comparison.
- By chip or performance tier: base and higher-performance configurations may be identified through product labels and specifications.
- By finish: colours such as silver, space grey or other available finishes are shown where applicable.
- Desktop Macs: iMacs, Mac minis and Mac Studios may have dedicated displays or stations, depending on the store.

The key distinction is usually the Mac family and size first, then the configuration.

Apple Event April 2021 live updates: iPad Pros, new iMacs announced

## iPad table

iPads are placed flat or at a slight angle, often with their screens on and ready to use.

- By family: standard iPad, iPad mini, iPad Air and iPad Pro.
- By size: smaller and larger screens are placed so the difference is immediately visible.
- By capability: higher-end models can be compared for display quality, performance and accessory compatibility.
- By colour: available finishes are represented by the actual devices on display.
- Accessories: Apple Pencil and keyboard accessories may be demonstrated nearby or attached to selected devices.

The table makes it easy to compare a basic tablet with a more premium model without needing to read every specification first.

New Apple Store design changes prioritize a straightforward shopping experience - 9to5Mac

## Apple Watch display

Watches are usually presented on dedicated stands, fixtures or a specialised table.

- By family: standard Apple Watch, SE and Ultra models, where offered.
- By case size: smaller and larger cases are shown for comparison.
- By material and finish: aluminium, titanium or other available finishes.
- By band: different band materials, colours and styles demonstrate personalisation.

Here, the arrangement emphasises appearance, comfort and fit as much as technical specifications.

Yelp Captcha

## Audio and accessories

Smaller products are commonly displayed on shelves, walls or dedicated fixtures.

- AirPods: grouped by type and generation, where relevant.
- Over-ear headphones: displayed so customers can inspect and try them.
- HomePod: shown as a separate home-audio product.
- Cables, chargers and cases: generally placed on accessory shelves, organised by product type and compatibility.

Accessories are less likely to occupy the main demonstration tables because the tables are primarily designed for testing core devices.

## 3. How are the products actually ordered?

There is a hierarchy to the display. Think of it as several layers of organisation rather than a strict rule that every store follows.

1. Product family

iPhone, Mac, iPad, Apple Watch and accessories each have their own area.

2. Model or tier

For example, iPhone versus iPhone Pro, or MacBook Air versus MacBook Pro.

3. Physical size and design

Different screen sizes, case sizes and body designs sit where customers can compare them.

4. Colour and finish

Available finishes are displayed on real devices, often beside other colours of the same model.

5. Technical specifications

Chip, memory, storage, camera features and connectivity are communicated through labels, comparison information and the devices themselves.

An important distinction: Apple generally doesn't dedicate a separate physical display device to every possible specification combination. For example, two laptops with the same screen size and finish but different memory or storage may look identical. Their configuration differences are communicated through product information and sales systems.

## 4. How a typical table might look from above

Imagine an iPhone table with three product groups, arranged in tidy lines. This is an illustrative layout, not a standard floor plan.

WOODEN DISPLAY TABLE

sorry

Standard

Apple iPhone 15 Pro - acheter sur Galaxus

Pro

Buy the Apple iPhone 15 Pro Max - 256GB - Natural Titanium ( MU793ZP/A 2 ) online - PBTech.co.nz

Pro Max

Product information

Model name · Price · Key features · QR code or further details

Conceptual example of product groupings on a display table. Real stores may use multiple rows, repeat devices, and position models in a different order.

In practice, each group might have several identical demonstration phones, or a selection of finishes, rather than only one device per model. The store may also use separate tables for different iPhone generations or place all the current models together in one long row.

## 5. What is deliberately not organised by specification?

Apple's display approach is visual and experiential, rather than like a computer-components shop.

| Attribute | Typical treatment |
| --- | --- |
| Product family | Separate table, zone or fixture |
| Model and tier | Grouped together or placed in a clear sequence |
| Screen or case size | Side-by-side physical comparison |
| Colour | Actual devices displayed in available finishes |
| Chip and performance | Explained through product information and demonstrations |
| RAM and storage | Usually communicated through configuration information, not separate rows of devices |
| Price | Shown on labels, signs or product information |
| Accessories | Dedicated shelves, walls or adjacent displays |

## 6. The rest of the store

Apple reveals Battersea Power Station shop as latest "evolution of the store" | Apple store interior, Battersea power station, Acoustic baffles

A look inside the Eaton Centre's colossal new Apple store - Toronto Life

New Apple Stores Planned Near Los Angeles, Toronto, and Atlanta - MacRumors

Beyond the main product tables, you'll often find:

- Entrance and central display area: prominent tables featuring core products and current launches.
- Wall displays: accessories and smaller products, with stock arranged neatly by category.
- Service and support area: seating or a Genius Bar-style counter, depending on the store design.
- Today at Apple area: a space for workshops and demonstrations in stores that offer these sessions.
- Checkout and collection: purchases, pickup and support may be handled by staff throughout the store rather than at a traditional checkout counter.

The overall goal is to make the store feel open and consistent: customers can identify the product family at a glance, compare models without being overwhelmed by technical information, and then explore the specifications that matter to them.

In short: Apple Stores typically organise their tables by product family first, model or tier second, physical size and finish next, and detailed specifications through supporting information. The products are spaced evenly, displayed in working condition, and arranged to encourage hands-on comparison rather than simply showing merchandise for sale.