---
status: draft
what: ADR 5 --- storage becomes a real axis of a product's stock key, alongside colour. Facts filled in; "Why this" and "What would change this" are [TK] for Ritesh.
date: 2026-10-12
---

# ADR 5: storage joins the stock key

## Context

`docs/prompts/product-line-session.md` (Step 2) flagged that a real catalogue
(SCOPE D37) needs storage as a selectable option — a customer picks a size as
well as a colour — but `stock` and `reservations` were keyed `(product,
colour)` only, from the placeholder catalogue built before real products
existed. This is a persistence decision (week 8: a stored key is expensive to
widen again later, once real reservations exist against it), so it is
recorded here rather than folded quietly into a geometry commit.

## What was decided (Ritesh, 2026-10-12)

Widen the key now, in the same change that replaces the placeholder catalogue
with real products (`references/product-line.md`) — not fold storage into
the product id, and not defer the schema change to a later session.

## Options considered

| Approach | Cost |
|---|---|
| **A. Fold storage into the product id** (`iphone-18-pro-256gb` as its own row) | Cheapest migration (none — just more catalogue rows) but a case or event that names "the iPhone 18 Pro" now has to parse an id to find the model, and switching a customer's storage mid-conversation means switching `product` entirely. |
| **B. Widen the key**: `stock`/`reservations` gain a real `storage` column, primary key becomes `(product, colour, storage)` | A real migration (SQLite can't alter a primary key in place, so `stock` is rebuilt) and every stock/reservation call site gains a third argument. Keeps "product" meaning one model, independent of configuration. **Chosen.** |
| C. A separate SKU table (`product_id, colour, storage` -> `sku_id`), stock keyed by `sku_id` | Most normalised, but adds a layer and a join nothing yet needs; not worth it until variants multiply beyond phones. |

## What actually changed

- `src/server/migrate.ts`, migration 4: rebuilds `stock` with primary key
  `(product, colour, storage)` (no foreign-key dance needed — nothing
  references `stock`, and it references nothing, per CLAUDE.md's gotcha
  note); `reservations` gains a plain `storage` column (its key is `id`, so
  no rebuild).
- `src/server/stock.ts`: `takeOne`/`stockOf`/`seedStock` all take `storage`
  as a real argument now.
- `src/shared/catalogue.ts`: `Product.storageOptions`/`priceByStorage` hold
  the real sourced sizes and AUD prices; `START_STOCK` is keyed three deep
  (product → colour → storage).
- **`src/shared/conversation.ts` is untouched.** The "phones" script still
  only asks for a colour — no storage picker exists in the conversation flow
  yet, matching `docs/prompts/product-line-session.md`'s boundary ("do not
  touch conversations... a later session joins this catalogue to them"). A
  new `defaultStorage()` helper in `catalogue.ts` names the first (cheapest)
  storage option Apple lists; `src/server/service.ts` resolves every stock
  read/write to that SKU until a real picker exists.

## What would change this

[TK — Ritesh]

## Consequence

Today's customer still only ever buys the cheapest storage of whatever
colour they pick — nothing user-visible changed. What changed is that the
database already has a real place to put a storage choice, so the session
that builds the picker (alongside, or as part of, ADR 4's cases-and-moves
work) adds a conversation node and a `storage` field on the reserve effect,
not another migration.
