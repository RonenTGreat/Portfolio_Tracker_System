# UI Design Prompt — Portfolio Tracker
### A design specification for implementation (Next.js + Recharts)

---

## 0. Creative Thesis

This is a **ledger**, not a dashboard.

The subject is a personal investment record kept every quarter, by hand, with discipline — closer in spirit to a passbook or an accountant's columnar ledger than to a consumer fintech app. The design should feel like a well-kept physical record that happens to compute itself: precise rules, aligned figures, ink-toned colors, and a quiet ritual marker for each quarter closed. Nothing about it should look like a generic analytics SaaS template (no drop-shadow cards floating on a gradient, no neon KPI tiles, no rainbow chart palette).

**Avoid on purpose:** the cream-background/serif/terracotta look, the near-black/neon-accent look, and the zero-radius broadsheet-newspaper look. This system borrows the *precision* of a ledger and the *warmth* of paper, but is built from financial record-keeping materials specifically — passbooks, ink stamps, columnar figures — not from any of those three defaults.

---

## 1. Design Tokens

### 1.1 Color Palette

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#EFEDE4` | Page background. A dulled bone/paper tone — greyer and quieter than a cream default, meant to recede. |
| `--ink` | `#1B2A3A` | Primary text, rules, primary buttons, navigation. A deep blue-black, like ledger ink rather than pure black. |
| `--ink-soft` | `#57616E` | Secondary text, captions, inactive nav items. |
| `--brass` | `#B08D3E` | Primary accent. Used for the Quarter Stamp, active states, primary data highlights, and the Mutual Funds chart color. Sparingly — this is the one warm, valuable-feeling color in the system. |
| `--ledger-green` | `#2F5D45` | Positive values, growth, "in the black," Emergency Fund chart color. |
| `--ledger-red` | `#9C3B2E` | Negative values, over-target warnings, Crypto chart color (deliberately — it's the volatile one). |
| `--slate` | `#5B7A8C` | T-Bills chart color, neutral informational accents, focus rings. |
| `--rule` | `#D9D4C4` | Hairline dividers and table rules (not `--ink` — softer, so rules recede behind data). |
| `--paper-raised` | `#F7F5EE` | Slightly lighter than `--paper`, used for input fields and the "page" surface sitting on top of the paper background — the only elevation cue in the system, no drop shadows. |

**Bucket → color mapping (fixed, used identically across every chart in the app):**

| Bucket | Color |
|---|---|
| ETFs | `--ink` (`#1B2A3A`) |
| Mutual Funds | `--brass` (`#B08D3E`) |
| Crypto | `--ledger-red` (`#9C3B2E`) |
| Emergency Fund | `--ledger-green` (`#2F5D45`) |
| T-Bills | `--slate` (`#5B7A8C`) |

This mapping must never change between chart types or pages — a pie slice, a bar, and a stacked-column segment for "Crypto" are always the same red, so a user can identify a bucket by color alone, instantly, anywhere in the app. This is a functional requirement, not just a style note: comparison views (Section 8.4/8.5) depend on the two pies being visually comparable.

### 1.2 Typography

| Role | Typeface | Notes |
|---|---|---|
| Display | **Fraunces** (variable, use optical size + soft ink-trap styles) | Page titles, section headers, the large KPI headline number on the Dashboard. Set at least at weight 400–500, never bold-for-bold's-sake. Has enough warmth to feel like a crafted record, not a corporate face. |
| Body | **IBM Plex Sans** | All UI copy, labels, buttons, nav, form fields. |
| Data / Tabular | **IBM Plex Mono** | Every monetary figure, percentage, ticker symbol, and date. This is a functional choice, not decorative: ledgers align figures in fixed-width columns so the eye can compare magnitudes at a glance — mono numerals do this natively. Use tabular-nums / lining figures throughout. |

**Type scale (rem, base 16px):**

| Token | Size | Line height | Use |
|---|---|---|---|
| `--type-display-xl` | 3.5rem | 1.05 | Dashboard hero KPI (Total Portfolio Value) |
| `--type-display-lg` | 2.25rem | 1.1 | Page titles ("Dashboard", "Compare Quarters") |
| `--type-display-md` | 1.5rem | 1.2 | Section headers ("Current Allocation", "Target vs. Actual") |
| `--type-body-lg` | 1.125rem | 1.5 | Lead paragraph / empty-state copy |
| `--type-body` | 1rem | 1.5 | Standard UI text |
| `--type-body-sm` | 0.875rem | 1.4 | Captions, helper text, table headers |
| `--type-data-lg` | 1.75rem | 1.2 | Secondary KPI figures (mono) |
| `--type-data` | 1rem | 1.4 | Table figures, chart tick labels (mono) |
| `--type-data-sm` | 0.8125rem | 1.3 | Dense table rows on mobile, chart legends (mono) |

### 1.3 Spacing & Grid

- Base unit: **8px**. All padding/margin/gaps are multiples of 8 (8, 16, 24, 32, 48, 64).
- Content max-width: **1200px**, centered, with 32px side padding (16px on mobile).
- Ledger rows (table-like lists) use a **12-column grid** internally so figure columns align vertically down the page — the same alignment discipline as a real ledger sheet.

### 1.4 Radius, Borders, Elevation

- **No drop shadows anywhere.** Elevation is expressed only through the `--paper` → `--paper-raised` color shift, plus a single 1px `--rule` border.
- Radius: **2px** on inputs, buttons, and the Quarter Stamp badge — just enough to soften, not enough to feel "app-like." Tables and page containers: **0px** (sharp, like a page edge).
- Dividers: 1px solid `--rule`, used between table rows and to separate dashboard sections — never a full card border box around every element (avoid the "everything in its own rounded card" default).

### 1.5 Iconography

Use a single-weight line icon set (Lucide, stroke width 1.5) only where an icon replaces a real action (edit, delete, sort arrow, up/down variance indicator). Do not decorate section headers with icons — a ledger doesn't illustrate "Assets" with a little coin icon, and neither should this.

### 1.6 Motion

- Durations: 120ms for hover/focus states, 240ms for panel transitions, 400ms for the one signature moment (Section 2).
- Easing: `cubic-bezier(0.2, 0, 0, 1)` (a confident decelerate — nothing bouncy).
- Respect `prefers-reduced-motion`: disable the stamp/page-turn animation and cross-fade instead.

---

## 2. Signature Element — The Quarter Stamp

The one memorable, unique device in this design: **every recorded quarter gets a stamp.**

When a quarter's data entry is completed, a circular ink-stamp graphic appears — rendered in `--brass`, roughly 72px diameter, with a slightly irregular/hand-stamped rotation (between -4° and +4°, seeded per quarter so it's consistent, not random on every render) and a subtle ink-bleed texture at the edge (a low-opacity blurred duplicate of the stamp outline, offset by 1-2px). Inside the ring: the quarter and year in `IBM Plex Mono`, e.g. `Q2 · 2026`.

**Where it appears:**
- On the Dashboard timeline, above each quarter's point on the portfolio-value line chart.
- In the Data Entry history list, next to each completed quarter.
- At the top of each side in the Quarter Comparison view (Section 8.4) — two stamps, side by side, immediately telling the user which two quarters they're looking at, the way you'd flip to two stamped pages in a physical ledger.

**Interaction:** on hover/focus, the stamp lifts very slightly (2px translateY, 120ms) and a tooltip shows the exact date entered. Clicking it on the Dashboard timeline jumps to that quarter in the Comparison view with this quarter pre-selected as side A.

**States:**
- *Current/latest quarter:* full opacity, solid `--brass`.
- *Past quarters:* 70% opacity — still legible, recedes slightly behind the current one.
- *Upcoming/not-yet-entered quarter* (visible as a placeholder on the timeline once its date has passed): a dashed outline only, no fill, `--ink-soft` color, with a small "+" — clicking it opens Data Entry for that quarter.

---

## 3. Global Layout & Navigation

**Shell:** a fixed left rail (240px wide on desktop, collapses to a bottom tab bar under 768px) styled as a set of ledger-page tabs rather than a conventional sidebar: each nav item is a horizontal label with a thin `--rule` divider above and below, not a rounded pill or icon-first nav button.

Nav items (in order): **Dashboard · Data Entry · Strategy · Compare**

Active item: `--ink` text on `--paper-raised` background, with a 3px solid `--brass` bar on its left edge (like a tab flag) — no background pill shape.

**Top bar:** minimal — just the page title (`--type-display-lg`) on the left and, where relevant, the primary action button on the right (e.g., "Add Quarter" on Data Entry). No logo treatment needed beyond a small wordmark ("Ledger" or the user's chosen app name) set in Fraunces at the top of the nav rail.

**Page container:** sits on `--paper`, content area is `--paper-raised` only where it needs to visually separate from the page background (data tables, forms) — most of the Dashboard's chart area can sit directly on `--paper` with just rules to separate sections, keeping the "open ledger page" feeling rather than "boxes on a page."

---

## 4. Chart System

All charts (Recharts) share one visual language:

- **No gridlines by default** — a ledger page has rules, not graph paper. If a reference line is needed (e.g., a target band), render it as a single dashed `--ink-soft` line, not a full grid.
- **Axes:** `IBM Plex Mono`, `--type-data-sm`, `--ink-soft` color, 1px `--rule` axis line only (no tick marks extending into the plot area).
- **Tooltips:** styled as a small stamped card — `--paper-raised` background, 1px `--rule` border, 2px radius, figures in mono, no drop shadow (use a 1px `--ink` border at 8% opacity to lift it instead).
- **Legends:** small square swatches (not circles/dots — squares read more "ledger tick-box"), `--type-body-sm`, positioned below the chart, left-aligned.
- **Line chart (Total Portfolio Value over time):** 2px `--ink` line, no area fill beneath it (keep it a line, not a gradient-filled area — avoid the generic fintech "area chart with gradient fade" look). Data points marked with small 4px squares, filled `--ink`, that swap to the Quarter Stamp treatment when hovered (see Section 2).
- **Stacked column (Composition over time):** segments colored per the fixed bucket mapping (Section 1.1), 1px `--paper` gap between segments so each bucket reads as a distinct block, not a blurred gradient.
- **Pie chart (Current Allocation):** flat fills per bucket mapping, no 3D/depth effect, no drop shadow, thin 1px `--paper` stroke between slices. Percentage labels in mono, placed outside the pie with a thin leader line rather than crowded inside small slices.
- **Variance / target-drift line (Section 8.5):** the target is shown as a shaded horizontal **band** (± tolerance, e.g. 5 percentage points) in a 10%-opacity fill of the relevant bucket color, rather than a single hard line — communicates "acceptable range" more honestly than a line implying false precision.

---

## 5. Component Library

**Buttons**
- Primary: `--ink` background, `--paper` text, 2px radius, `--type-body` weight 500. Hover: background shifts to `--brass`.
- Secondary: transparent background, 1px `--ink` border, `--ink` text. Hover: `--paper-raised` fill.
- Destructive (delete a quarter/holding): `--ledger-red` text, no fill, 1px `--ledger-red` border on hover only.

**Inputs**
- `--paper-raised` background, 1px `--rule` border, 2px radius, `--type-body` for labels, `--type-data` (mono) for numeric entry fields specifically (GHS values) so what you type visually matches how it'll display once saved.
- Focus state: border becomes 1.5px `--slate`, no glow/shadow.

**Ledger Table** (used for holdings lists, comparison deltas, variance tables)
- No zebra striping. Rows separated by 1px `--rule` only.
- Figure columns right-aligned, mono, tabular-nums.
- Row hover: `--paper-raised` background only, no shadow/lift.
- A row representing a bucket **total** gets a 1px `--ink` top border (like a subtotal rule in a real ledger) and `--type-body` weight 600.

**Variance Badge** (used wherever current vs. target is shown inline)
- Small pill, 2px radius (not fully rounded), mono text, e.g. `+21.9pp`.
- Color logic: within tolerance band → `--ink-soft` text, `--paper-raised` background (quiet, nothing to flag). Outside tolerance → colored by direction: over-target uses `--ledger-red`, under-target uses `--slate`, both at 12% background tint with full-strength text color.

**Quarter Selector / Tabs** (Comparison view)
- Two side-by-side stamp-topped panels (see Section 2) with a small "vs." set in Fraunces italic between them — the one place italics appear in the whole system, reserved for this single connective word to give it a slightly human, handwritten-annotation feel.
- Each panel has a dropdown below its stamp to change which quarter it represents, styled as understated text with a small caret, not a heavy select box.

**KPI Card** (Dashboard)
- No border, no shadow, no background box — just the label (`--type-body-sm`, `--ink-soft`, uppercase, letter-spacing 0.04em) above the figure (`--type-display-xl` for the hero figure, `--type-data-lg` for the other three), separated from neighboring KPIs by a single 1px vertical `--rule` divider rather than individual card boxes. Reinforces "one page, ruled into sections" rather than "four floating widgets."

---

## 6. Page-by-Page Specifications

### 6.1 Dashboard (`/dashboard`)

1. **Header row:** page title "Dashboard" (Fraunces, display-lg) + current date range subtitle in `--ink-soft`.
2. **KPI row:** the four figures from FR-4 (Total Value, QoQ Change, Crypto %, Safety Net %), using the KPI Card component, divided by rules, not boxes.
3. **Total Portfolio Value Over Time:** full-width line chart with Quarter Stamps at data points, per Section 4/2.
4. **Two-column row (desktop) / stacked (mobile):**
   - Left: Portfolio Composition Over Time (stacked column)
   - Right: Current Allocation (pie chart), with a small "as of Q2 · 2026" caption in mono under its title
5. **Target vs. Current by Bucket:** the Ledger Table component, each row showing Bucket / Target % / Current % / Variance Badge, sorted by |variance| descending by default so the most-off-target bucket is the first thing seen — the dashboard should surface drift, not bury it.

### 6.2 Data Entry (`/data-entry`)

1. Page title + primary button "Add Quarter" (top right).
2. **History list:** reverse-chronological list of past quarters, each row showing its Quarter Stamp (small, 40px, inline) + date + total value (mono) + edit/delete icon buttons on hover.
3. **Entry form** (modal or dedicated route — recommend a dedicated route `/data-entry/new` given how many fields there are): grouped by asset class exactly as in the SRS holdings table —
   - Section header "ETFs" (display-md) → VOO / QQQM / SCHD input rows
   - Section header "Mutual Funds" → Epack / ArkFund / MFund input rows
   - Section header "Crypto" → BTC / ETH / SOL / Hot Narratives input rows
   - Section header "Cash & Safety" → T-Bill / Achieve input rows
   - Each input row: ticker/name on the left (body font), GHS input field on the right (mono, right-aligned, currency prefix "GHS" in `--ink-soft`)
   - Running total shown live at the bottom of the form, right-aligned, mono, `--type-data-lg`, with a 1px `--ink` top rule — the form itself behaves like a ledger page being totaled as you fill it in.

### 6.3 Strategy (`/strategy`)

1. Page title + subtitle "Target allocation, updated quarterly."
2. **By-bucket target table:** Ledger Table, editable Target % cells (inline edit on click, not a separate edit mode toggle), Current % and Variance Badge columns read-only alongside.
3. **Detailed holdings table** below a `--rule` divider: same structure as the spreadsheet's Section B (Category / Bucket / Type / Target % / Description), grouped visually by bucket using the bucket color as a 3px left-border accent per group of rows (not per individual row — reinforces grouping without adding a badge to every line).
4. Saving a new target shows a brief inline confirmation in the interface's own voice: "Target updated for Q3 2026 onward." — not a generic toast "Success!".

### 6.4 Quarter Comparison (`/compare`)

1. Page title "Compare Quarters."
2. **Quarter Selector** component (Section 5) at the top: two stamp-topped panels, defaulting to latest vs. previous quarter.
3. **Paired pie charts** directly below the selector, side by side, same size, same bucket color mapping, each captioned by its quarter stamp — this is the FR-6 requirement that the two allocations be visually comparable at a glance.
4. **Delta table** below: Ledger Table with columns Holding / Bucket / Quarter A value / Quarter B value / Δ GHS / Δ %, sortable by clicking any column header (default sort: |Δ GHS| descending, so the biggest mover leads).
5. A single-sentence auto-generated summary line above the delta table, in `--type-body-lg`, e.g.: *"Crypto grew GHS 1,240 (+22%) while ETFs grew GHS 180 (+6%) between these two quarters."* — written in the interface's own voice per the writing guidance: plain, specific, no exclamation points.

### 6.5 Target vs. Actual, historical (within `/strategy` or `/compare`, designer's choice — recommend a tab within Strategy called "Drift Over Time")

1. A quarter picker (single stamp, not a pair) defaulting to latest.
2. **Paired pies:** Actual allocation vs. Target allocation for the selected quarter, same treatment as 6.4's paired charts, so a gap is visible as differing slice sizes, not just a number.
3. **Drift-over-time line chart** per bucket: one line per bucket (colored per the fixed mapping) showing variance-from-target across every quarter on record, with the ± tolerance band (Section 4) shaded behind each line. This is the chart that should make a slow drift toward overweight-crypto visible many quarters before it becomes a surprise.

---

## 7. States

**Empty states** (no quarters recorded yet, on Dashboard/Compare):
> "Nothing recorded yet. Enter your first quarter to open the ledger."
— with the primary action button directly beneath, not a decorative illustration. A ledger's empty state is an invitation to write the first entry, not a cartoon.

**Loading states:** skeleton rows using `--rule`-colored blocks in the exact shape of the real content (ledger rows, stamp outline) — never a generic spinner.

**Error states** (e.g., failed save): stated plainly in the interface's voice, e.g. *"Couldn't save Q3 2026 — check your connection and try again."* — never "Oops!" or an apology.

---

## 8. Responsive Behavior

### 8.1 Breakpoint System

| Token | Range | Applies to |
|---|---|---|
| `--bp-desktop` | ≥1024px | Full layout as specified in Sections 5-6 |
| `--bp-tablet` | 768px–1023px | Nav rail narrows (see 8.2); two-column chart rows may start wrapping to one column earlier than desktop |
| `--bp-mobile` | 480px–767px | Nav rail collapses to bottom bar; most two-column layouts become single-column |
| `--bp-mobile-sm` | <480px | KPI row drops to single column; type scale steps down one level (see 8.3) |

Use these as the only breakpoints in the system — resist adding one-off breakpoints per component, which is how responsive systems drift out of sync over time.

### 8.2 Navigation

- At `--bp-mobile` and below, the left nav rail becomes a **fixed bottom bar**, full width, same four items (Dashboard · Data Entry · Strategy · Compare), equally spaced.
- Labels stay as text (no icons introduced) — but shrink to `--type-body-sm` and the active-state left-edge brass bar (Section 3) rotates to sit as a **top edge** on the active bottom-bar item instead, since "left edge" has no meaning in a horizontal bar.
- The bar has a `--paper-raised` background and a single 1px `--rule` top border (consistent with "no drop shadows" — elevation still comes only from the paper/paper-raised shift).
- Respect iOS/Android safe-area insets (`env(safe-area-inset-bottom)`) so the bar isn't obscured by a home indicator.
- Minimum tap target for each bottom-bar item: 44×44px (Apple/Android accessibility minimum), even though the visual label may be smaller — pad the tappable area, not just the text.

### 8.3 Typography Scaling

Desktop sizes (Section 1.2) are tuned for a 1200px canvas and are too large at phone widths — scale down one step per role below `--bp-mobile`:

| Role | Desktop | Mobile (<768px) |
|---|---|---|
| `--type-display-xl` (hero KPI) | 3.5rem | 2.25rem |
| `--type-display-lg` (page title) | 2.25rem | 1.5rem |
| `--type-display-md` (section header) | 1.5rem | 1.25rem |
| `--type-data-lg` (secondary KPI) | 1.75rem | 1.375rem |
| Body/data/caption roles | unchanged | unchanged — only display roles need to shrink |

### 8.4 KPI Row (Dashboard)

- Desktop: 4 columns divided by vertical rules (Section 5's KPI Card spec).
- Tablet/`--bp-mobile`: 2×2 grid; the vertical rule between columns 1-2 and 3-4 stays, but a new **horizontal** rule appears between the two rows.
- `--bp-mobile-sm`: single column, all dividers become horizontal rules stacked between each KPI, full-width.
- The hero KPI (Total Portfolio Value) keeps top position at every breakpoint — it's the one number that should never require scrolling to see first.

### 8.5 Charts

Each chart type needs a specific mobile treatment, not just "shrink the container":

- **Line chart (Portfolio Value):** reduce Quarter Stamp overlay size at data points from 72px to ~28px below `--bp-mobile` (a full-size stamp would overlap neighboring points once ~6+ quarters are on a narrow screen) — treat the small mobile version as a simplified "dot," and move full stamp detail to the tap/tooltip interaction instead (8.9).
- **Stacked composition chart:** below `--bp-mobile`, consider switching from 5 stacked segments to horizontal scroll of the same chart (min-width fixed to something legible, e.g. 480px) rather than squeezing 5 colors into a 320px-wide column — a compressed stacked chart with 5 segments becomes unreadable well before the text does.
- **Pie chart:** outer radius scales down proportionally with container width; legend (Section 4) wraps to 2 columns instead of a single row once labels don't fit one line.
- **Paired comparison pies (Compare page, Section 6.4):** stack vertically at `--bp-mobile` (already specified) — additionally, keep both pies the **same size** as each other at every breakpoint (never let one shrink more than the other due to surrounding content), since equal size is what makes the shape comparison meaningful.
- **Drift-over-time line chart (Section 6.5):** with 5 bucket lines plus tolerance bands, this is the densest chart in the system — below `--bp-mobile`, offer a bucket filter (tap a legend swatch to isolate one line) rather than trying to keep all 5 legible at once on a small screen.

### 8.6 Ledger Tables

- Below 600px: drop the least-critical column first (Description, then Type in the Detailed Holdings table) — never truncate the Ticker/Holding name or any figure column.
- If dropping columns still leaves a table too wide (e.g., the Compare page's 4-column delta table on a 320px screen), allow **horizontal scroll within the table only** (not the whole page) with the first column (Bucket/Holding name) frozen/sticky, so the user always has row context while scrolling to see the figures.
- Row height increases slightly on touch devices (from ~40px to ~48px) to keep tap targets comfortable, per 8.9.

### 8.7 Data Entry Form

- Desktop: label-left, input-right on one line per holding (Section 6.2).
- Below `--bp-mobile`: switch each field to **label-above, input-below**, full width — a right-aligned mono input squeezed next to a label on a 320px screen becomes cramped and error-prone to tap accurately.
- The asset-class section headers (ETFs / Mutual Funds / Crypto / Cash & Safety) become sticky within the scrolling form on mobile, so as the user scrolls through 12 fields they always know which section they're in.
- The running total footer stays **fixed to the bottom of the viewport** (not just the bottom of the form) while the form is open on mobile, so the live-updating total is always visible without scrolling back down — this is arguably more useful on mobile than desktop, since mobile users are more likely to lose their place while scrolling a long form.

### 8.8 Compare / Paired-Panel Views

- Side-by-side quarter panels and paired pies stack vertically below `--bp-mobile`, each keeping its own stamp header.
- The "vs." connector (Fraunces italic, Section 5) rotates from a vertical divider to a horizontal one, centered between the stacked panels, with a short rule extending on each side of the word — reads like a horizontal ledger-page fold rather than a floating word.
- Order on mobile: Quarter A panel → "vs." → Quarter B panel → summary sentence → both pies stacked → delta table. Keep the auto-generated summary sentence (Section 6.4.5) directly above the pies at every breakpoint — it's the fastest thing to read on a small screen before scrolling into charts/tables.

### 8.9 Touch Targets & Hover-Dependent Interactions

Several desktop interactions in this spec rely on `:hover`, which doesn't exist on touch devices — each needs an explicit touch equivalent, not just a silent absence of the effect:

| Desktop hover behavior | Touch equivalent |
|---|---|
| Quarter Stamp lifts 2px + shows tooltip (Section 2) | Tap shows the same tooltip in a small popover anchored to the stamp; no lift animation needed |
| Ledger row background tint on hover | Replace with a brief (100ms) background flash on tap, to confirm the tap registered, then proceed to whatever the row's tap action is |
| Icon buttons (edit/delete) showing on row hover only | On touch, icon buttons are **always visible** at reduced opacity (60%) rather than hover-revealed — touch has no concept of "hovering to reveal," so hiding them until interaction would make them undiscoverable |
| Inline-editable Target % (click to edit, Section 6.3) | Same tap-to-edit behavior works fine on touch as-is; ensure the tappable text has at least a 32px-tall hit area even though the visible text is smaller |

All interactive elements (buttons, stamps, icon buttons, table sort headers) must meet a **minimum 44×44px tap target** at `--bp-mobile` and below, even where the visual element is smaller — pad invisibly rather than enlarging the visible design.

### 8.10 Performance Note

Fraunces and IBM Plex Sans/Mono should load via `font-display: swap` (Section 10 already specifies `next/font/google`, which handles this by default) so mobile users on slower connections see correctly-sized system-font text immediately rather than a layout shift once the custom fonts arrive.

---

## 9. Accessibility

- All color-coded meaning (variance badges, bucket colors) must also be conveyed through text/labels, never color alone — e.g., a Variance Badge always shows the signed number, not just a colored dot.
- Minimum contrast: body text on `--paper`/`--paper-raised` must meet WCAG AA (verify `--ink-soft` at 4.5:1 against both backgrounds; darken slightly if needed once implemented against the final background hex).
- Visible keyboard focus on every interactive element (2px `--slate` outline, 2px offset) — never `outline: none` without a replacement.
- Charts: pair every chart with a visually-hidden data table (or an accessible summary sentence, as in 6.4.5) so screen reader users get the same information non-visually.
- Respect `prefers-reduced-motion` throughout (Section 1.6).

---

## 10. Implementation Notes (for Claude Code)

- Define all tokens in Section 1 as CSS custom properties in a single `globals.css` (or Tailwind theme extension if the project uses Tailwind) — do not hardcode hex values inside components.
- Load Fraunces (variable) and IBM Plex Sans/Mono via `next/font/google` for performance and to avoid layout shift.
- Recharts: wrap chart color logic in a single shared `bucketColors` map (Section 1.1) imported everywhere a chart is rendered, so the fixed color-per-bucket rule (critical for the Comparison views) can never drift between components.
- The Quarter Stamp should be a single reusable `<QuarterStamp />` component accepting `quarter`, `year`, `state` (`current` | `past` | `upcoming`), and `size` props, since it's reused at three different sizes across Sections 2's listed locations.
- Build the "as-of" caption pattern (e.g., "as of Q2 · 2026") as a shared small component too, since it recurs on every chart that shows a single quarter's snapshot.
