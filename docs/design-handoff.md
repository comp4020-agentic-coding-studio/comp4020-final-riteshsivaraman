# Design handoff: "Dearly"

Source of truth for Seen's visual design. The actual app gets built against
this. Facts below are extracted directly from the design exploration's code,
not invented — `[TK]` marks anything that still needs a call from Ritesh.

**Provenance:** this came out of a standalone frontend design exploration at
`/Users/riteshs/Documents/email-app-design-exploration/` (Preact + Vite,
static mock data, no backend) — deliberately built *without* reading this
repo's spec, so the visual direction wouldn't be anchored to the brief before
it had its own identity. It went through five passes (cream/serif →
ops-console modern → sarcastic/sketchy/haunting → pushed-too-far dark-horror
→ pulled back to this one) before landing. That exploration directory is not
part of this repo and isn't tracked here — treat this doc, not that
directory, as the spec going forward.

## Identity, one line

A calm, Notion-quiet productivity surface where the dread lives in exactly
two small details instead of in the whole room — which is the right shape
for "someone's always watching": the UI should look boringly trustworthy
first, and only reveal that it's watching back on a second look.

## Color tokens

```css
--surface: #ffffff;       /* main background */
--sidebar-bg: #f7f6f3;    /* sidebar surface, barely-there contrast */
--panel: #ffffff;
--panel-muted: #f7f6f3;   /* hover states, input backgrounds */
--ink: #26231e;           /* primary text */
--muted: #6f6a60;         /* secondary text */
--faint: #a7a195;         /* tertiary / metadata text */
--line: #ebe8e2;          /* hairline borders */
--line-strong: #ddd8cf;   /* focus/active borders */

--signal: #6e2f2a;        /* the one accent: desaturated brick-ink red */
--signal-soft: #f4e8e5;   /* accent's pale wash, for selection/active bg */
--signal-ink: #8a3f38;    /* accent hover state */
--danger: #9a3b32;

--onyx: #1c1a16;          /* near-black, reserved for "stamped" chrome:
                              compose header, toast, send button hover,
                              density-toggle active state */
--bone: #f3efe6;          /* light text that lives only on --onyx */
```

Rule: `--signal` is used sparingly — unread mark, selected row, primary
buttons — **never as a surface fill**. If a future addition wants to add a
second accent color, that's a decision to flag, not a default to reach for;
the one-accent discipline is load-bearing for the "quiet" read.

## Type

- **UI/headings:** Inter — one face for everything, no display/serif face.
  This was a deliberate reversal from an earlier pass (typewriter face on
  every heading) that read as too costumed.
- **Metadata only:** IBM Plex Mono — timestamps, email addresses, counts,
  category tags. Never body copy.
- No third face. No italics for emphasis — weight and color do that work.

## Layout

- Three-pane shell: sidebar (`232px`) + message list (`376px`) + reading
  pane (fills remainder). Grid-based (`display: grid`), not flex, at the
  shell level.
- Radii: `6px` / `8px` / `10px` (sm/md/lg) — consistent, small, no
  "hand-cut" irregular radii (that was tried and cut).
- Borders: solid `1px` hairlines only. No dashed/perforated borders (tried
  and cut — read as costume, not texture).
- No rotation, no grain/texture overlays, no per-row misalignment anywhere
  in the shell (all tried in the dark-horror pass, all cut as "accumulation
  reads as AI-horror-theme, not precision").
- Responsive breakpoints: `1180px` (list pane narrows), `980px` (sidebar
  collapses to icon rail), `860px` (list/reading pane stack, back button
  appears).

## The two signature devices — do not add a third

This is the whole "foreboding" budget. Keep it at exactly two.

1. **Unread mark:** a hand-inked asterisk (`✳`), rotated `-8deg`, color
   `--signal`, replacing what would conventionally be a plain dot. This is
   the one permitted "sketchy" touch in the entire UI.
2. **Ghost-read line:** in the reading pane's message-meta block, a quiet
   second line under the sender/time — small (`11px`), `--muted` color,
   monospace, reading **"Also opened {time}. Not by you."** — shown only on
   a subset of messages (not every email; it should be the kind of thing a
   user half-notices, not a constant banner). Exact trigger condition for
   *which* messages show it is `[TK]` — the design exploration applied it
   to a handful of messages by hand; the real app needs a real rule (e.g.
   tied to an actual "someone else viewed this" event in the `events` log —
   this is a natural hook into the event-log invariant in the main
   `CLAUDE.md`, not a cosmetic string).

Any future unsettling detail should ask "does this replace one of the two,
or does it make three" before shipping — three is the threshold where the
last pass tipped into costume.

## Copy voice

Deadpan, calm, mock-corporate. The system is never alarmed about things a
person would be alarmed about. Examples already in use (tone reference, not
literal copy requirements — real microcopy still needs real content):
- Storage note: "3.4 GB kept of 15 GB. It only grows."
- Discard toast: "Discarded. Nothing is, actually."
- Empty reading pane: implies waiting rather than absence.

Keep this in active voice, sentence case, no exclamation points, no jokes
that announce themselves as jokes. The dread is in how calm it is, not in
punchlines.

## Component inventory (for mapping to real components)

From the exploration's `src/components/`: `Sidebar`, `TopBar`,
`MessageList`, `ReadingPane`, `Compose`. State lived in one `App.jsx`
(folder/label/category filters, search query, density, selected message,
compose draft, toast) — a reasonable starting shape, not a contract; the
real app's actual data flow (server state, event log writes, auth) will
dictate the real component/state boundaries. Don't port the exploration's
flat `useState` pile wholesale — it was fine for static mock data, not for
an app with a real backend and the event-log invariant.

Density toggle (cozy/compact), category tabs (Primary/Social/Promotions/
Updates style), star/flag, label dots, attachment chips, and a Gmail-style
slide-up compose (open → minimize → expand → discard/send) are all real UI
states the exploration implemented and verified live — safe to treat as
settled interaction patterns, not just mockup chrome.

## Open questions `[TK]`

- Exact trigger rule for the ghost-read line (see above).
- Whether the two signature devices need variants for mobile/narrow widths
  — exploration verified responsive collapse structurally but didn't
  specifically re-check the ghost-read line's legibility at `860px`.
- Dark mode: not attempted in any pass. `[TK]` whether Seen needs one.
