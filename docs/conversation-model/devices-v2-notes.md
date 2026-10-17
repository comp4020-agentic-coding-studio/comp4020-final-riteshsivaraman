---
status: working
what: Sourced attribute table for the current Apple AU iPhone line-up (7 models), companion to devices.json. Every value copied from a fetched apple.com/au page, nothing from memory.
date: 2026-10-17
source: apple.com/au/iphone/compare/, apple.com/au/<model>/specs/, apple.com/au/shop/buy-iphone/<model> and apple.com/au/shop/buy-iphone, all fetched 2026-10-17 (curl, public, no login)
---

# Devices v2 (fetched 2026-10-17)

Source per value is in `devices.json`. Specs pages: `https://www.apple.com/au/<slug>/specs/` (Pro and Pro Max share `iphone-18-pro`). Prices: `https://www.apple.com/au/shop/buy-iphone/<slug>` (Pro and Pro Max share `iphone-18-pro`), from the page's product list. "null" means the page does not state it, not that the phone lacks it.

| Attribute | iPhone Duo | 18 Pro | 18 Pro Max | Air | 17 | 17e | 16 |
|---|---|---|---|---|---|---|---|
| Screen | 7.6" inner, 5.4" outer | 6.3" | 6.9" | 6.5" | 6.3" | 6.1" | 6.1" |
| ProMotion 120Hz | yes (both) | yes | yes | yes | yes | "No" (buy-page card) | null |
| Always-On | yes | yes | yes | yes | yes | "No" (buy-page card) | null |
| Dynamic Island | yes | yes | yes | yes | yes | "No" (buy-page card) | yes |
| Peak HDR / outdoor nits | 1,600 / 3,000 | 1,600 / 3,000 | 1,600 / 3,000 | 1,600 / 3,000 | 1,600 / 3,000 | 1,200 HDR (no outdoor figure) | 1,600 / 2,000 |
| Chip | A20 Pro | A20 Pro | A20 Pro | A19 Pro | A19 | A19 | A18 |
| Size mm (W x H x D) | open 164.6 x 117.8 x 5.2; closed 84.1 x 117.8 x 11.3 | 71.9 x 150.0 x 8.75 | 78.0 x 163.4 x 8.75 | 74.7 x 156.2 x 5.64 | 71.5 x 149.6 x 7.95 | 71.5 x 146.7 x 7.80 | 71.6 x 147.6 x 7.80 |
| Weight g | 254 | 211 | 249 | 165 | 177 | 170 | 170 |
| Frame | Titanium foldable design (buy page: titanium frame and hinge cover) | Aluminium unibody | Aluminium unibody | Titanium design (buy page: titanium frame) | Aluminium design | Aluminium design | Aluminium design |
| Colours | Night Sky, Star White | Black, Silver, Glacier, Burgundy | same as Pro | Space Black, Cloud White, Light Gold, Sky Blue | Black, White, Mist Blue, Sage, Lavender | Black, White, Soft Pink | Black, White, Pink, Teal, Ultramarine |
| Storage / AUD | 256GB 3,499; 512GB 3,899; 1TB 4,699; 2TB 5,899 | 256GB 2,099; 512GB 2,499; 1TB 3,299; 2TB 4,499 | 256GB 2,299; 512GB 2,699; 1TB 3,499; 2TB 4,699 | 256GB 1,899; 512GB 2,299; 1TB 3,099 | 256GB 1,549; 512GB 1,949 | 256GB 1,149; 512GB 1,549 | 128GB 1,349 |
| Rear lenses | 48MP Main (+ 2x "optical-quality" crop), 48MP Ultra Wide | 48MP Main (variable aperture), 48MP Ultra Wide, 48MP Telephoto (100 mm, 4x) | same as Pro | 48MP Main (+ 2x crop) only | 48MP Main (+ 2x crop), 48MP Ultra Wide | 48MP Main (+ 2x crop) only | 48MP Main (+ 2x crop), 12MP Ultra Wide |
| Optical zoom (stated) | 2x in, 2x out; 4x range | 8x in, 2x out; 16x range | same | null on specs; buy page "1x, 2x" | 2x in, 2x out; 4x range | null on specs; buy page "1x, 2x" | 2x in, 2x out; 4x range |
| Front camera | outer 12MP f/2.2; inner under-display f/1.8 | 18MP f/1.9 | 18MP f/1.9 | 18MP f/1.9 | 18MP f/1.9 | 12MP f/1.9 | 12MP f/1.9 |
| Top video | 4K Dolby Vision to 120 fps; Cinematic 4K 60 | same + ProRes 4K 120 (external) | same | 4K Dolby Vision 60 fps | 4K Dolby Vision 60 fps; Cinematic 4K 30 | 4K Dolby Vision 60 fps | 4K Dolby Vision 60 fps; Cinematic 4K 30 |
| Video playback (hrs) | 44 outer / 31 inner | 34 | 43 | 27 (40 with MagSafe Battery) | 30 | 26 | 22 |
| Wired fast charge | 50% ~20 min, 60W+ | 50% ~15 min, 60W+ AVS | same | 50% 30 min, 20W+ | 50% 20 min, 40W+ | 50% 30 min, 20W+ | 50% 30 min, 20W+ |
| MagSafe / Qi2 | 25W | 25W | 25W | 20W | 25W | 15W | 25W |
| Water/dust | IP68 | IP68 | IP68 | IP68 | IP68 | IP68 | IP68 |
| 5G / Wi-Fi | 5G sub-6; Wi-Fi 7 | 5G sub-6; Wi-Fi 7 | same | 5G sub-6; Wi-Fi 7 | 5G sub-6; Wi-Fi 7 | 5G sub-6; Wi-Fi 6 | 5G sub-6; Wi-Fi 7 |
| SIM | dual eSIM only | nano-SIM + eSIM | same | dual eSIM only | nano-SIM + eSIM | nano-SIM + eSIM | nano-SIM + eSIM |
| USB-C | yes (USB 3) | yes (USB 3) | yes (USB 3) | yes (USB 2) | yes (USB 2) | yes (USB 2) | yes (USB 2) |
| Action button | "No Action button" (buy page) | yes | yes | yes | yes | yes | yes |
| Camera Control | yes | yes | yes | yes | yes | "No" (buy-page card) | yes |
| Face ID | null (page says Touch ID in side button) | yes | yes | yes | yes | yes | yes |
| Trade-in "from/up to" | up to A$1,595, from A$235 (generic shop page, covers Duo and 18 Pro) | same text | null | null | null | null | A$60 to A$1,595 (iPhone 16 buy-page meta) |
| AppleCare price | null | null | null | null | null | null | null |

Notes on wording: the "2x" lens on Duo, Air, 17, 17e and 16 is stated by Apple as "Also enables 12MP optical-quality 2x Telephoto" from the 48MP Main sensor. 17e and 16 pages say "12MP 2x Telephoto" without "optical-quality". These are not separate physical telephoto lenses on any page I read; I did not infer beyond the quoted text. Trade-in text is a range for a family of eligible trade-in devices, not a per-model value.

## Not stated on any fetched page

Common to all seven: AppleCare+ / AppleCare One prices (the buy pages describe AppleCare in text but show no AUD price on the pages fetched), accessory prices, stock levels, per-model trade-in values for specific old phones (the trade-in widget is interactive).

- iPhone Duo: Face ID (page states Touch ID instead); AppleCare price; hinge/fold durability figures; per-model trade-in.
- iPhone 18 Pro: AppleCare price. (Its trade-in range comes from the generic shop page text naming "iPhone 18 Pro".)
- iPhone 18 Pro Max: own specs page and own buy page do not exist (404); specs come from the shared 18 Pro page. Trade-in not named for Pro Max; AppleCare price.
- iPhone Air: optical zoom range line; trade-in; AppleCare price.
- iPhone 17: trade-in; AppleCare price.
- iPhone 17e: optical zoom range line; outdoor peak brightness; trade-in; AppleCare price. ProMotion / Always-On / Dynamic Island / Camera Control are only stated as "No" on the buy-page comparison cards, not on the specs page.
- iPhone 16: ProMotion / refresh rate; Always-On display (neither appears on the spec page); AppleCare price.

## Pages that failed to load

- https://www.apple.com/au/iphone-18-pro-max/specs/ : 404
- https://www.apple.com/au/shop/buy-iphone/iphone-18-pro-max : 404 (Pro Max is sold on the combined `iphone-18-pro` buy page, which loaded)
- https://www.apple.com/au/shop/buy-iphone/iphone-17-pro : redirects to /au/shop/buy-iphone (no product list)
- https://www.apple.com/au/shop/buy-iphone/iphone-16e : redirects to /au/iphone/
- https://www.apple.com/au/shop/buy-iphone/iphone-16-plus and /iphone-17-pro-max : 404
- Not a failure but a limit: the compare page (https://www.apple.com/au/iphone/compare/) loaded but its prices are unrendered template placeholders (e.g. `{IPHONE17}From $price.display...`), so prices came from the buy pages instead.
- Fetched with curl and the HTML stripped to text; no WebFetch summaries were used. Per-tier prices came from the `products` list embedded in each buy page (sku, fullPrice, name).

## Other models seen (not extracted)

Only listed in the compare page's model dropdown (https://www.apple.com/au/iphone/compare/), not on the Shop iPhone page (https://www.apple.com/au/shop/buy-iphone), which lists only the seven in scope. The compare page marks the older ones "Available at authorised resellers".
- iPhone 17 Pro, iPhone 17 Pro Max
- iPhone 16 Pro, iPhone 16 Pro Max, iPhone 16 Plus, iPhone 16e
- iPhone 15 Pro, 15 Pro Max, 15, 15 Plus, and older models down to iPhone 7 (dropdown only)

## Differences from devices.md (old sheet fetched 2026-10-12)

No price disagrees. No colour disagrees. Every old price, colour list and tier matches the 2026-10-17 pages.

- 18 Pro Max prices: old sheet had "$200 higher, exact [TK]". Now filled: 256GB 2,299; 512GB 2,699; 1TB 3,499; 2TB 4,699. This is exactly +$200 at every tier over the 18 Pro.
- iPhone Duo "no telephoto (third-party report)": Apple's page lists two lenses (Fusion Main, Fusion Ultra Wide), agreeing with "no separate telephoto", but also says the Main "enables 12MP optical-quality 2x Telephoto". Wording differs; the third-party source is not needed any more.
- iPhone Duo "No Action button": confirmed by buy-page text "— No Action button".
- iPhone 16 chip: old sheet "prior gen"; page states A18 chip.
- iPhone 17e "No ProMotion, no Dynamic Island, no Camera Control": confirmed by buy-page cards (plus no Always-On).
- iPhone Air "Titanium frame": specs page says "Titanium design"; buy page says "Titanium frame". Both recorded.
- Old sheet gaps now filled: weights, battery hours, water resistance (IP68 on all), charging, dimensions, megapixels, front cameras, trade-in ranges (where shown). AppleCare prices remain unknown.
