---
status: draft
what: Every family and model Apple AU currently sells (Step 1 of docs/prompts/product-line-session.md), for Ritesh to cut down before anything gets built. Not store content — internal reference data only, no invented names.
date: 2026-10-12
source: apple.com/au pages, fetched live in this session via browser (see per-section URLs). AUD prices and colour names are Apple's own listed figures, exact at time of fetch.
---

# Product line (real, current, Apple AU) — Step 1 reference

**How this was sourced.** WebFetch on several apple.com/au URLs returned pages
with unresolved price-template placeholders (e.g. `{IPHONE16}From
$price.display.smart`) instead of real numbers, and a summary that was
visibly unreliable — I do not trust anything WebFetch returned and none of it
is used below. Everything in this document instead came from loading the
real page in a browser (`mcp__claude-in-chrome`) and reading the rendered
text (`get_page_text` / `find`), which gave real AUD prices and colour
names. Still, this is a live retail site as of **2026-10-12** — prices,
stock and even model availability can change after this date.

**Physical layout is a known gap.** Apple's spec/compare pages describe
components (chip, number of lenses, materials) but rarely describe exact
physical arrangement (where a plateau sits, whether buttons are flush,
corner radius). I did not visually inspect product photos in this session —
everything below about physical arrangement is **text-only** (either
Apple's own copy, or third-party review coverage flagged as such) and must
be checked against a real marketing photo before anyone models it. The
project's own commit history already did this once: pre-launch leak
coverage described the iPhone 18 Pro as having a full-width camera bar, but
the real shipped design (per a real marketing photo, confirmed in commit
`255ce19`) is a square camera plateau. Don't repeat that mistake — verify
physical layout against a photo, not text, before building.

---

## 1. iPhone

Source: https://www.apple.com/au/iphone/compare/ and
https://www.apple.com/au/shop/buy-iphone/{model} (fetched 2026-10-12).

Current AU store lineup (6 lines Apple sells direct; older/Pro generations
like iPhone 17 Pro, 16 Pro, 15-series etc. are listed on the compare page as
"available at authorised resellers" only, not sold directly by Apple — not
included below since this store buys/stocks like the real Apple Store does):

| Model | Tier | Screen | Chip | Colours | Storage / AUD price | Notes |
|---|---|---|---|---|---|---|
| **iPhone Duo** | Foldable flagship (pre-order 16/10, ships 23/10) | 7.6″ inner (foldable) + 5.4″ outer | A20 Pro | Star White, Night Sky | 256GB $3,499 / 512GB $3,899 / 1TB $4,699 / 2TB $5,899 | Titanium frame + hinge cover. Dual rear camera (Main + Ultra Wide only, **no telephoto** — confirmed by third-party hands-on, Apple's own page doesn't state this explicitly as a limitation). No Action button. 254g. |
| **iPhone 18 Pro / 18 Pro Max** | Pro | 6.3″ / 6.9″ | A20 Pro | Burgundy, Glacier, Silver, Black | 256GB $2,099 / 512GB $2,499 / 1TB $3,299 / 2TB $4,499 (18 Pro; Max starts $200 higher) | Aluminium unibody. Triple rear camera (Main w/ variable aperture, Ultra Wide, Telephoto). Camera plateau is a **square plateau** — confirmed against a real marketing photo per project commit `255ce19` (not re-verified by me this session, treat as settled). |
| **iPhone Air** | Slim | 6.5″ | A19 Pro | Sky Blue, Cloud White, Space Black, Light Gold | 256GB $1,899 / 512GB $2,299 / 1TB $3,099 | Titanium frame. Single 48MP rear camera. |
| **iPhone 17** | Standard | 6.3″ | A19 | Lavender, Mist Blue, White, Sage, Black | 256GB $1,549 / 512GB $1,949 | Aluminium frame. Dual rear camera (Main + Ultra Wide). |
| **iPhone 17e** | Value | 6.1″ | A19 | Soft Pink, White, Black | 256GB $1,149 / 512GB $1,549 | No ProMotion, no Dynamic Island, no Camera Control. Single rear camera. |
| **iPhone 16** | Carryover value | 6.1″ | — (prior gen) | Ultramarine, Teal, Pink, White, Black | 128GB $1,349 (only storage tier offered) | Kept on at a lower price, one storage tier only. |

**Could not confirm / flagged:**
- Exact camera-plateau shape and button placement for iPhone Duo, iPhone Air,
  iPhone 17/17e/16 — **text-only, unverified against a photo.**
- "iPhone Duo has no telephoto lens" is third-party hands-on coverage
  (MacRumors/PetaPixel roundups), not Apple's own spec copy — treat as
  likely-true but unverified by Apple's own page.
- Exact chip core counts and full tech-spec list were read from the compare
  page and are accurate as Apple states them (not estimates), but are not
  reproduced in full here — see the source URL for the complete spec sheet.

---

## 2. iPad

Source: https://www.apple.com/au/shop/buy-ipad/{model} (fetched 2026-10-12).

| Model | Tier | Sizes | Chip | Colours | Storage / AUD price |
|---|---|---|---|---|---|
| **iPad Pro** | Pro | 11″, 13″ | M5 | Space Black, Silver | 256GB $1,999 / 512GB $2,349 / 1TB $3,049 / 2TB $3,949 (11″; 13″ +$600). Nano-texture glass option +$1,250 on 1TB/2TB only. |
| **iPad Air** | Mid | 11″, 13″ | M4 | Blue, Purple, Starlight, Space Grey | 128GB $1,249 / 256GB $1,449 / 512GB $1,799 / 1TB $2,299 (11″; 13″ +$350) |
| **iPad** | Entry | 11″ | A16 | Blue, Pink, Yellow, Silver | 128GB $749 / 256GB $949 |
| **iPad mini** | Compact | 8.3″ | A17 Pro | Space Grey, Blue, Purple, Starlight | 128GB $949 / 256GB $1,149 / 512GB $1,499 |

Wi‑Fi + Cellular adds $250–350 depending on model. All current iPads support
Apple Intelligence except the base iPad (A16 chip, explicitly listed as
"not available"). iPad Pro has the only TrueDepth front camera and only
ProMotion display in the family; iPad Pro/Air support Apple Pencil Pro and
Apple Pencil (USB‑C), the base iPad supports Apple Pencil (USB‑C) and the
older 1st-generation Pencil, iPad mini supports Apple Pencil Pro/USB‑C only.

**Could not confirm:** exact bezel widths, corner radius, camera-bump shape
per model — not stated on any page read; **text-only summary of chip/screen
differences only, no physical arrangement confirmed.**

---

## 3. Mac laptops

Source: https://www.apple.com/au/shop/buy-mac/{model}, https://www.apple.com/au/mac/ (fetched 2026-10-12).

| Model | Tier | Sizes | Chip options | Colours | Starting AUD price |
|---|---|---|---|---|---|
| **MacBook Neo** | New (Mar 2026), entry | one size (~13″ class, size not stated on buy page) | Apple-silicon chip derived from iPhone's A18 Pro (per Apple's own March 2026 newsroom post and reviews — **not an "M-series" chip**, unusual for a Mac) | Silver, Blush, Citrus, Indigo | $1,049 (storage/keyboard config only — 256GB or 512GB w/ Touch ID keyboard) |
| **MacBook Air** | Thin-and-light | 13″, 15″ | M5 (two GPU-core options) | Sky Blue, Silver, Starlight, Midnight | 13″ $2,099 / 15″ $2,499 |
| **MacBook Pro** | Pro | 14″, 16″ | M5, M5 Pro, M5 Max | Space Black, Silver | 14″ $3,199 / 16″ $4,799 |

**Could not confirm:** MacBook Neo's exact screen size and resolution (buy
page didn't state it; third-party reviews call it "the cheapest MacBook"
around $599 USD / here $1,049 AU, running macOS on phone silicon — worth a
second check given how unusual that chip choice is for a Mac). Button/port
layout for all three — **text-only, unverified against a photo.**

Note: **Mac Pro (desktop tower) no longer appears in the current Apple AU
lineup** — apple.com/au/mac/ lists only MacBook Neo, MacBook Air, MacBook
Pro, iMac, Mac mini, Mac Studio, plus two displays. Treat Mac Pro as
discontinued unless Ritesh knows otherwise.

---

## 4. Mac desktops

Source: https://www.apple.com/au/shop/buy-mac/{model} (fetched 2026-10-12).

| Model | Chip options | Colours | Starting AUD price |
|---|---|---|---|
| **iMac** | M4 (2-port or 4-port Thunderbolt variant) | Blue, Purple, Pink, Orange, Yellow, Green, Silver | $2,399 |
| **Mac mini** | M6, or M5 Pro | Silver only (no colour options offered) | $1,449 (M6) / $2,699 (M5 Pro) |
| **Mac Studio** | M5 Max, or M5 Ultra | Silver only | $4,299 (M5 Max) / $9,499 (M5 Ultra) |

**Could not confirm:** exact chassis dimensions for any of the three (not
re-sourced this session — `references/products-computers.md` has older,
pre-M5/M6-era sourced dimensions for the previous iMac/Mac mini generation
that may no longer match; check before reusing).

---

## 5. Displays

Source: https://www.apple.com/au/shop/buy-mac/studio-display and
.../studio-display-xdr (fetched 2026-10-12).

| Model | Size | Key features | Starting AUD price |
|---|---|---|---|
| **Studio Display** | 27″ 5K Retina | 12MP Center Stage camera w/ Desk View, studio mics/speakers, Thunderbolt 5 | $2,599 (standard glass, tilt stand) / $3,099 (nano-texture) |
| **Studio Display XDR** | 27″ 5K Retina XDR, mini‑LED | 2,000 nits peak HDR, P3 + Adobe RGB, 120Hz ProMotion-style refresh, same camera/audio as Studio Display | $4,799 (standard glass, tilt+height stand) / $5,299 (nano-texture) |

**Correction (computers-family build pass, 2026-10-12):** not a rename.
Studio Display XDR is a new 27″ model that replaced the discontinued 32″
Pro Display XDR (9to5mac.com, 2026-03-03). The two displays share the same
27″ housing and differ mainly in panel/HDR capability, not size.

---

## 6. Apple Watch

Source: https://www.apple.com/au/shop/buy-watch/{model} (fetched 2026-10-12).

| Model | Case sizes | Case materials | Chip | Starting AUD price |
|---|---|---|---|---|
| **Apple Watch Series 12** | 42mm, 46mm | Aluminium (Dark Bronze, Light Gold, Space Grey — new matt finishes), Titanium, Ceramic (new) | S11 | $649 (aluminium) / $1,249 (titanium) / $1,599 (ceramic) |
| **Apple Watch Ultra 4** | 49mm | Titanium (Black, Natural) | S11 | $1,349 |
| **Apple Watch SE 3** | 40mm, 44mm | Aluminium (Midnight, Starlight) | S10 | $399 (40mm) / $449 (44mm) |
| **Apple Watch Hermès Series 12** | — | Hermès leather/band collab, same case as Series 12 | S11 | $2,409 |
| **Apple Watch Hermès Ultra 4** | 49mm | Hermès collab, same case as Ultra 4 | S11 | $2,589 |

I did not dig into full Hermès band/colour detail — it's a licensed
collaboration line (real Hermès branding on Apple's own product), which may
raise its own parody/trademark question distinct from Apple's own marks.
**Flag for Ritesh**: decide whether Hermès models belong in the store at all
given D6 (obvious spoof) — a third-party luxury brand name is a different
risk than Apple's own, which D37 already covers.

Only Series 12 and SE 3 have interchangeable case sizes relevant to a
display table; Ultra 4 is single-size. Series 12 has the widest material
range (new for this generation, per the "New finishes"/"New" labels on the
page).

**Could not confirm:** exact crown/button placement differences across
materials — **text-only, unverified against a photo.**

---

## 7. AirPods / headphones

Source: https://www.apple.com/au/airpods/compare/ and buy pages (fetched 2026-10-12).

| Model | Form | Colours | AUD price | Key features |
|---|---|---|---|---|
| **AirPods 5** (with Wireless Charging Case) | In-ear | White only | $219 (no case) / $249 (w/ wireless case) | H2 chip, IP57 |
| **AirPods Pro 3** | In-ear, ANC | White only | $429 | H2 chip, up to 3x more ANC than AirPods 5, heart-rate sensing, Hearing Test/Hearing Aid features, IP57 |
| **AirPods Max 2** | Over-ear | Midnight, Starlight, Blue, Purple, Orange (new generation) | $999 | H2 chip per ear cup, Lossless Audio + ultra-low-latency via USB‑C (unique to Max 2), no IP rating |

Older AirPods 4 (w/wo ANC) and original AirPods Max still appear on the
compare dropdown as prior-generation options but were not on the direct buy
flow I checked — **not confirmed whether Apple AU still sells them new**;
flag for a second check if the store wants to stock a cheaper earbud tier.

**Could not confirm:** exact case shape differences beyond the dimensions
on the compare page (which are Apple's own sourced numbers, reliable) —
button/stem layout is **text-only**.

---

## 8. Speakers

Source: https://www.apple.com/au/shop/buy-homepod/{model} (fetched 2026-10-12).

| Model | Colours | AUD price | Features |
|---|---|---|---|
| **HomePod** | Midnight, White | $549 | High-excursion woofer, 5-tweeter beamforming array, Spatial Audio, room sensing |
| **HomePod mini** | White, Blue, Orange, Yellow, Midnight | $199 | Full-range driver, dual passive radiators, temperature/humidity sensor |

Both are smart-home hubs with Siri built in, stereo-pair and multiroom
capable.

---

## 9. Trackers

Source: https://www.apple.com/au/shop/buy-airtag/airtag (fetched 2026-10-12).

| Model | AUD price | Features |
|---|---|---|
| **AirTag** (current generation) | $49 (1-pack) / $165 (4-pack) | "The most findable AirTag yet" per Apple's own current-gen marketing — louder speaker, expanded Precision Finding range vs. prior gen (per Apple copy on the iPhone buy page). Free engraving. |

Apple only sells one tracker product — no separate "trackers" family beyond
AirTag.

---

## 10. Accessories (representative, not exhaustive)

Sourced from the accessories rails on the iPhone/iPad/Watch buy pages
(fetched 2026-10-12) — not every colour/length permutation, per the
sourcing budget for this step.

| Type | Example item | AUD price |
|---|---|---|
| Case | iPhone 18 Pro TechWoven Case with MagSafe — Burgundy | $99 |
| Case | iPhone 18 Pro Clear Case with MagSafe | $79 |
| Charger | MagSafe Charger (2m) | $89 |
| Charger | 20W USB‑C Power Adapter | $29 |
| Battery | iPhone Air MagSafe Battery | $159 |
| Strap | Wrist Strap — Crisp Blue | $45 |
| Stylus | Apple Pencil Pro | $219 |
| Stylus | Apple Pencil (USB‑C) | $139 |
| Keyboard | Magic Keyboard for iPad Air 13″ — Black | $499 |
| Keyboard | Magic Keyboard Folio for iPad (A16) | $399 |
| Folio | Smart Folio for iPad (A16) — Sky | $129 |
| Folio | Smart Folio for iPad mini (A17 Pro) — Light Violet | $95 |
| Watch band | 40mm Olive Sport Band — S/M | $79 |
| Watch band | 46mm Dark Bronze Milanese Loop | $169 |
| Watch band | Apple Watch Hermès 42mm band | $809 |
| Cable | Beats USB‑C to USB‑C Woven Cable (3m) | $45 |

**Not checked:** full case/band colour ranges per phone/watch model, cable
length options, third-party accessory brands sold alongside Apple's own
(Bellroy, MOFT, Tech21, Scosche, Belkin, mophie all appeared on these pages
as "Only at Apple"/stocked third-party accessories — worth knowing the real
store carries non-Apple brands too, but I didn't catalogue them).

---

## Summary of what needs double-checking before models get built

1. **Every physical-layout claim in this document is text-only** (camera
   plateau shapes except iPhone 18 Pro which the project already verified
   against a photo, button placement, bezel/corner radius, hinge
   mechanism look) — get real photos before modelling any of it.
2. **iPhone Duo's "no telephoto lens"** is third-party hands-on coverage,
   not from Apple's own iPhone compare/buy page text — likely true but
   not Apple-sourced.
3. **MacBook Neo's screen size** isn't stated on Apple's AU buy page — only
   found via third-party review coverage (~13″ class, A18 Pro-derived
   chip). Worth a second look since a Mac running an iPhone chip is an
   unusual claim.
4. **"Studio Display XDR"** may be a renamed "Pro Display XDR" — not
   independently confirmed, just flagged because it reads differently from
   what older references might assume.
5. **Mac Pro appears discontinued** from the current Apple AU lineup (not
   on apple.com/au/mac/) — confirm this isn't a page-load issue before
   dropping it from the store.
6. **Apple Watch Hermès lines** bring in a second real brand name (Hermès)
   beyond Apple — a different parody/trademark question than D37 covers for
   Apple's own marks. Needs an explicit decision, not folded into D37 by
   default.
7. Whether Apple AU still sells AirPods 4 / original AirPods Max new
   wasn't confirmed (not in the direct buy flow checked).
8. Accessory colour/length ranges and third-party accessory brands are
   not catalogued in full — only a representative slice per the brief's
   scope.
