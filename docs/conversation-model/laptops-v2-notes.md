---
status: working
what: Sourced attribute table for the current Apple AU MacBook line-up (4 models - Air 13/15, Pro 14/16), companion to laptops.json. Every value copied from a fetched apple.com/au page or its embedded product-configuration JSON, nothing from memory.
date: 2026-10-18
source: apple.com/au/macbook-air/specs/, apple.com/au/macbook-pro/specs/, apple.com/au/shop/buy-mac/macbook-air, apple.com/au/shop/buy-mac/macbook-pro (curl, and the preconfigured-SKU buy-page URLs for each colour/chip/memory/storage combination), all fetched 2026-10-18 (public, no login).
---

# Laptops v2 (fetched 2026-10-18)

Source per value is in `laptops.json`. Apple's buy pages are JavaScript storefronts: the static HTML embeds
a `products` array (one entry per sellable SKU, `PRECONFIGURED_BTR` for an in-stock build, `CONFIGURABLE` for
a build-to-order starting point) and a `prices` map keyed by a `priceKey` (`screensize-colour-cpu-gpu` for
Air, `screensize-colour-finish-chip-cpu-gpu` for Pro) giving each listed price. This is the same kind of
embedded-JSON extraction `devices.json` used for the phone buy pages' `storage_tiers`.

## What is modelled: preconfigured SKUs only

Apple sells every MacBook as **build-to-order**: pick a chip tier, then memory and storage are independently
configurable, and the per-step price deltas are computed client-side by JavaScript the static page does not
expose (no `priceDelta`, `memoryPriceDelta` or similar key appears in the fetched HTML of either buy page).
Rather than guess those deltas, this catalogue only models Apple's own **preconfigured ("ready to ship")
SKUs** — fixed part numbers Apple itself lists at a fixed price, the way the phone catalogue's `storage_tiers`
are also Apple's own fixed tiers, not a derived price. This is a deliberate scope decision, not a gap:

- **MacBook Air:** 4 preconfigured SKUs per size (one per colour), all at the base chip/memory/storage
  (13": 8-core GPU, 16GB, 512GB, $2,099; 15": 10-core GPU, 16GB, 1TB, $2,499).
- **MacBook Pro 14-inch:** 7 preconfigured SKUs across the three chip tiers (M5, M5 Pro, M5 Max), 2 colours
  where offered, one nano-texture-display variant.
- **MacBook Pro 16-inch:** 6 preconfigured SKUs across M5 Pro and M5 Max.

This gives 9 laptop models (treating each screen size as a separate `model`, matching how the phone data
treats Pro and Pro Max as separate models) each with a small, real, Apple-priced `preconfigured_skus` array —
the same shape `pool.ts` expects from `tiers` on a phone, so `data.ts`'s normalisation pattern ports directly.
**The full build-to-order configuration space (arbitrary memory/storage combination, any colour at any chip
tier) is out of scope for this catalogue.** `conversation-types.md`'s G3 sketch flagged this as a wrinkle
("this exact configuration in stock becomes a hard fact late in the scene"); the scene built tonight only
reasons about the preconfigured SKUs, and the BTO axis is noted as unbuilt in README.md's "Not done" section.

## Key attributes

| Attribute | Air 13" | Air 15" | Pro 14" | Pro 16" |
|---|---|---|---|---|
| Screen | 13.6" | 15.3" | 14.2" Liquid Retina XDR, ProMotion 120Hz | 16.2" Liquid Retina XDR, ProMotion 120Hz |
| Chip tiers | M5 (8 or 10-core GPU) | M5 (10-core GPU only) | M5, M5 Pro, M5 Max | M5 Pro, M5 Max |
| Base memory | 16GB | 16GB | M5: 16GB; Pro: 24GB; Max: 36GB | Pro: 24GB; Max: 36GB |
| Base storage | 512GB | 1TB (preconfigured) | 1TB (M5, Pro); 2TB (Max) | 1TB (Pro); 2TB (Max) |
| Weight | 1.23kg | 1.51kg | 1.55-1.62kg (chip-dependent) | 2.14-2.15kg |
| Battery (video) | 18 hrs | 18 hrs | 20-24 hrs (chip-dependent) | 22-24 hrs (chip-dependent) |
| Ports | 2x Thunderbolt 4 | 2x Thunderbolt 4 | 3x Thunderbolt 4 (M5) or 5 (Pro/Max) + HDMI + SDXC | 3x Thunderbolt 5 + HDMI + SDXC |
| Colours | Sky Blue, Silver, Starlight, Midnight | same | Space Black, Silver (+ nano-texture finish option on some SKUs) | Space Black, Silver |
| Preconfigured SKUs (this catalogue) | 4 | 4 | 7 | 6 |
| Cheapest preconfigured price | $2,099 | $2,499 | $3,199 | $4,799 |

## Not stated / not extracted

- **Build-to-order price deltas** for any memory/storage/colour/finish combination beyond the preconfigured
  SKUs — see "What is modelled" above. This is the laptop catalogue's equivalent of the phone catalogue's
  "not stated" nulls, but it is a scope line drawn deliberately rather than a page that failed to load.
- **AppleCare pricing** — not shown in AUD on any fetched page (same gap `devices-v2-notes.md` records for
  phones).
- **Trade-in values** — not fetched for laptops this session (the trade-in widget is interactive, same
  limitation noted for phones).
- Per-config Wi-Fi/Bluetooth differences for Pro's M5 vs M5 Pro/Max tiers are stated on the specs page as a
  single difference (Wi-Fi 6E vs Wi-Fi 7) and recorded as such on the model record, not split per-chip-tier
  in the JSON (the schema's `model` granularity is per screen size, not per chip).
- Dimensions/weight are listed per chip tier on the Pro models (heavier Max units); the JSON records the
  stated range as a single string rather than per-SKU, since no bank question currently needs per-gram
  precision (unlike the phone scene's `weightG`, which is per-model not per-configuration for laptops because
  the configuration differences are small compared to the phone line's weight spread).

## Pages fetched

- `https://www.apple.com/au/shop/buy-mac/macbook-air` (curl; embedded `products` and `prices` JSON)
- `https://www.apple.com/au/shop/buy-mac/macbook-pro` (curl; embedded `products` and `prices` JSON)
- `https://www.apple.com/au/macbook-air/specs/` (WebFetch)
- `https://www.apple.com/au/macbook-pro/specs/` (WebFetch)
- Individual preconfigured-SKU buy-page URLs (curl) used only to cross-check base memory/storage against the
  URL slug Apple itself encodes (e.g. `...-16gb-memory-512gb-storage`), not as a separate data source.

No pages failed to load.
