# חקלאי רווחי, Style Reference

> Field green on white, a live profit number a tired farmer can read from an arm's length away, in direct sun, without his glasses.

**Theme:** light (only, see rationale below)
**Direction:** RTL Hebrew, mobile, voice-first
**Tracks:** PRD v3.0 (20.08.2026), a from-scratch rewrite. This document has been re-synced to match, not incrementally patched.

> ### ✍️ House style: no long dashes, no tables in prose
>
> This project forbids the em-dash and en-dash characters everywhere, in prose, in code, in UI copy. Use a colon, a comma, or a regular hyphen instead. This project also avoids markdown tables in newly written explanatory prose, the collaborator on this project finds tables hard to read; the existing reference tables below (color tokens, type scale, icon maps) predate that preference and are genuine lookup data, not prose, so they stay as tables. New writing in this document should default to plain paragraphs.

> ### ✓ Naming decision resolved
>
> 1. **Color tokens renamed from `--color-yevul-*` to `--color-field-*`**, matching the product's name ("חקלאי רווחי"). Applied throughout this document and regenerated into `design.html`.
> 2. `--color-profit-600` / `--color-loss-600` remain semantically separate from brand green, that separation is load-bearing, not cosmetic, and doesn't change with the token rename.

> ### What changed in this revision
>
> PRD v3.0 is built around four independent records, a Plot, a Task, a Journal (log) entry, and a Money movement, and every screen is a view over one or more of them. That reshaped the navigation and added several component families that did not exist before:
>
> - **Navigation rebuilt around four tabs and one center action:** בית (home), חלקות (plots), a center **Capture** tab that opens a three-way picker (Expense, Task, Journal, with a long-press straight to the mic), כסף (money, merging the old separate ledger and reports destinations), and עוד (settings). See _Bottom Tab Bar_ and _Capture Tab & Sheet_.
> - **Journal is now a first-class, independent record**, not a byproduct of tasks. It has its own entry sheet, its own list, and two ways in: automatically when a costed task is marked done and the farmer confirms, or directly through the Capture Sheet with no task involved. Spray is one entry type among several (plow, seed, fertilize, spray, irrigate, prune, thin, harvest, repair, other), and it additionally gets **its own dedicated screen**, because what a farmer must show a regulator or an export company needs to be found without digging through a filter. See _Components: Journal_.
> - **Task completion now asks two independent questions**, save to the journal, and record as an expense, never either one automatically. See _Completion Prompts_.
> - **Plot detail is a real screen now**, four tabs (Profitability, Tasks, Journal, Expenses), not just an implied destination behind a tappable card. Profitability carries a prominent **Forecast Update** action, since the PRD is explicit that projected income is always an estimate and must be trivially easy to revise. See _Plot Detail Screen_ and _Forecast Update_.
> - **Pricing display flips to monthly-first.** The headline number on both the Plans Screen and the Upgrade Gate Sheet is now the monthly charge, with the annual total shown as a small informational line beneath it, not the other way around. See _Plans Screen_ and _Upgrade Gate Sheet_.
> - **Sharing, freemium and the offline-to-queue architecture carry over unchanged** in their visual treatment (Task Row, Data Freshness Chip, Worker Mode, the three-tier Plans Screen), only the pricing numbers and headline hierarchy moved.

חקלאי רווחי speaks in a calm, plainspoken voice: a grounded field green (`#1D6B45`) carries brand moments, active states and the primary microphone action, while the interface itself stays almost entirely white, black-on-white text, and hairline borders, because the product lives in direct outdoor sunlight where soft shadows and pale tints wash out. Numbers are the hero: the live profit/loss figure is the largest thing on the screen, held to a fixed-width digit grid so it doesn't jitter as it updates (see the typography section, this font needed a real workaround, not just a CSS property). Profit and loss are never color-only, every figure carries a sign (+/−) and a small directional glyph, because roughly 1 in 12 men are red‑green colorblind and this is a financial tool, not a mood board. One typeface (OedooPro, a purchased, licensed family) does everything, at sizes and weights meaningfully larger than a typical consumer app, because the reading distance, lighting and average age of this audience all argue against being clever with type.

---

## Professional read on the brief

Four things in the brief are right and worth defending, one needs a caveat, and there are two gaps worth naming.

**Right, and worth defending explicitly:**

- **Light mode.** Correct call, not just a preference: dark UI in direct sun has near-zero effective contrast (glare on the glass washes out dark backgrounds far worse than light ones), and OLED-style pure blacks look muddy/gray outdoors. This system is light-only by design, not "light mode as the default theme."
- **Green as primary.** Works on two levels at once, brand color _and_ the emotional shorthand for "you're making money", which is unusually efficient for a P&L app. Kept it, but see the caveat below.
- **Rounded, friendly, not tight like Wise.** Correct instinct. Wise's −0.03em tracking and 900-weight block caps are legible on a designer's laptop; at arm's length in a field they blur into gray mush. This system uses zero negative tracking anywhere.
- **High accessibility for 55-70.** Right target, but "accessible" needs to mean specific numbers, not a vibe. See the type scale and contrast floors below.

**Needs a caveat: green as the _brand_ color.**
The app's hero number flips between profit (green) and loss (red) constantly, that's the whole point of the product. If green is _also_ the permanent brand/chrome color, a bad week can visually clash with a UI that's aggressively green everywhere, and worse, a farmer glancing quickly could subconsciously read "green screen = I'm fine" even when the actual number is red. This system solves it by treating brand-green and profit-green as **separate tokens** that happen to share a hue family, and by keeping the app's chrome (nav, cards, backgrounds) neutral white/ink rather than green-washed, green is reserved for the primary action (the mic button) and for genuinely positive numbers. Loss uses a warm clay red (`#C1502E`, "Adama"), not a harsh alarm red, so it reads as "attention" rather than "error."

**Three things not in the brief, found by inspecting the actual font files, not assumed:**

1. **OedooPro's Hebrew coverage is real and complete.** This is a purchased/licensed family (`fonts/oedoopro-*-webfont.woff2`, 8 static weights: Thin, ExtraLight, Light, Book, Regular, Medium, Bold, Black). Checked the glyph tables directly with `fontTools` rather than trusting the font's name: every weight covers the full Hebrew alphabet, niqqud (vowel points, U+05B0-05C7), and geresh/gershayim, consistently across all 8 files. That's a genuine, verified pass on the Hebrew-first requirement, and it gives the system real weight range (100-900) instead of one variable font faking every step.
2. **OedooPro has no ₪ glyph, in any weight.** Also confirmed directly in the cmap, not assumed. Every price and figure in this product needs the shekel sign, so the font stack keeps a system fallback (`'OedooPro', ui-sans-serif, system-ui, ...`) specifically so ₪ renders from the platform's Hebrew font on a per-character basis, invisible to the user, but a real dependency, not a decorative fallback.
3. **OedooPro's digits are proportional-width with no OpenType `tnum` feature.** Measured the digit advance widths directly (e.g. Black weight: "1" is 0.468em, "4" is 0.666em), `font-variant-numeric: tabular-nums` has nothing to invoke here, so on its own the live P&L number would visually reflow every time it updates. Fixed with a small technique instead of a CSS property: every live figure wraps each digit in a fixed-width span (`.tnum-digit`, 0.68em) via a tiny script, so digits sit on a stable grid regardless of which numerals appear. Numerals also carry `direction: ltr; unicode-bidi: isolate;` per the PRD's own note (Appendix A.6) on embedding LTR numbers inside RTL sentences.

---

## Tokens, Colors

| Name                      | Value     | Token                | Role                                                                                                                                                                                                                                                 |
| ------------------------- | --------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field 700 (Field, deep)   | `#1D6B45` | `--color-field-700`  | Text-safe brand green, links, active nav icon, small brand marks, focus rings. The only green allowed on body text.                                                                                                                                  |
| Field 500 (Growth)        | `#2FA06A` | `--color-field-500`  | Icon-only fills, the mic button glyph, active tab indicator. **Not** for filled buttons with a text label: white text on Field-500 measures 3.3:1, below the 4.5:1 floor. Use Field-700 as the fill wherever the button carries a text label.        |
| Field 300                 | `#8FD6AE` | `--color-field-300`  | Decorative fill only, chart bars, progress tracks, disabled-state hints.                                                                                                                                                                             |
| Field 100 (Sprout wash)   | `#E1F4E9` | `--color-field-100`  | Pale tint for selected states, positive-figure card backgrounds, success chips.                                                                                                                                                                      |
| Profit 600                | `#26804C` | `--color-profit-600` | Semantic, positive P&L figures only. Deliberately a distinct token from Field even though the hue is close, so re-theming brand color never silently changes what "profit" looks like.                                                               |
| Adama 600 (Soil red)      | `#C1502E` | `--color-loss-600`   | Semantic, negative P&L figures, destructive actions. Warm clay red, not a clinical alarm red, reads as "pay attention" not "you broke something."                                                                                                    |
| Adama 100                 | `#FBE7DF` | `--color-loss-100`   | Pale wash for loss-state card backgrounds and low-emphasis warning chips.                                                                                                                                                                            |
| Wheat 800 (Harvest, deep) | `#8A5A12` | `--color-wheat-800`  | **Text-safe** wheat, overdue-task labels, pending-chip text, fuel/harvest category icons. 6.6:1 on Paper. Wheat-500 fails as text; this is its readable counterpart. _(Referenced throughout the original icon spec but never defined, added here.)_ |
| Wheat 500 (Harvest gold)  | `#E3A233` | `--color-wheat-500`  | Secondary accent, OCR/scan affordances, queued-write states, pending badges, the overdue banner's left rule. Never used for pass/fail meaning, and never as text.                                                                                    |
| Wheat 100                 | `#FBEED2` | `--color-wheat-100`  | Pale wash for pending and overdue card backgrounds.                                                                                                                                                                                                  |
| Sky 500                   | `#3E8FD0` | `--color-sky-500`    | Informational only, sync status, tooltips. Used sparingly; this is not a three-accent system.                                                                                                                                                        |
| Ink 900                   | `#16231C` | `--color-ink-900`    | Primary text, headings, icon strokes. Warm near-black (green-tinted), not pure `#000`, softer under bright screens.                                                                                                                                  |
| Slate 600                 | `#56655D` | `--color-slate-600`  | Secondary text, field labels, timestamps, helper copy.                                                                                                                                                                                               |
| Mist 200                  | `#E7EFE9` | `--color-mist-200`   | Dividers, disabled fills, subtle section backgrounds.                                                                                                                                                                                                |
| Mist 100                  | `#F3F7F4` | `--color-mist-100`   | Card surface alternate, used when a card needs to sit apart from pure white without a border.                                                                                                                                                        |
| Border 200                | `#D6E0D9` | `--color-border-200` | Hairline borders, the primary elevation cue in this system (see Elevation).                                                                                                                                                                          |
| Paper                     | `#FFFFFF` | `--color-paper`      | Page canvas. Pure white, deliberately, see rationale under Do's/Don'ts.                                                                                                                                                                              |

**Contrast floors (non-negotiable, not aspirational):** body text on Paper ≥ 7:1 (AAA, sunlight, not just AA), large numerals ≥ 4.5:1 minimum even at Field-500 fill, every interactive element ≥ 3:1 against its immediate background. Any token pairing that fails these on your build should be treated as a bug, not a style note.

**Three separate semantic axes, never let them borrow each other's colors:**

| Axis        | Positive / calm                       | Attention                  | Where                          |
| ----------- | ------------------------------------- | -------------------------- | ------------------------------ |
| **Money**   | Profit-600                            | Loss-600                   | P&L figures only               |
| **Urgency** | Slate-600 (no date) / Ink-900 (dated) | **Wheat-800 on Wheat-100** | Task due dates, overdue banner |
| **Sync**    | Field-100 chip                        | Wheat-100 chip             | Data freshness, queued writes  |

Overdue tasks use **wheat, never Loss-600**. A task the farmer hasn't gotten to is not an error and not a loss, it's a nudge. Reserving red for money keeps red meaningful: on this product's home screen, red should mean exactly one thing.

---

## Tokens, Typography

### OedooPro, the only typeface in the system. A purchased, licensed family (`fonts/oedoopro-*-webfont.woff2`), 8 real static weights, not a single variable font faking the range. Verified by inspecting the font's glyph tables directly: full Hebrew coverage (letters, niqqud, geresh/gershayim) on every weight, consistent across the family. · `--font-oedoopro`

- **Source:** Local, licensed asset, `fonts/oedoopro-{weight}-webfont.woff2`. Not a Google Font; no CDN dependency.
- **Weights available:** 100 Thin, 200 ExtraLight, 300 Light, 400 Book, 500 Regular, 600 Medium, 700 Bold, 900 Black
- **Weights actively used in this system:** 400 (Book, body default), 600 (Medium, labels, chips, active states), 700 (Bold, card titles, buttons), 900 (Black, hero P&L number, screen titles). 100/200/300 are available but reserved, see the accessibility note below.
- **Fallback:** `'OedooPro', ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`, this fallback is load-bearing, not decorative: OedooPro has no ₪ glyph in any weight (verified), so every shekel sign in the product renders from the system fallback, per character, automatically.
- **Letter spacing:** `0` at every size. No negative tracking anywhere in this system, that is a deliberate, permanent departure from tight/display-heavy references like Wise.
- **Numerals:** OedooPro's digits are proportional-width with no OT `tnum` feature (verified via `hmtx`), so `font-variant-numeric: tabular-nums` alone does nothing here. Every live-updating figure (P&L hero, plot cards, expense amounts) instead wraps each digit character in a fixed-width `.tnum-digit` span (0.68em, centered) via a small script, so the figure holds a stable width as its value changes. Currency/quantity spans additionally carry `direction: ltr; unicode-bidi: isolate;` inside RTL sentences.
- **Accessibility guardrail:** Thin/ExtraLight/Light (100-300) should not be used for body text or any UI element below 32px, thin strokes lose contrast fast in direct sunlight, which is the wrong failure mode for a 55-70 audience. Reserve those weights, if used at all, for large decorative headline moments only.

### Type Scale

Deliberately larger than a typical consumer app default at every step, this is the accessibility spec, not a suggestion.

| Role       | Size | Weight | Line height | Token               | Usage                                                                                           |
| ---------- | ---- | ------ | ----------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| micro      | 13px | 600    | 1.4         | `--text-micro`      | Sync timestamps, legal fine print, used as rarely as possible                                   |
| caption    | 15px | 600    | 1.4         | `--text-caption`    | Chip labels, field hints                                                                        |
| body-sm    | 17px | 400    | 1.5         | `--text-body-sm`    | Secondary body copy, list metadata                                                              |
| body       | 19px | 400    | 1.55        | `--text-body`       | Default body text, this system's "16px"                                                         |
| body-lg    | 22px | 400    | 1.5         | `--text-body-lg`    | Confirmation-sheet field values, primary reading copy                                           |
| subheading | 26px | 700    | 1.3         | `--text-subheading` | Plot card titles, list section headers                                                          |
| heading-sm | 34px | 700    | 1.2         | `--text-heading-sm` | In-screen section headers                                                                       |
| heading    | 44px | 900    | 1.15        | `--text-heading`    | Screen titles                                                                                   |
| heading-lg | 60px | 900    | 1.05        | `--text-heading-lg` | Per-plot profit figures on cards                                                                |
| display    | 84px | 900    | 0.98        | `--text-display`    | The live farm-level P&L number on the home dashboard, the single largest element in the product |

**Minimum floor:** nothing in the shipped product should render below 15px. If a design calls for smaller, the answer is fewer words, not a smaller token.

---

## Tokens, Spacing & Shapes

**Base unit:** 4px
**Density:** generous, this is not a data-dense dashboard; it is a small number of large, unambiguous things per screen (PRD §3, "מסך אחד ברור עדיף על דוח מלא").

### Spacing Scale

| Name | Value | Token          |
| ---- | ----- | -------------- |
| 4    | 4px   | `--spacing-4`  |
| 8    | 8px   | `--spacing-8`  |
| 12   | 12px  | `--spacing-12` |
| 16   | 16px  | `--spacing-16` |
| 20   | 20px  | `--spacing-20` |
| 24   | 24px  | `--spacing-24` |
| 32   | 32px  | `--spacing-32` |
| 40   | 40px  | `--spacing-40` |
| 48   | 48px  | `--spacing-48` |
| 64   | 64px  | `--spacing-64` |
| 80   | 80px  | `--spacing-80` |

### Border Radius

| Element            | Value                   | Note                                                                                                           |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| chips/tags         | 9999px                  |                                                                                                                |
| buttons            | 9999px                  | Pill, large touch target, unambiguous "tap me" shape                                                           |
| cards              | 20px                    | Soft, not sharp, friendly without going full-pill (pill cards at this content density look childish, not warm) |
| large cards / hero | 28px                    | Home dashboard hero card, paywall card                                                                         |
| bottom sheets      | 28px (top corners only) | Voice/OCR confirmation                                                                                         |
| inputs             | 16px                    |                                                                                                                |

### Touch Targets

**56px minimum** on every tappable element, not the platform default of 44px. This is a deliberate accessibility choice for an outdoor, often-gloved, 55-70 audience. The primary mic button is **88px**.

---

## Tokens, Icons

**Style:** Outline/line icons only, no filled or duotone icons anywhere in the product. 2px stroke at the 24px grid, **round line caps and round line joins** (not miter/butt), this is what actually reads as "friendly rounded" in an icon, the same way OedooPro's letterforms do. Never mix a stroke icon next to a filled one in the same context (e.g. don't pair an outline nav icon with a filled active-state icon, see the active-state rule below instead).

**Library: [Lucide](https://lucide.org)** (MIT license, free). Reasons, not just a default pick:

- Its default export is already 24×24, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`, i.e. it matches this system's spec with zero configuration, not by coincidence.
- Full SVG source, so every icon recolors via `currentColor`, no icon font, no build step beyond copying markup, works identically in React Native (`lucide-react-native`) and plain web.
- Deep enough set to cover agriculture-adjacent categories without inventing custom iconography: `fuel`, `sprout`, `bug`, `droplets`, `wheat` all exist natively and read correctly at a glance, verified by pulling the real SVG source for every icon below, not assumed from the icon's name alone.

**Alternative: [Heroicons](https://heroicons.com)** (MIT license, free) is an acceptable fallback if the team is already standardized on it (e.g. via Tailwind). Two adjustments needed if used instead: its "outline" set defaults to **1.5px stroke at 24px**, not 2px, bump it to 2px to hold this spec, since 1.5px is the first thing to disappear in direct sunlight. It also has a much smaller category-icon vocabulary than Lucide (no direct `fuel`, `sprout`, or `wheat` equivalents), so several category icons below would need a Heroicons substitute or a custom SVG. Lucide is the primary recommendation for this reason, less improvisation, less drift from spec over time.

**Sizing:**

| Context                                       | Size | Stroke                                                                                            |
| --------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| Bottom nav, category icons, most UI           | 24px | 2px                                                                                               |
| Inline/chip icons (sync status, small badges) | 18px | 1.75px (scale down proportionally, never below 1.5px)                                             |
| Mic glyph inside the FAB                      | 32px | 2.5px (scales up with the button, stays legible against the green fill)                           |
| Empty/error state illustration icon           | 48px | 2px (stroke width does not scale with size past 32px, or it starts looking bold instead of large) |

**Color:** icons inherit `currentColor`, following the same rules already set for text, Ink-900 default, Field-700 for active/links, white on filled Field-500 surfaces (mic button), Slate-600 for muted/secondary icons (e.g. the edit pencil before it's tapped). Never Field-500 as an icon-on-white color, for the same contrast reason it's banned as body text.

**Active nav state:** don't switch the icon shape or swap to a filled variant, switch only the _color_ (Slate-600 → Field-700) plus the label weight, exactly as already specified in the Bottom Tab Bar component. One icon set, state expressed through color and type weight, not through a second icon family.

### Icon Map

Every placeholder icon block in the product now maps to a real, named Lucide icon:

| Placeholder     | Component                                     | Lucide icon       | Notes                                                                                                                                                          |
| --------------- | --------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.ti` (tab 1)   | Bottom nav, בית / Home                        | `home`            |                                                                                                                                                                |
| `.ti` (tab 2)   | Bottom nav, חלקות / Plots                     | `layout-grid`     | Reads as "a set of parcels," not a single document, distinct from the money icon below                                                                         |
| `.ti` (center)  | Capture tab                                   | `plus`            | Sits raised above the bar in a filled Field-500 circle, the one non-flat element in the nav; tap opens the Capture Sheet, long-press jumps straight to the mic |
| `.ti` (tab 3)   | Bottom nav, כסף / Money                       | `wallet`          | Merges what used to be separate Ledger and Reports destinations, expenses, receipts and export all live here now                                               |
| `.ti` (tab 4)   | Bottom nav, עוד / More                        | `more-horizontal` | Plots and crops, farm members, subscription, notification hour                                                                                                 |
| `.mic-glyph`    | Primary voice FAB                             | `mic`             | White stroke on Field-500 fill, 32px                                                                                                                           |
| `.pd-back`      | Plot detail, back navigation                  | `chevron-right`   | **RTL-specific:** back points right, not left. Never reuse an LTR `chevron-left` here, pick the direction-correct icon, don't mirror a wrong one with CSS      |
| `.edit-ic` (×2) | Confirmation sheet, editable field affordance | `pencil-line`     | Slate-600 at rest, Field-700 on focus                                                                                                                          |
| Sync chip dot   | Sync Status Chip, synced                      | `check-circle`    | Replaces the plain colored dot, pairs meaning with shape, not color alone (same rule as P&L figures)                                                           |
| Sync chip dot   | Sync Status Chip, pending                     | `clock`           | Wheat-800, never Adama/red, offline queueing is not an error                                                                                                   |
| `.cdot`         | Expense row, fuel                             | `fuel`            |                                                                                                                                                                |
| `.cdot`         | Expense row, fertilizer                       | `sprout`          |                                                                                                                                                                |
| `.cdot`         | Expense row, pest control                     | `bug`             |                                                                                                                                                                |

### Task, Sharing & Plan Icons _(added in this revision)_

| Component               | Lucide icon      | Notes                                                                                                       |
| ----------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Task row, unchecked     | `circle`         | 28px. Not a native checkbox, the tap target is the full row                                                 |
| Task row, completing    | `check`          | White on Field-500, revealed by the swipe                                                                   |
| Swipe-left, snooze      | `clock-arrow-up` | White on Wheat-500. Falls back to `clock` if unavailable                                                    |
| Overdue indicator       | _(none)_         | **Deliberately no icon.** The Wheat rule + Wheat-800 date carries it; an alert glyph would read as an error |
| Due date, in sheet      | `calendar`       | Only on the `עד תאריך` chip, not on the other two                                                           |
| Estimated cost          | _(none)_         | The `₪` suffix is the affordance; an icon beside a currency field is redundant                              |
| Task photo attach       | `camera`         | 56px icon button in the task sheet                                                                          |
| Task voice note         | `mic`            | Same glyph as the primary FAB, one meaning, one icon                                                        |
| Round, entry point      | `route`          | Reads as "a path through the plots" more directly than `map` or `list`                                      |
| Round, position         | _(none)_         | Numeric `3 / 7`, never a dot row                                                                            |
| Recurring expense       | `repeat`         | Ledger rows and the fixed-expense form                                                                      |
| Member avatar           | _(none)_         | Initials, not a `user` glyph, initials distinguish people, an icon doesn't                                  |
| Sync, queued writes     | `upload-cloud`   | Wheat-800                                                                                                   |
| Sync, offline           | `cloud-off`      | Wheat-800, never Adama/red                                                                                  |
| Sync, stale read        | `clock`          | Slate-600                                                                                                   |
| Plans, feature included | `check`          | Profit-600                                                                                                  |
| Plans, feature absent   | _(none)_         | An em-dash in Slate-600. **Never a red ✗**                                                                  |

### Journal & Capture Icons _(added in this revision)_

| Component                     | Lucide icon    | Notes                                                                                                 |
| ----------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| Capture tab (center nav)      | `plus`         | White on Field-500, raised circle                                                                     |
| Capture Sheet, expense option | `wallet`       | Matches the Money tab icon, same meaning everywhere                                                   |
| Capture Sheet, task option    | `list-checks`  |                                                                                                       |
| Capture Sheet, journal option | `notebook-pen` | Distinct from the task icon, a journal entry is a record of what happened, not a to-do                |
| Journal row, generic entry    | `notebook-pen` | Same glyph as the capture option, one meaning                                                         |
| Journal row, spray entry      | `spray-can`    | The one entry type that gets a distinct icon, since it is also the one with its own dedicated screen  |
| Journal row, harvest entry    | `wheat`        | Shared with the harvest expense category, both mean the same thing                                    |
| Safe-to-harvest chip          | `shield-check` | Field-700, calm and informational, never the Adama/red family                                         |
| Forecast update button        | `pencil-line`  | Same pencil used for the Confirmation Sheet's edit affordance, one meaning: "this number is editable" |
| Plot detail, tab bar          | _(none)_       | Text-only tabs, an icon per tab at this size adds noise without adding meaning                        |

### Expense Category Icons

The PRD's crop model is free-text (PRD §2 and §5) but expense _categories_ are a small, known set. Full mapping, including categories not yet shown in a mockup:

| Category (Hebrew)                      | Icon       | Token color                                                                                                                                                                                                 |
| -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| דלק (Fuel)                             | `fuel`     | Wheat-800                                                                                                                                                                                                   |
| דשן (Fertilizer)                       | `sprout`   | Field-700                                                                                                                                                                                                   |
| הדברה (Pest control)                   | `bug`      | Adama-600                                                                                                                                                                                                   |
| השקיה (Irrigation)                     | `droplets` | Sky-500                                                                                                                                                                                                     |
| זרעים ושתילה (Seeds / planting)        | `flower-2` | Field-700                                                                                                                                                                                                   |
| ציוד ותיקונים (Equipment / repairs)    | `wrench`   | Slate-600                                                                                                                                                                                                   |
| עבודה ושכר (Labor / wages)             | `users`    | Slate-600                                                                                                                                                                                                   |
| יבול וקציר (Harvest / yield)           | `wheat`    | Wheat-800                                                                                                                                                                                                   |
| אחר / לא מסווג (Other / uncategorized) | `receipt`  | Slate-600, **also the fallback for any category text the system doesn't recognize.** Since crop and expense-category names are free text, there is always exactly one icon that can't be missing: this one. |

---

## Components

### Capture Tab & Sheet _(the product's core interaction)_

**Role:** The single entry point for everything the farmer records, always reachable in one tap from anywhere in the app, never buried in a menu.

The center item of the Bottom Tab Bar, raised above the bar line as an 88px Field-500 circle with a white `plus` glyph and the same soft ambient shadow (`--shadow-float`) the rest of the system reserves for floating elements. It is visually the loudest thing in the nav on purpose, this is the button used roughly nine times out of ten.

**A tap opens the Capture Sheet:** a bottom sheet, 28px top radius, three rows in the same shell family as every other sheet in the system. Each row pairs an icon, a title and a one-line subtitle: הוצאה (`wallet`, "סכום, קטגוריה, חלקה"), משימה (`list-checks`, "מה צריך לעשות"), יומן (`notebook-pen`, "מה עשיתי, כולל ריסוס"). A `caption`/Slate-600 line at the bottom reads "לחיצה ארוכה על הכפתור פותחת ישר את המיקרופון", so the shortcut is documented in the one place a first-time user will actually see it.

**A long press skips the sheet and opens the mic directly**, on the assumption that the farmer already knows what he wants to record and is choosing to speak it rather than tap through a menu. Which form the mic fills, expense, task or journal, is decided the same way voice already decides it elsewhere: by what the farmer says, extracted by the LLM against the relevant schema, never guessed by the button itself.

### Mic Capture Button (the shared voice affordance)

**Role:** The visual and behavioral spec for "listening," reused identically wherever the app records voice, inside the Capture Sheet's long-press, inside the Round screen, and inside the Task and Journal sheets' own mic buttons.

88px circle (56px where it appears inline rather than as a primary action, e.g. the Task Sheet's mic icon button), Field-500 fill, white mic glyph, soft ambient shadow (`--shadow-float`) so it reads as "raised" even in flat outdoor light. While listening: a soft pulsing ring in Field-300 at low opacity, animating outward, the only animated element allowed to loop, and it respects `prefers-reduced-motion`.

**Listening hint:** the instant recording starts, a `caption`-size label fades in above the ring, same slot the "מעבד..." processing label uses later: "אמרו: מה, כמה, לאיזו חלקה" for an expense, with the equivalent three-field prompt for a task or journal entry depending on which form the mic is filling. It exists to shape the utterance before it happens rather than correct it after, since the single-item extraction rule (PRD Appendix A.5) depends on the farmer actually saying one thing with its handful of fields. The label disappears the moment recording stops, it is coaching for the three seconds it is needed, not a persistent instruction the farmer has to read every time.

### Live P&L Hero Card

**Role:** The first thing the farmer sees on opening the app.

Full-width card, 28px radius, white background with a 1px Border-200 hairline (not a shadow-driven card, see Elevation). Farm name in `body-sm`/Slate-600 at top. The number itself in `display` (84px/900), color-flipping between Profit-600 and Loss-600, always prefixed with an explicit `+`/`−` sign and a small ▲/▼ glyph beside it, color is reinforcement, never the only signal. On update, the number does a brief (200ms) scale-pulse (1.0 → 1.03 → 1.0) to confirm "this just changed," per the PRD's UX spec (Appendix A.6) requirement for immediate visual feedback.

### Plot Card (כרטיס חלקה)

**Role:** One per parcel, stacked below the hero card, the summary view of a plot. See _Plot Detail Screen_ for what it opens into.

20px radius, Mist-100 background (no border needed, the tonal shift from the white hero above is enough separation), 20px padding. Plot name in `subheading`/Ink-900. Profit figure in `heading-lg` (60px/900) with the same sign+glyph+color treatment as the hero. Small `caption` line underneath: estimated income vs. actual spend. Entire card is tappable → plot detail.

### Plot Detail Screen

**Role:** The screen a farmer thinks of as "the Southern plot," not "my expenses." Reached by tapping a Plot Card or a row in the Plots tab.

Header: plot name in `heading-sm` (34px/700), a `body-sm`/Slate-600 line beneath it giving area, crop and season ("40 דונם · זיתים · עונה 2026"), and a `chevron-right`-style RTL back affordance (see the icon map's RTL note, back points right in this system).

#### Profit Forecast Summary (סיכום צפי רווח)

**Role:** The plot's bottom line, visible from every tab. Sits between the header and the tab track, **outside** the tabs, so reading it never costs a tap.

`caption`/Slate-600 label reading **צפי רווח**, then the figure at `heading` (44px/900) carrying an explicit `+`/`−` sign and a `trending-up`/`trending-down` glyph, then a `body-sm`/Slate-600 breakdown line: `צפי הכנסה … · הוצאות …`.

**The wording is load-bearing: צפי רווח, never רווח.** This number is a hybrid, a forecast income minus actual recorded expenses. It is unrealised, and one side of it is an estimate the farmer typed himself. A mistyped yield or price produces a number that looks exactly like real profit, and the label is the only thing standing between that and a farmer trusting it. Positive takes Profit-600, negative Loss-600, and **zero stays Ink-900**, same rule as the dashboard hero.

**Until expense tracking exists**, the breakdown shows `הוצאות ₪0` with a Wheat-800 `caption` beneath reading "עדיין לא נרשמו הוצאות, המספר יתעדכן". Wheat and not Loss-600, for the reason the Recurring Expense Nudge Card already states: the message is "we're not showing you everything yet", not "you're losing money". Untracked expenses and genuinely zero expenses are different states and must not render identically.

**Worker Mode renders nothing here**, and not by a UI condition. The forecast columns are masked to `null` in `crop_cycles_view` for the worker role, so there is no income to compute and the whole block is absent. This is the query-layer enforcement this document demands elsewhere: a rendered-but-hidden shekel figure is one screenshot away from a problem between an employer and an employee.

#### Tabs

Below the summary, four tabs in the same segmented-control shape used elsewhere (Mist-200 track, white active pill, Field-700 active text): צפי הכנסה, הוצאות, משימות, יומן. Each tab scopes an existing component to this one plot rather than inventing new ones:

- **צפי הכנסה** shows the crop identity row (name · season, with an edit link), a hairline, then the expected-income figure at `heading-lg` in **Ink-900**, the yield and price breakdown in `kv`-row style, and the **Forecast Update** button (see below). Gross income is not a P&L figure, so it does not take Profit-600; the coloured number on this screen is the summary above, and exactly one number owning the green is what keeps the green meaningful. When the plot has an open spray record with `phi_days` set, a Field-100 "בטוח לקטיף מ-…" chip renders here too, the plot-scoped instance of a safe-harvest indicator.
- **הוצאות** is the ledger filtered to this plot, same Expense rows as the Money tab.
- **משימות** is a Task Board (see _Components: Tasks_) filtered to this plot, identical row and swipe behavior, just a narrower query.
- **יומן** is a Journal list (see _Components: Journal_) filtered to this plot.

> **Why the old unified רווחיות tab was split.** It held the P&L figure *and* an expenses breakdown, while a separate הוצאות tab held the expense ledger, so two tabs spoke about expenses and the bottom line was buried one tap deep. Lifting the summary out of the tabs resolves both at once: what remains of רווחיות is exactly the income side, and each side of the money gets one home. Field note from the farmer this product is built with.

No tab introduces a new visual language. A farmer who has learned any one of these four already knows how to read the other three, that consistency is the point of scoping instead of building four separate screens.

### Forecast Update

**Role:** Keep the estimated-income figure honest by making it trivially fast to revise, since the PRD is explicit that this number is a projection the real world can invalidate overnight (hail, a price swing, a yield that came in lighter or heavier than expected).

A Mist-200 pill button, `body-sm`/700, reading "עדכון צפי", sitting directly under the plot's profitability breakdown, not in Settings, not behind an edit icon on a field, a first-class button on the screen the farmer is already looking at when the number stops matching reality.

Tapping it opens a two-field bottom sheet, יבול צפוי and מחיר משוער, each a numeric input pre-filled with the current value, plus the same full-width Field-700 pill Save used everywhere. Two fields, nothing else, matching the confirmation-sheet ceiling the rest of the system holds to.

**Staleness nudge:** if a plot's forecast hasn't been touched in a set number of months, the profitability tab surfaces a single `caption`/Slate-600 line above the figure, "לא עודכן מאז אפריל, עדיין נכון?", linking straight into the same two-field sheet. This is a text line, not a card or a modal, the dashboard-level Recurring Expense Nudge Card pattern is for something the farmer hasn't set up yet; this is a gentle check on something he already has.

### Voice / OCR Confirmation Sheet

**Role:** The trust checkpoint after every AI-parsed input (PRD §3, "תמיד מאשרים, אף פעם לא מנחשים").

Bottom sheet, 28px top radius, slides up over a dimmed (not blurred, blur reads badly in sunlight and costs render performance) scrim. Maximum **two** editable fields, each in `body-lg` with a large tap-to-edit target. A single full-width pill button in Field-700 (white label text on Field-500 measures 3.3:1, below floor; Field-700 is the text-safe fill), `subheading` weight, reading "אישור" (Confirm), minimum 56px height. A plain text link below it for "עריכה" (Edit), never two filled buttons competing for the same thumb.

### Split Allocation Row (פיצול הוצאה)

**Role:** Dividing one expense across multiple plots by percentage or amount.

Each plot gets a row: plot name, a large stepper (−/+) or percentage value in tabular numerals, and a thin Field-300 progress bar showing its share of 100%. Running total shown at the row-group's top, turning Loss-600 if allocations don't sum to 100%, a validation state, not a decorative one.

### Data Freshness Chip _(replaces the old Sync Status Chip)_

**Role:** Tell the truth about how current the number on screen is, without alarming anyone.

The PRD no longer promises offline-first, the cloud is the single source of truth, reads are served from a cache, and writes go through a queue. That changes what this chip means: it is no longer "is my local database in sync," it is **"how old is what you're looking at, and is anything still waiting to be sent."**

Pill, `caption` size, sitting directly under the P&L hero. Four states:

| State           | Copy                       | Treatment                                          |
| --------------- | -------------------------- | -------------------------------------------------- |
| Fresh (< 2 min) | _(chip hidden entirely)_   | Don't decorate the normal case                     |
| Stale           | `מעודכן לפני 20 דקות`      | Mist-200 bg / Slate-600 text / `clock`             |
| Queued writes   | `2 רישומים ממתינים לשליחה` | Wheat-100 bg / **Wheat-800** text / `upload-cloud` |
| Offline         | `אין חיבור · נשמר במכשיר`  | Wheat-100 bg / **Wheat-800** text / `cloud-off`    |

Never a red or error treatment for any of these, a queued write is a designed-for state, not a failure. The chip is also the one place allowed to say something slightly negative on the home screen, so it stays small and it stays under the number, never beside it.

**The failure this chip exists to prevent** isn't "no signal", it's a save that spins for 25 seconds on one bar and then loses the farmer's expense. Every write renders optimistically the instant it's tapped, and this chip is the only acknowledgement that it hasn't landed yet.

### Bottom Tab Bar (RTL)

**Role:** Primary navigation. Four flat tabs plus one raised center action: בית, חלקות, **Capture**, כסף, עוד.

White background, 1px top Border-200 hairline (no shadow, consistent with the flat, hairline-first elevation language). Icons + `caption` labels. Tab order is mirrored for RTL reading direction, "בית" sits at the visual right, "עוד" at the visual left, with Capture centered between חלקות and כסף. Active tab: Field-700 icon + label; inactive: Slate-600. The Capture tab never shows an "active" state the way the other four do, tapping it opens a sheet rather than navigating to a screen, so it always renders in its resting Field-500-filled state.

> **Note for implementers (added during Stage 2 build):** the mockups in `design.html` still render the _superseded_ layout described in the next paragraph, with tabs בית / הנה"ח / דוחות / הגדרות and no raised center action. `design.html` was deliberately left unchanged. **This section, not the mockup, is the source of truth for the tab bar.** The shipped mobile shell follows what is written here.

This replaces the earlier five-flat-tab layout (Home, Tasks, Bookkeeping, Reports, Settings). Tasks never had a screen of their own to begin with, they live inside the home board, inside each plot's Tasks tab, and inside the Round, so a dedicated tab was redundant. Bookkeeping and Reports merge into the single כסף tab, since both were always "look at money," just filtered differently.

### Category / Crop Tag

**Role:** Free-text crop labels (PRD's crop-agnostic model, PRD §2) rendered as chips.

9999px radius, Mist-200 background, Ink-900 text, `caption` size, 6px/12px padding. No fixed color-per-category system, since crops are user-defined free text (PRD §2), a closed color-coding scheme would eventually collide or run out.

### Upgrade Gate Sheet _(the primary monetization surface)_

**Role:** Appears at the exact moment the farmer hits a free-tier limit, adding a third plot, spending the 10th voice recording, tapping export. The PRD replaced a hard post-onboarding paywall with this.

Bottom sheet, 28px top radius, same shell as the confirmation sheet, reusing a shape the farmer already trusts rather than introducing a "sales screen" silhouette.

**The headline names what he was just trying to do**, never the plan: "החלקה השלישית שלך במסלול חקלאי", not "שדרג עכשיו!". The sheet exists because he _wanted_ something; the copy should reflect that he was mid-action, not that we interrupted him.

One `body-lg` line of value, the **monthly price as the headline number** in `heading` (44px/900), with the annual total beneath it in `caption`/Slate-600 as a plain informational line ("828 ₪ בשנה"), not a discounted alternative offered alongside it. One Field-700 pill CTA at 56px+, and a **plain text link "לא עכשיו":** which actually dismisses. A gate the farmer can't close is the hard paywall we just removed.

No Field-100 tint here, the sheet already reads as a distinct moment against the dimmed scrim, and tinting it green pushes it toward "advertisement."

### Plans Screen

**Role:** The full three-tier comparison, reached from עוד or from "לראות את כל המסלולים" in the gate sheet. **Never the first thing a new user sees.**

Full screen, Field-100 background, this is the one screen in the product allowed a tinted background, since it's a single destination moment rather than persistent chrome.

Three stacked white cards (not side-by-side columns, a three-column price matrix at this type scale is unreadable on a phone and unreadable to this audience at any scale), each 28px radius with a Border-200 hairline:

- **Card order: חינם → חקלאי → משק.** Ascending, matching how the farmer will actually grow into it.
- **"חקלאי" is the visual default:** Field-700 2px border instead of the hairline, plus a Field-100 chip reading `הכי מתאים`. Exactly one card gets emphasis.
- **Monthly price is the headline number** in `heading` (44px/900), matching the Upgrade Gate Sheet. The annual total sits below in `caption`/Slate-600 as a plain sum, not framed as a discount or an alternate purchase, billing is monthly only, this line exists purely so the farmer can see what a year adds up to.
- **Feature rows use `check` in Profit-600 and an em-dash in Slate-600, never a red ✗.** A feature you don't have yet isn't a failure, and red is reserved for money.
- The current plan renders its card with a Mist-100 fill and a `התוכנית שלך` chip in place of the CTA.

**Trailing line in `body-sm`/Slate-600, mandatory:** "המנוי הוא על המשק, כל מי שמשותף אליו מכוסה." This is the single most common misunderstanding the sharing model will produce, and answering it at the point of purchase costs one line.

---

## Components: Tasks

The task family follows one rule that overrides normal component instincts:

> **A task is captured in under five seconds or it isn't captured at all.**
> Every full-screen navigation, every required field, every confirmation dialog in this flow is a place the farmer stops. The expense flow can afford a confirmation step because money is at stake. The task flow cannot.

### Task Row

**Role:** The atom of the whole feature. Appears in the task board, in plot detail, and in the Round screen.

Single row, 72px minimum height. Mist-100 fill, no border, 16px vertical rhythm between rows.

**Structure, reading right-to-left:**

| Zone            | Content                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Body (right)     | Task title in `body-lg`/600 Ink-900. Second line in `body-sm`/Slate-600: plot name · due date, separated by `·`  |
| Trailing (left)  | Two 48px round icon buttons, side by side: `check` on Field-500 (`בוצע`), `trash-2` on Loss-600 (`מחיקה`), one tap each |

Both actions are also reachable by swipe on mobile (see below), the buttons are the platform-independent fallback, web has no gesture equivalent so the buttons are its only path.

**The metadata line only renders what exists.** A task with no date shows just the plot name. A general farm task with neither shows nothing, one line, and that's a legitimate, common task. Do not render empty-state placeholders like "ללא תאריך" on the row itself (the group header may say it, see Task Board); absence on the row is information the farmer already has.

**Due-date rendering in the metadata line:**

| Condition     | Copy            | Color                     |
| ------------- | --------------- | ------------------------- |
| Today         | `היום`          | Ink-900, weight 600       |
| Tomorrow      | `מחר`           | Ink-900                   |
| Within 7 days | `עוד 3 ימים`    | Slate-600                 |
| Further out   | `25/08`         | Slate-600                 |
| Overdue       | `באיחור 4 ימים` | **Wheat-800, weight 600** |

Relative language until it stops being useful, "מחר" is instantly actionable, "עוד 19 ימים" is not, so past a week it becomes a date.

### Task Row, Actions

**Role:** The two actions that carry the row. Both must be reachable without opening anything.

- **`בוצע`:** marks the task done, `completed_at`. Fires immediately and surfaces an undo toast for 5 seconds (`tasks.completedToast` + `ביטול`), replacing the row in place for that window. `completed_at` is a one-way write (no `UPDATE` un-completes a row), so the 5-second undo defers the actual write rather than reversing it after the fact. This matches the flow's founding rule (see "A task is captured in under five seconds" above): no confirmation dialog interrupts marking a task done, low-stakes and instantly reversible.
- **`מחיקה`:** removes the task, a soft delete (`deleted_at`), not a completion. For a task that's simply no longer relevant, there's no reason to record it as done just to get it off the list. **Deliberately a different safety mechanism, not the same undo toast**: tapping it opens a centered `ConfirmDialog` (Loss-600 confirm button, farmer-requested, "an undo toast that fires silently after a swipe isn't enough warning for something that feels final"), and the delete only writes on explicit confirmation, no 5-second window afterward. `בוצע` stays low-friction because being wrong about it costs nothing; `מחיקה` gets a real question because being wrong about it costs the record.

**Mobile also carries both as a swipe on the row itself**, `PanResponder`/`Animated`, no new dependency. Swipe right-to-left → `בוצע` (Field-500 revealed, `check` glyph), swipe left-to-right → `מחיקה` (Loss-600 revealed, `trash-2` glyph). Right-to-left for the primary action, not left-to-right: matches the direction the eye and hand already move in Hebrew. Confirmed on device with the farmer this product is built for, not assumed from an LTR default — an earlier attempt at this row shipped the swipe with the reveal colors and the committed action out of sync (a symptom of RN mirroring `left`/`right` styles under RTL while leaving raw gesture deltas untouched), so if this ever needs touching again, verify the color that's *visually* revealed mid-drag matches the action that actually fires on release, on a real device, not in the simulator. Threshold is 40% of row width, deliberately forgiving, since this audience is often wearing gloves or operating one-handed in a vehicle.

> **An earlier version of this row also had `דחה שבוע` (snooze) as a swipe action.** Dropped per direct farmer feedback: three competing gestures on one row read as clutter, and delete already covers "get this off my list" for a task that isn't going to happen. `snoozeTask` remains in `packages/shared`, tested, unused by any screen right now, see `open-items.md`.

### Confirm Dialog

**Role:** A centered yes/no gate for a destructive action, first used by `מחיקה` above. General component, not task-specific, so the next destructive action in the product reuses it instead of rebuilding it (same reasoning as `BottomSheet`/`Modal`).

Title (`body-lg`/700), one line of context (`body-sm`/Slate-600, e.g. the item's name), both **center-aligned**, not right-aligned like every other RTL text block in this product: this dialog is a small isolated card, not a line in a list or a form, and a short centered question reads calmer than a right-ragged one on a dialog this narrow. Two stacked full-width 48px pill buttons below: confirm on top, cancel below. `destructive` prop paints the confirm button Loss-600 instead of Field-700, the color itself says "this can't be undone." Built on the platform's existing centered-dialog primitive (`BottomSheet`'s `Modal` wrapper on mobile, the shared `Modal` component on web), not a new one.

### Task Sheet (create / edit)

**Role:** The only place a task is authored by hand. **Bottom sheet, never a screen.**

28px top radius, dimmed scrim, same shell family as the confirmation sheet. Opens with the title field focused and the keyboard already up, the farmer's first interaction is typing, not tapping into a field.

Vertical order, and this order is the spec:

1. **Title:** `body-lg`, borderless input, placeholder "מה צריך לעשות?". No label; the placeholder is the label.
2. **Plot:** horizontally scrolling chip row of the farm's plots, plus a `כללי` chip for farm-level tasks. Pre-selected when opened from plot detail or the Round. **`כללי` is a real, first-class option:** "לתקן את הטרקטור" is a task the farmer will absolutely try to enter, and forcing it onto a plot is how a data model teaches someone that an app doesn't understand their work.
3. **Due date:** three chips: `מתישהו` · `השבוע` · `עד תאריך ▾`. **`מתישהו` is selected by default**, so a task with no deadline requires zero taps. Only the third chip opens a picker.
4. **Actions:** `camera` and `mic` as 56px icon buttons in a row: attach a photo of the problem, or a voice note. Both optional, both one tap.
5. **Save:** full-width Field-700 pill, 56px+.

**No cost field here.** An earlier version asked for an estimated cost at creation time, pre-filled from `TaskCostMemory`. Removed: this audience found a money question on a form meant to take five seconds actively unwelcome, and it duplicates a better-placed question. Cost belongs to *completion*, not authoring, ask "add this to expenses?" when the task is marked `בוצע`, see Completion Prompts, not before the work has even happened.

**Nothing below the fold.** If the sheet needs to scroll to reach Save on a small phone, cut a field.

### Due-Date Chip Group

**Role:** The entire urgency model, expressed as three chips.

Standard chip shape (9999px), 56px height, `caption`/600 labels. Unselected: Mist-200 fill, Ink-900 text. Selected: Field-100 fill, Field-700 text, 2px Field-700 border.

**There is deliberately no priority control anywhere in this system.** The PRD's reasoning, restated here because it will get re-litigated during implementation: a second axis of importance forces a second decision on every single task, and for this audience urgency is _already_ a deadline, spraying matters because there's a weather window, not because someone flagged it P1. If an escape hatch ever proves necessary it should be one binary star, not a four-level scale, and it should be added only after real usage demands it.

### Overdue Banner

**Role:** The "it pops up a task I didn't do" behavior from the field interview, done without creating a guilt pile.

An overdue task renders as a normal Task Row with three modifications: Wheat-100 fill instead of Mist-100, a 4px Wheat-500 rule down the leading (right) edge, and the due line in Wheat-800/600. Overdue tasks sort to the top of the board under a `באיחור` section header.

**Tapping an overdue row does not open the sheet:** it expands inline to reveal three 56px buttons in a row: `בוצע` (Field-700 fill) · `דחה שבוע` (Mist-200) · `לא רלוונטי` (text link, Slate-600). Three decisions, one tap each, no navigation.

Never Loss-600, never an alert icon, never a badge count in the tab bar for overdue tasks. The farmer knows he's behind; the interface's job is to make the next action cheap, not to keep score.

**Aging:** a task snoozed three times or untouched for 30 days surfaces once as `עדיין רלוונטי?` with `כן` / `לארכיון`. Ignored twice → archived silently. Archived tasks are reachable from the board's overflow, never surfaced.

### Task Board (dashboard section)

**Role:** All open tasks across the farm, on the home screen below the plot cards.

Grouped by **time** by default: `באיחור` → `היום` → `השבוע` → `בהמשך` → `מתישהו`. A segmented control at the top switches to grouping by plot. Time wins by default because the board's job in the evening is answering "what am I doing tomorrow," not "what's the state of plot C." `בהמשך` holds anything due more than a week out (an explicit date, months away is common for this audience), so it doesn't get mislabeled as `השבוע`.

Section headers in `caption`/600/Slate-600, all-caps is **not** used (Hebrew has no case, and faking emphasis with letter-spacing is banned system-wide). No count next to the header, tried it, with one or two tasks per group it read as noise rather than information. Empty groups don't render.

Collapsed to the first 5 rows with `עוד 12 משימות` as a text link. The home screen belongs to the P&L number; the board is a resident, not the owner.

### Round Screen (מסך סבב)

**Role:** The field-capture mode, the single interaction most likely to make this product a daily habit. Full screen, entered from a persistent entry point on the home screen (**not** buried in an overflow menu).

One plot per full-screen card, horizontally paged. RTL paging: **swiping right-to-left advances to the next plot**, matching the reading direction, this is the single most commonly botched RTL detail and it must be verified on device, not assumed from the CSS.

Per card:

- Plot name in `heading` (44px/900) and area in `body-sm`/Slate-600.
- Existing open tasks as compact Task Rows, read-only context, so he doesn't re-add what's already there.
- **An 88px Field-500 mic button**, same component and same size as the home screen's. One recognizable primary action across the product.
- Position indicator (`3 / 7`) in `caption`, never a dot row, seven-plus dots at this size are unreadable in sunlight.

Voice capture here fills the Task Sheet's fields instead of the expense form's, same STT pipeline, different extraction schema. The confirmation is a **compact inline strip** above the mic, not a full sheet: title, plot, date, all editable in place. A round is a rhythm, and a modal per plot breaks it.

**Round summary** on completion: a single centered card, `נוספו 7 משימות · צפי 6,300 ₪`, with a `סיום` pill. This is the one screen in the product where a brief celebratory beat is appropriate: the farmer just did the work the app exists to capture, and it's the moment his effort turns into a visible number.

### Completion Prompts

**Role:** Two independent offers that can appear when a task is marked done, save it to the journal, and record its cost as an expense. **Offering, never doing**, and the two are never coupled to each other.

Renders as a small sheet in place of the usual 5-second undo toast, not a full-screen dialog, the farmer just performed a satisfying action and a heavy interruption would punish it. A `check-circle` in Field-100 and the task title sit at the top ("בוצע: ריסוס עשבייה"), followed by up to two yes/no chip pairs, each independently defaulted and independently dismissible:

> לשמור ביומן? `כן` · `לא`
> לרשום 1,200 ₪ כהוצאה? `כן` · `לא`

**The journal question fires whenever the task's title matches a Journal entry type** (or always, if the farmer hasn't disabled it), and defaults to `כן`, since keeping the journal populated is low-friction and high-value. **The expense question fires only when the completed task carried an estimated cost**, and defaults to whichever choice the farmer picked last for that same task title, most costed tasks really did cost money, but the farmer may have done the work himself this time, so the choice always has to be re-confirmable, never silently repeated.

Answering `כן` on the expense question opens the expense confirmation sheet with the amount, plot and date pre-filled, so the number stays correctable, actual cost rarely matches the estimate, and capturing that difference is what makes plan-vs-actual work at all. Answering `כן` on the journal question writes the entry immediately with no further sheet, task title, plot, date and type are already enough to populate a Journal row.

Auto-dismisses after 8 seconds (longer than a plain undo toast, this one asks two questions). Both toggles live in Settings and can be turned off independently. **Never auto-create either record under any setting:** the farmer may well have done the work himself and logged it separately already, and silently writing to his money or his journal on his behalf destroys trust in the two records the product exists to be right about.

### Recurring Expense Nudge Card

**Role:** Surfacing fixed costs (rates, water, insurance, salary) a few days into use, since asking during onboarding is what kills onboarding.

Full-width card on the home dashboard, Wheat-100 fill, 20px radius, appearing on day 2-3 of active use and **only once**. Title in `subheading`: "המספר שלך לא מדויק", direct, because the farmer's trust in the P&L figure is exactly what's at stake. Two lines of `body-sm` naming real examples (ארנונה, מים, ביטוח, משכורת). Actions: `בוא נוסיף` (Field-700 pill) and `לא עכשיו` (text link). Dismissed = gone permanently; the entry point lives in Settings from then on.

Wheat rather than Field-100 because this card is a correction, not a celebration, and never Loss-100, which would read as "you're losing money" when the actual message is "we're not showing you everything yet."

A recurring expense row anywhere in the ledger carries a `repeat` icon in Slate-600 plus a `caption` chip reading `חודשי` or `שנתי`, so a farmer scanning the ledger can tell instantly which lines he'll never have to enter again.

---

## Components: Journal

The journal answers one question, what did I do and when, and it is deliberately independent of everything else in the system. A farmer can write to it with no task behind the entry, and deleting the entire Task feature tomorrow would not touch a single Journal row. That independence is the point, restated here because it is easy to accidentally couple the two while implementing.

### Log Row

**Role:** The atom of the journal, appears in the full Journal list, in a plot's Journal tab, and in the dedicated Spray Log screen.

Same shell family as the Task Row (Mist-100 fill, no border), but read-only in the sense that it carries no swipe actions, a Journal entry is a record of something that already happened, there is nothing to complete or snooze. Leading element is the date in `caption`/700/Slate-600 at a fixed width, so a scanning eye can track dates down the column. Body: entry type in `body-lg`/600 Ink-900 ("ריסוס", "דישון", "קטיף"), with a small type tag beside it only for spray and harvest entries (`ריסוס` in a Wheat-100/Wheat-800 chip, `קטיף` in a Field-100/Field-700 chip, the two entry types that carry structured sub-fields worth flagging at a glance). Second line in `body-sm`/Slate-600: plot name and a one-line detail, the pest and material for a spray row, the source ("נרשם בקול", "ממשימה שהסתיימה") for anything else.

### Log Entry Sheet (create / edit)

**Role:** The only place a Journal entry is authored, whether it arrived here through the Capture Sheet's direct יומן option or was opened from a completed task's prompt. **Bottom sheet, never a screen**, the same five-second discipline the Task Sheet holds to.

Vertical order:

1. **Type:** a horizontally scrolling chip row, חריש, זריעה, דישון, ריסוס, השקיה, גיזום, דילול, קטיף, תיקון, אחר. Selecting `ריסוס` reveals four additional fields inline, below the chip row, not on a second screen: מזיק או סיבה and חומר as required text inputs (with autocomplete drawn from the farm's own history, so the same material name isn't retyped every time), and מינון and ימי המתנה as optional numeric inputs. Selecting `קטיף` reveals two additional fields, כמות and יחידה. Every other type reveals nothing further.
2. **Plot:** the same chip row component as the Task Sheet, plus `כללי` for farm-level entries.
3. **Date:** defaults to today, a single date field, no due-date framing here since a Journal entry records something that already happened.
4. **Note:** optional single-line free text.
5. **Actions:** the same `camera` and `mic` 56px icon buttons as the Task Sheet, attach a photo of the result, or dictate the entry.
6. **Save:** full-width Field-700 pill, 56px+.

When `ריסוס` and `phi_days` are both present, the sheet shows a computed, non-editable line beneath the two PHI fields, "בטוח לקטיף מ-…", the same derived-value pattern as the Plot Detail Screen's safe-harvest chip, so the farmer sees the consequence of what he just entered before he even saves it.

### Journal List

**Role:** The full-farm view, reached from the כסף tab is wrong, this lives under its own destination, from עוד and from a "יומן" entry point surfaced wherever a plot or the home screen would otherwise dead-end into "what happened here."

A segmented control at the top switches between `הכל` and a season filter. Below it, Log Rows grouped by date, newest first, no section headers beyond the date itself, unlike the Task Board's urgency grouping, a journal has no urgency axis to group by. A `יומן ריסוס` pill near the top links out to the dedicated Spray Log screen rather than just filtering in place, see below for why that distinction matters.

### Spray Log Screen

**Role:** A dedicated, top-level screen for exactly one Journal entry type, because what a farmer must produce for a regulator or an export company is the single most consequential list in the app and it must be findable without digging through a filter first.

Full screen, reached from three places: a persistent row inside the Journal, a button on the Plot Detail Screen's Profitability tab, and an entry under עוד. Header reads "יומן ריסוס" with a `body-sm`/Slate-600 count ("6 ריסוסים"). A plot filter chip row sits below the header (`כל החלקות` plus one chip per plot). The list is Log Rows filtered to spray entries only, each showing pest, material and PHI days on its detail line, and, where applicable, the derived "בטוח לקטיף" line in Field-700.

A single full-width Field-700 pill at the bottom reads "ייצוא לרגולטור", producing a PDF scoped to spray records only, material, dose, dates and PHI, in a layout built for an inspector or a buyer to read cold, not for the farmer's own use. This is a separate export from the Journal's own "ייצוא יומן מלא", the two answer different questions for different audiences and neither substitutes for the other.

### Two Paths In, No Dependency

**Role:** A design note, not a component, because it will get re-litigated during implementation otherwise.

A Journal entry is created exactly two ways, and the system must not privilege one over the other. **Automatically**, when a costed task is marked done and the farmer answers `כן` to the journal half of the Completion Prompts, the task's title, plot and date populate the Log Entry Sheet, which the farmer then confirms or edits like any other entry. **Directly**, through the Capture Sheet's יומן option, with no task anywhere in the chain. Both paths terminate in the identical Log Entry Sheet and produce the identical Log Row. If the Task feature were removed entirely, the second path alone would still be a complete, useful product.

---

## Components: Sharing

Sharing is a paid tier, so most farmers will never see any of this. **Every component here must be invisible at a member count of one:** no empty avatar slots, no "assigned to: me", no team affordances in a solo farm.

### Member Avatar

32px circle, Field-100 fill, initials in `caption`/700/Field-700. No photo uploads in V1, a photo picker is friction for a feature that only needs to distinguish two or three people.

Appears in the Task Row's trailing zone **only when a task is assigned to someone other than the current user.** "Assigned to me" is the default state and rendering it is noise.

### Role Badge

`caption` chip beside a member's name in Settings → members. `בעלים`, Field-100/Field-700 · `שותף`, Mist-200/Ink-900 · `עובד`, Mist-200/Slate-600.

### Worker Mode

The `עובד` role sees tasks, plots and the journal, but **no money, anywhere**. This is not a hidden-field pass over the normal UI, it changes the shell:

- The P&L hero card does not render. The home screen opens on the task board.
- Bottom tab bar drops to three tabs: בית, חלקות, עוד. No כסף tab.
- The Capture tab still opens, but its sheet offers only משימה and יומן, the הוצאה row is omitted entirely rather than shown disabled. A worker who does the spraying should be able to log it himself.
- Plot Detail drops to two tabs, משימות and יומן. צפי הכנסה and הוצאות don't render, and neither does the Profit Forecast Summary above them.
- Task Rows omit the estimated-cost segment of the metadata line.
- The expense half of the Completion Prompts never fires; the journal half still can.

Building this as CSS-level hiding over the full interface is the wrong approach and will leak, a rendered-but-hidden shekel figure is one screenshot away from a problem between an employer and an employee. **Enforce it at the query layer, and let the UI render what it receives.**

### "My Plots" Toggle

A segmented control at the top of the home screen, `הכל` / `שלי`, visible only when the farm has more than one member **and** at least one plot has a responsible member set. It filters plot cards and the task board together.

This is a view filter, not a permission. The father can always see his son's plots; he's choosing not to right now. Never style it as a lock, and never persist it as a mode the farmer can get stranded in, it resets to `הכל` on cold start.

---

## States

States the PRD requires but the component specs above don't cover on their own: an empty dashboard/plot before any data exists, an empty task board, a failed voice capture, and the gap between "the farmer stopped talking" and "the confirmation sheet has something to show."

### Empty State, No Expenses Yet

**Role:** The home dashboard on first open (PRD §5, the farmer lands on an empty dashboard with a call to action) and a plot-detail screen for a plot with no logged history yet.

`inbox` icon at 48px, Field-300 stroke, centered, no background circle (a circle behind it would compete with the plot/hero card shapes already on screen). Headline in `subheading`, "עדיין אין הוצאות" (no expenses yet). One line of `body-sm`/Slate-600 support copy pointing at the mechanism, not a generic nudge, "דברו לתוך המיקרופון כדי להוסיף את ההוצאה הראשונה" (speak into the microphone to add the first expense).

**Deliberately no button in this state.** The Capture tab is already always present, already the single primary action, a second "Add expense" button here would duplicate it and contradict PRD §3 ("one clear screen beats a full report"). An empty state that adds its own CTA next to an already-present global CTA is a tell that the empty state was designed in isolation from the screen it lives on.

On the dashboard specifically, the P&L hero card still renders, showing `₪0` in Ink-900 (not Profit-600 or Loss-600, zero is neither a gain nor a loss, and coloring it green or red would be a false signal the very first time a farmer opens the app).

### Empty State, No Tasks Yet

**Role:** The task board on a farm with nothing open, and a plot with no tasks.

This state is a **success**, not a void, and it is the one place in the product where that deserves saying. `check-circle` at 48px in Field-300, headline in `subheading`: "אין משימות פתוחות". Support line in `body-sm`/Slate-600: "הכול מעודכן."

**On the plot screen** the empty state carries the only CTA in the family, a Mist-200 pill, "הוסף משימה", because unlike the home dashboard there is no persistent mic FAB on that screen to duplicate. On the home board, no button: the Round entry point and the mic are already present, and adding a third way to create a task here would contradict principle 4.

**Never show a completed-tasks count or a streak.** This audience is not gamified by a scoreboard, and a count would turn an empty list into a performance review.

### Error State, Voice Recognition Failed

**Role:** STT/LLM extraction fails or returns confidence too low to show a confirmation sheet (PRD §3, verification, never a black box; PRD §16 flags transcription accuracy as the top risk).

Replaces the confirmation sheet content, same bottom-sheet shell (28px top radius, same slide-up motion), the farmer doesn't need to learn a new screen shape for a failure, just different content in the one they already expect. `mic-off` icon at 48px in Adama-600, inside a Adama-100 circle (this is the one icon that gets a background tint, the error needs to be found in under a second, and a flat icon on white reads as _slower_ than the confirmation sheet's other content, not as urgent). Headline in `subheading`: "לא הצלחנו להבין את ההקלטה" (we couldn't understand the recording), states the failure plainly, no apology copy, no jargon. Two actions, matching the confirmation sheet's own do's/don'ts (one filled, one text link, never two filled buttons):

- Primary Field-700 pill: "נסה שוב" (try again), re-opens the mic listening state.
- Text link: "הזנה ידנית" (manual entry), routes to the manual expense form, which is the PRD's own explicitly specified fallback path for voice (PRD §6.1), not something this spec is inventing. An error state that fails to surface an already-specified fallback path is incomplete, not just unpolished.

Adama-600 is reused here deliberately rather than introducing a new "error color", the token table already scopes it to "loss, destructive actions," and a failed voice capture is exactly that category, not a new one.

### Loading State, Voice Processing

**Role:** The gap between the farmer finishing a sentence and the confirmation sheet having data to show (PRD Appendix A.5: recording → Worker → STT → LLM → confirmation). This is two different states depending on connectivity, not one, collapsing them into a single generic spinner would misrepresent what's actually happening in the offline case.

**Online (actively processing):** the mic FAB stays exactly where it is, no new element appears, no layout shift, but its ring animation changes character from the "listening" pulse (soft, slow, Field-300, per the Mic Capture Button spec) to a tighter rotating ring in Field-500, plus a small `caption`-size label fades in above it: "מעבד..." (processing...). This reuses `loader-circle` as the ring motif rather than inventing a new spinner shape, rotating at a calm ~1.5s/rotation, fast enough to read as "working," slow enough not to feel anxious. Respects `prefers-reduced-motion` like every other animated element in this system: the ring holds a static frame and the "מעבד..." label is the sole progress indicator.

**Offline (queued, not processing):** per PRD Appendix A.2, this is not a loading state at all, nothing is actively happening until the connection returns, so a spinner here would be a lie. Instead, the mic ring settles immediately (no pulse, no rotation) and a Wheat-100 chip appears, same visual language as the Sync Status Chip's pending state, reused rather than invented fresh, reading "נשמר, יעובד כשיהיה חיבור" (saved, will process when connection returns). This is the one moment the system tells the farmer "nothing is happening right now" instead of simulating activity, because that's the true state and principle 4 (verification, not guessing) extends to not guessing at progress that isn't occurring.

---

## Do's and Don'ts

### Do

- Keep letter-spacing at `0` everywhere, friendly and readable beats "designed," especially at arm's length in daylight.
- Pair every profit/loss color with an explicit `+`/`−` sign and a directional glyph. Color reinforces; it never carries meaning alone.
- Use hairline borders (`--color-border-200`) as the primary way to separate surfaces. Shadows are a secondary, sparing accent (mic button, sheets), not the default card treatment.
- Keep confirmation screens to one or two fields, full stop. If a flow needs more, it's the wrong flow for voice/OCR input.
- Default to 56px minimum touch targets; 88px for the primary mic action.
- Wrap digits in `.tnum-digit` fixed-width spans on every figure that updates live, `font-variant-numeric: tabular-nums` alone does not work in OedooPro (no `tnum` feature, confirmed), so this is the real mechanism, not a fallback nicety.
- Mirror every directional icon (chevrons, back arrows, progress direction) for RTL, never ship an LTR icon unflipped in this product.
- Keep the system-font fallback in the `--font-oedoopro` stack even after OedooPro loads, it's the only source for the ₪ glyph, which OedooPro doesn't have in any weight.
- Give `[data-tnum]`/tabular-digit containers `white-space: nowrap`. Skipping this was a real bug in this system's own first draft: adjacent fixed-width digit spans are valid line-break points, so a figure like +₪48,200 can wrap mid-number inside a narrow card.
- Express an icon's active/inactive state through color and weight only (Slate-600 → Field-700). One Lucide icon per meaning, not a filled variant swapped in on selection.
- Reuse the offline/pending visual language (Wheat-100, `clock`) for the voice-processing offline state instead of a spinner, nothing is actually happening until the connection returns, so don't animate as if it is.
- Give snooze the same visual weight as complete on a task row. It is the mechanism that keeps the list from becoming a wall of guilt, and a list this audience abandons is a feature that shipped and died quietly.
- Render every write optimistically the instant it's tapped, and let the Data Freshness Chip carry the truth about delivery. The failure mode being designed against is a spinner that eats an expense on one bar of signal.
- Use Wheat (500 fill / 800 text) for overdue and pending. Red belongs to money and nothing else in this product.
- Let a task exist with no plot, no date and no cost. Each of those is a real, common task, and requiring any of them teaches the farmer the app doesn't understand his work.
- Verify RTL paging on the Round screen on a physical device. Swipe direction is the single most commonly botched RTL detail, and it cannot be confirmed by reading CSS.

### Don't _(tasks, sharing and plans)_

- Don't add a priority or importance control. Urgency is derived from the due date, a second axis forces a second decision on every task, and this audience already expresses importance as a deadline.
- Don't ever auto-convert a completed task into an expense. Ask, always, and only when the task carried a cost. The farmer may have done the work himself, and silently charging his plot for free labor corrupts the one number this product exists to get right.
- Don't open a full screen for task creation or editing. Bottom sheet only, a full navigation in a five-second flow is the flow's failure.
- Don't badge the tab bar with an overdue count, and don't send a notification per task. One daily digest at a farmer-chosen hour, and nothing else.
- Don't render team affordances on a solo farm, no empty avatars, no "assigned to me", no member UI at a member count of one.
- Don't implement Worker Mode by hiding money in CSS. Filter it at the query layer; a hidden-but-rendered figure is one screenshot from a problem between an employer and an employee.
- Don't ship an upgrade gate without a working "לא עכשיו". A gate that can't be dismissed is the hard paywall the PRD deliberately removed.
- Don't lay the Plans Screen out as three side-by-side columns. Stacked cards, a price matrix is unreadable at this type scale on a phone.

### Don't _(journal)_

- Don't require a task to exist before a Journal entry can be created. The Capture Sheet's direct journal option and the completion-triggered one use the identical Log Entry Sheet; neither depends on the other existing.
- Don't collapse the two completion questions, save to the journal, record as an expense, into one. They answer different questions, and either can be "no" independently of the other.
- Don't bury the Spray Log behind a filter inside the general Journal alone. What a farmer must show a regulator or an export company gets its own entry point, from the Journal, from the plot screen, and from עוד.
- Don't color a spray record's overdue-feeling urgency (e.g. "should have sprayed by now") the same way an overdue task is colored. A Journal entry records something that already happened; there is no "late" state for it, only for the task that might precede it.

### Don't

- Don't use Field-500 (Growth Green) as a body-text color, it fails contrast at normal text sizes. Field-700 is the only text-safe green.
- Don't use OedooPro Thin/ExtraLight/Light (100-300) below 32px, or for any body/UI text. Reserve them for large decorative headline moments only, thin strokes lose contrast fastest in direct sunlight.
- Don't introduce translucency, frosted-glass, or blur effects anywhere. They lose legibility fastest in direct sunlight, which is this product's primary use environment.
- Don't apply negative letter-spacing to headlines "for polish", that instinct belongs to a different product and audience than this one.
- Don't let the app's chrome (nav bars, card backgrounds, section fills) turn green by default. Green is reserved for the primary action and for genuinely positive numbers, not for brand decoration that would visually compete with the loss-red state.
- Don't drop below 15px type anywhere, even for "just a timestamp."
- Don't design a red/error treatment for normal offline queuing, offline is a supported first-class mode, not a failure state.
- Don't invent a new color per crop category, crop names are free text; the tag component stays neutral.

---

## Web Client Shell

_Added during the Stage 2 build. The screen inventory below still lists the web client as unspecified for its **screen-level** layouts (tables, filters, action columns) — that remains true. What is specified here is only the **shell**: navigation, chrome, and the layout frame those screens will sit in. Derived from PRD §12 (what the browser is actually for) and Appendix A.6 ("same tokens and typography, but a desktop layout, not a phone screen stretched sideways")._

**Right-hand persistent sidebar, 264px, not a bottom tab bar and not a top nav.** The mobile bottom bar exists because a thumb reaches the bottom of a phone; neither constraint applies at a desk. A sidebar keeps every destination visible without a hover or a click, and it grows as destinations are added, which a five-slot bottom bar cannot. It costs horizontal space, which matters because A.6 promises wide tables — that is paid for by capping the content column rather than the viewport, so a wide table scrolls inside its own container instead of stretching the page. Side is not set manually: the document is `dir="rtl"`, so the sidebar lands on the right and the same CSS would mirror correctly in an LTR locale.

**Five destinations, and no Capture button.** בית, חלקות, כסף, יומן, הגדרות. The set comes from PRD §12: bookkeeping and reports and receipts (כסף), plot/crop setup and forecast updates (חלקות), member management and farm settings (הגדרות), and the journal with its regulator export (יומן). The raised center Capture action is deliberately absent, because §14 puts voice capture, the Round, and quick field photos on mobile only. The web is where the farmer sits down and corrects, not where he records in the field.

**Real URLs, not state-swapped views.** Each destination is a route. On the web the address bar is part of the product: bookmarks, the browser back button, and eventually a shareable link to one plot. This is the concrete reason the web client is a separate client rather than a shared component tree with mobile.

**Active state follows the mobile rule.** Colour and weight only — Field-700 text on a Field-100 fill, weight 700 against 500. No icon swap, no filled variant, exactly as the Bottom Tab Bar section specifies.

**56px minimum stays.** Desktop conventions would allow ~40px rows here. They are not used. The audience and the accessibility rationale are the same on both clients, and a farmer at a desk is the same 55-70 farmer.

**Below 700px the sidebar becomes a header:** brand and account on one line, destinations on a single horizontal row beneath that scrolls sideways rather than wrapping. This is a narrow desktop window, not a mobile breakpoint — mobile is a separate application, and this layout should never be mistaken for it.

---

## Surfaces

| Level | Name      | Value     | Purpose                                                                                         |
| ----- | --------- | --------- | ----------------------------------------------------------------------------------------------- |
| 0     | Paper     | `#FFFFFF` | Page canvas, the default background everywhere                                                  |
| 1     | Mist 100  | `#F3F7F4` | Plot cards, list rows, tonal separation without a border                                        |
| 2     | Mist 200  | `#E7EFE9` | Dividers, tag backgrounds, disabled fills                                                       |
| 3     | Field 100 | `#E1F4E9` | Positive-state emphasis surfaces (Plans screen, success chips, selected due-date chip)          |
| 4     | Wheat 100 | `#FBEED2` | Attention-without-error surfaces, overdue task rows, queued-write chip, recurring-expense nudge |
| 5     | Loss 100  | `#FBE7DF` | Negative-state emphasis surfaces (overspend warnings). **Money only**                           |
| 6     | Field 500 | `#2FA06A` | Primary action surface, mic button, filled CTAs                                                 |

## Elevation

This system is **hairline-first, shadow-second:** a deliberate response to outdoor sunlight use, where soft shadows have almost no visible depth cue and just look like dirt on the screen.

- **Default card separation:** `1px solid var(--color-border-200)`, no shadow.
- **Floating elements only** (mic button, bottom sheets): `--shadow-float: 0 10px 28px rgba(22, 35, 28, 0.18)`
- **Focus ring** (keyboard/switch-access): `0 0 0 3px var(--color-field-700)` outset, never inset-only, must be visible against both white and tinted surfaces.

## Imagery

No mascot, no illustrated 3D produce, no stock photography of "farmers in fields." This is a financial trust tool for people managing real money, over-illustration reads as unserious for that job, and a mascot competes with the live P&L number for attention on the one screen that matters most. Iconography is a simple two-weight line/glyph system (mic, camera/scan, plot marker, chevrons) in Ink-900 or Field-700, never filled/duotone. If any photography appears (e.g. marketing site, not the app itself), it should be real, unstaged field photography, not stock.

## Layout

Single-column, mobile-only, RTL. Every screen has one dominant element (the hero number, the confirmation field, the plot name) rather than competing panels, this is the direct execution of PRD §3. The Capture tab is the only raised, visually-louder nav element; everything else is flat. Bottom tab bar is the sole primary navigation, no hamburger menu, no drawer, so nothing the farmer needs is more than one tap deep.

---

## Quick Start

### Font Loading

```css
/* fonts/oedoopro-{weight}-webfont.woff2, local, licensed. No CDN dependency.
   Fallback chain matters here: OedooPro has no ₪ glyph in any weight, so the
   shekel sign in every price/figure renders from the system font instead -
   confirmed by inspecting the font's glyph tables, not assumed. */
@font-face {
  font-family: 'OedooPro';
  font-weight: 100;
  font-display: swap;
  src: url('/fonts/oedoopro-thin-webfont.woff2') format('woff2');
}
@font-face {
  font-family: 'OedooPro';
  font-weight: 200;
  font-display: swap;
  src: url('/fonts/oedoopro-extralight-webfont.woff2') format('woff2');
}
@font-face {
  font-family: 'OedooPro';
  font-weight: 300;
  font-display: swap;
  src: url('/fonts/oedoopro-light-webfont.woff2') format('woff2');
}
@font-face {
  font-family: 'OedooPro';
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/oedoopro-book-webfont.woff2') format('woff2');
}
@font-face {
  font-family: 'OedooPro';
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/oedoopro-regular-webfont.woff2') format('woff2');
}
@font-face {
  font-family: 'OedooPro';
  font-weight: 600;
  font-display: swap;
  src: url('/fonts/oedoopro-medium-webfont.woff2') format('woff2');
}
@font-face {
  font-family: 'OedooPro';
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/oedoopro-bold-webfont.woff2') format('woff2');
}
@font-face {
  font-family: 'OedooPro';
  font-weight: 900;
  font-display: swap;
  src: url('/fonts/oedoopro-black-webfont.woff2') format('woff2');
}
```

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-field-700: #1d6b45;
  --color-field-500: #2fa06a;
  --color-field-300: #8fd6ae;
  --color-field-100: #e1f4e9;
  --color-profit-600: #26804c;
  --color-loss-600: #c1502e;
  --color-loss-100: #fbe7df;
  --color-wheat-800: #8a5a12;
  --color-wheat-500: #e3a233;
  --color-wheat-100: #fbeed2;
  --color-sky-500: #3e8fd0;
  --color-ink-900: #16231c;
  --color-slate-600: #56655d;
  --color-mist-200: #e7efe9;
  --color-mist-100: #f3f7f4;
  --color-border-200: #d6e0d9;
  --color-paper: #ffffff;

  /* Typography, OedooPro is a local, licensed asset, not a hosted webfont.
     Load it via @font-face pointing at fonts/oedoopro-{weight}-webfont.woff2
     before using --font-oedoopro; see the @font-face block below. */
  --font-oedoopro: 'OedooPro', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;

  --text-micro: 13px;
  --leading-micro: 1.4;
  --text-caption: 15px;
  --leading-caption: 1.4;
  --text-body-sm: 17px;
  --leading-body-sm: 1.5;
  --text-body: 19px;
  --leading-body: 1.55;
  --text-body-lg: 22px;
  --leading-body-lg: 1.5;
  --text-subheading: 26px;
  --leading-subheading: 1.3;
  --text-heading-sm: 34px;
  --leading-heading-sm: 1.2;
  --text-heading: 44px;
  --leading-heading: 1.15;
  --text-heading-lg: 60px;
  --leading-heading-lg: 1.05;
  --text-display: 84px;
  --leading-display: 0.98;

  /* Named after OedooPro's actual weight files, not generic CSS convention -
     "medium" here is the file called Medium (600), not the CSS-spec default of 500. */
  --font-weight-thin: 100;
  --font-weight-extralight: 200;
  --font-weight-light: 300;
  --font-weight-book: 400;
  --font-weight-regular: 500;
  --font-weight-medium: 600;
  --font-weight-bold: 700;
  --font-weight-black: 900;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-80: 80px;

  /* Radius */
  --radius-chip: 9999px;
  --radius-button: 9999px;
  --radius-card: 20px;
  --radius-card-lg: 28px;
  --radius-input: 16px;

  /* Touch */
  --touch-min: 56px;
  --touch-primary: 88px;

  /* Elevation */
  --shadow-float: 0 10px 28px rgba(22, 35, 28, 0.18);
  --border-hairline: 1px solid var(--color-border-200);
}
```

### Tailwind v4

```css
@theme {
  --color-field-700: #1d6b45;
  --color-field-500: #2fa06a;
  --color-field-300: #8fd6ae;
  --color-field-100: #e1f4e9;
  --color-profit-600: #26804c;
  --color-loss-600: #c1502e;
  --color-loss-100: #fbe7df;
  --color-wheat-800: #8a5a12;
  --color-wheat-500: #e3a233;
  --color-wheat-100: #fbeed2;
  --color-sky-500: #3e8fd0;
  --color-ink-900: #16231c;
  --color-slate-600: #56655d;
  --color-mist-200: #e7efe9;
  --color-mist-100: #f3f7f4;
  --color-border-200: #d6e0d9;
  --color-paper: #ffffff;

  /* Local, licensed font, load via the @font-face block above, not a Google Fonts import. */
  --font-oedoopro: 'OedooPro', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;

  --text-micro: 13px;
  --text-caption: 15px;
  --text-body-sm: 17px;
  --text-body: 19px;
  --text-body-lg: 22px;
  --text-subheading: 26px;
  --text-heading-sm: 34px;
  --text-heading: 44px;
  --text-heading-lg: 60px;
  --text-display: 84px;

  --font-weight-thin: 100;
  --font-weight-extralight: 200;
  --font-weight-light: 300;
  --font-weight-book: 400;
  --font-weight-regular: 500;
  --font-weight-medium: 600;
  --font-weight-bold: 700;
  --font-weight-black: 900;

  --radius-chip: 9999px;
  --radius-button: 9999px;
  --radius-card: 20px;
  --radius-card-lg: 28px;
  --radius-input: 16px;
}
```

---

## Screen inventory (V1)

Every screen this system currently specifies, so a gap is visible rather than discovered mid-build.

| Screen               | Primary components                                                                                                  | Status                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Onboarding (4 steps) |                                                                                                                     | ⚠️ **Not specified.** Needs a pass before build       |
| Home dashboard       | P&L Hero, Data Freshness Chip, Plot Card, Task Board, Mic FAB, Recurring Nudge                                      | ✅                                                    |
| Plot detail          | Plot header, Task Row list, expense history, Empty States                                                           | ✅                                                    |
| Task board (full)    | Task Row, swipe actions, Overdue Banner, section headers                                                            | ✅                                                    |
| Task sheet           | Task Sheet, Due-Date Chip Group                                                                                     | ✅                                                    |
| Round                | Round Screen, Mic Capture Button, inline confirmation strip, Round summary                                          | ✅                                                    |
| Expense capture      | Confirmation Sheet, all three input paths, error + loading states                                                   | ✅                                                    |
| Ledger / bookkeeping | Expense rows, Split Allocation Row, recurring chips                                                                 | ✅                                                    |
| Fixed expenses       | Recurring form, allocation strategy                                                                                 | ⚠️ **Form layout not specified**                      |
| Reports / export     |                                                                                                                     | ⚠️ **Not specified.** Low risk, but currently a blank |
| Plans                | Plans Screen                                                                                                        | ✅                                                    |
| Upgrade gate         | Upgrade Gate Sheet                                                                                                  | ✅                                                    |
| Settings             | Role Badge, member list, invite flow, notification hour                                                             | ⚠️ **Member/invite screens not specified**            |
| Plot detail          | Plot Detail Screen, four tabs (Profitability, Tasks, Journal, Expenses), Forecast Update                            | ✅                                                    |
| Capture Sheet        | Capture Tab & Sheet, three-way picker                                                                               | ✅                                                    |
| Journal (full)       | Journal list, Log Entry Sheet, type selector                                                                        | ✅                                                    |
| Spray Log            | Dedicated Spray Log screen, plot filter, safe-harvest chip, regulator export                                        | ✅                                                    |
| Money tab            | Expense rows, Split Allocation Row, receipts, reports and export, merged from the old Ledger + Reports destinations | ✅                                                    |
| Receipt viewer       | Receipt Thumbnail, full-screen document viewer, file upload affordance                                              | ⚠️ **Not specified**                                  |
| Web client, shell    | Sidebar nav, routing, desktop layout frame                                                                          | ✅ See _Web Client Shell_ above (added Stage 2)       |
| Web client, screens  | Desktop table layouts, action column, filters, keyboard shortcuts                                                   | ⚠️ **Not specified.** Specify per screen in Stage 3-4 |

---

_This document defines V1 visual language, tracking PRD v3.0. A handful of screens are flagged above as unspecified, extend this document as they are built, rather than re-deriving conventions per feature._
