# LEDGER INSTRUMENT — The CompanyOS Web Design Language

**Version 3.0 · Contract specification · Implement literally.**

> **What changed in 3.0, and what to trust.** The application is now built
> to the **Shopify admin**, measured. Twenty of its screens are in
> `.refs/shopify/` and every number read off them — with the pixel column it
> was read from — is in
> [SHOPIFY_MEASUREMENTS.md](SHOPIFY_MEASUREMENTS.md). **That file is the
> normative source for geometry, and `app/globals.css` implements it.**
> Where a paragraph below argues from the 2.0 numbers, the measurements win.
>
> The values 3.0 changes:
>
> | | 2.0 | 3.0, measured |
> |---|---|---|
> | Chassis | a header beside the rail | a 56px `#0a0a0a` bar above both, with the body a sheet turning a 10px corner under it |
> | Rail | 288px, 40px rows, 10px radius | 240px, 28px rows, 8px radius, `#ebebeb` |
> | Canvas | `#ffffff` | `#f1f1f1`, with cards white on it |
> | Body type | 15px | 13px, with a 12px caption and a 20px page title |
> | Controls | 36px, fully round | 28px buttons and 32px inputs, 8px radius |
> | Primary action | the brand blue | `#303030`; the accent stays on links, focus and checked controls |
> | Secondary action | a bordered white button | a flat `#e3e3e3`, no border |
> | Icons | Lucide, one hairline weight | Phosphor: `fill` in the rail, `regular` everywhere else |
> | Headings | a `label-caps` uppercase role | sentence case; the reference has no uppercase text at all |
> | Table | 52px rows, ruled between columns | 53px rows on a 35px `#f7f7f7` header, ruled horizontally only |
> | Page gutter | 48px at 1024 and up | 16px, at every width |
> | Saving | a button in a card footer | the bar's own slot becomes the save bar |
>
> What 3.0 does NOT change is everything this document is actually about:
> the four principles, the surface ladder, the three line weights, the
> closed list of hues, the zero-data specifications, and the prohibition on
> coloured chrome. Those survived the reference change because they were
> never about the reference.

> **Read [../anti-slop.md](../anti-slop.md) first.** Its twenty-one rules are
> mandatory and blocking on every user-facing surface in this project, and they
> sit above this document: this language says what Company OS looks like, the
> rules say what never ships regardless. A surface has to pass both. Exceptions
> are argued in writing and recorded in [../DESIGN.md](../DESIGN.md) under
> Argued exceptions; an exception that is not written down is a violation.

Every hex, pixel, duration and token name in this document is normative. Where a value is given, use that value. Where a rule is stated as a prohibition, a violation of it is a review failure, not a matter of taste. Every contrast ratio quoted has been computed, not estimated; the numbers are reproducible from the hex values given.

---

## 1. NAME AND THESIS

**LEDGER INSTRUMENT.**

CompanyOS is version control for a company's business context. The interface is therefore not an app that displays your company — it is an instrument you _read_ your company off of, and the thing it reads is a ledger. So the interface behaves like a well-made measuring device bound as a ruled book: an almost invisible neutral chassis; a hard surface ladder that tells you at a glance what is ground and what is an object; needles that are the only coloured things on screen; and, wherever something has history, a revision rail with commit nodes running down its left edge. Every number is tabular and sits next to its own shape — a sparkline, a delta, a threshold band — so a value never appears without its trend. Every identifier (content hash, sequence number, slug, endpoint, key prefix, branch ref) is set in Geist Mono with positive tracking, because in a versioned system the string _is_ the truth and must be scannable character by character. Density is earned, never assumed: a row is dense because every column is typed and icon-marked, the way the ForgeUI log table is — not because we shrank the padding.

This language is held to four principles. They are ranked; when two conflict, the lower-numbered one wins.

> **P1 — STRUCTURE IS MONOCHROME, SIGNAL IS COLOUR.**
> All structural chrome and all primary actions are near-black on white in light mode and near-white on near-black in dark mode. Hue enters the interface only as a value the user must decode. If you cannot finish the sentence _"this hue means \_\_\_"_ with a noun from the domain — status, data series, delta, threshold, diff, validation — the hue does not ship. §4 enumerates every permitted use exhaustively; that list is closed.

> **P2 — THE GROUND IS BELOW, THE OBJECT IS ABOVE.**
> The page ground is a recessive neutral. Cards are pure white (light) or a lighter near-black (dark) and sit _above_ it on a hairline plus a near-subliminal shadow. The current app inverts this — cards are `bg-muted/50`, _darker_ than the page, with no border and no shadow — and that single inversion is most of why the product reads as an anonymous template. Correcting it is the highest-leverage change in this document.

> **P3 — HIERARCHY COMES FROM WEIGHT, SIZE AND SURFACE — NEVER FROM COLOUR, AND NEVER FROM MORE BORDERS.**
> To make one thing outrank another, change its weight (400→600), its size, or its rung on the surface ladder. Do not tint it. Do not add a rule around it. There are exactly three border weights (§5) and adding a fourth is a review failure.

> **P4 — ELEVATION IS EARNED, AND EMPTY IS DESIGNED.**
> A raised surface means "this is a distinct object", not "I wanted a box". And the zero-data rendering of every component is part of that component's specification, not a fallback discovered later — a company that has committed nothing must look finished, not broken. An empty gauge is still a gauge.

**What this language explicitly rejects:** coloured brand chrome; a blue active nav item, tab underline or focus ring; coloured primary buttons; hero marketing rhythm inside the app; gradients as decoration; illustration and mascots; oversized "friendly" empty states; count-up number animations; card-in-card padding sprawl; eleven department hues; and lists rendered as flex stacks of identical rounded grey rectangles.

---

## 2. SURFACES

### 2.1 The law

Elevation is distance from the canvas. **In light mode, raised moves toward white. In dark mode, raised moves toward light.** Recessed always moves _toward_ the canvas value and past it. The page ground is never the brightest thing on screen in light mode and never the lightest thing in dark mode.

Each rung has a verb, and the verb is what decides whether you may use it:

| Rung      | Verb                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `canvas`  | **hosts** — everything scrolls on it                                                    |
| `rail`    | **frames** — the persistent chassis                                                     |
| `raised`  | **is an object** — you can act on it as a whole                                         |
| `inset`   | **is a cavity** — a well cut into a raised surface                                      |
| `object`  | **is a discrete thing inside a card** — a row that reads as separable without elevation |
| `overlay` | **is temporarily above** — it will disappear                                            |

**ADJACENCY RULE.** A region surface may only be adjacent to a rung ±1 away. If you find yourself putting an `inset` directly on the `canvas`, you have skipped a card. **Maximum region nesting depth is `canvas → raised → (inset | object)`. Three fills. If a design needs a fourth, the layout is wrong.**

**`--track` is not a rung.** Segmented-control tracks, meter tracks, progress tracks and skeleton fills are _fills_, not regions, and may appear on any rung. They are darker than every region in both modes so they read as recessed wherever they land. This is the one exemption from the adjacency rule and it is exhaustive: nothing else claims it.

### 2.2 Tokens

```css
/* ---------- LIGHT (:root) ---------- */
--surface-canvas: #ffffff;
--surface-rail: #f7f7f7;
--surface-raised: #ffffff;
--surface-inset: #fafafa;
--surface-selected: #ececec;
--surface-object: #f3f3f3;
--surface-overlay: #ffffff;
--surface-inverse: #0d0d0d;
--track: #ececec;
--segment-track: #f0f0f0; /* the segmented control's track */
--segment-thumb: #ffffff; /* its travelling thumb */
--surface-scrim: rgba(0, 0, 0, 0.4);

/* ---------- DARK (:root.dark) ---------- */
--surface-canvas: #212121;
--surface-rail: #131313;
--surface-raised: #212121; /* a card is the ground plus a border */
--surface-inset: #1a1a1a;
--surface-selected: #303030;
--surface-object: #2a2a2a;
--surface-overlay: #2b2b2b;
--surface-inverse: #f3f3f3;
--track: #303030;
--segment-track: #0d0d0d;
--segment-thumb: #303030;
--surface-scrim: rgba(0, 0, 0, 0.62);
```

### 2.3 Rule per level

**`--surface-canvas` — the page ground.** Everything scrolls on it. It holds text directly in exactly three cases: the page large-title block, sticky section/date group headers, and the `label-caps` group heading that sits _above_ a card. Nothing with a border sits flush on it without a ≥16px gutter.

**`--surface-rail` — the chassis.** The left navigation sidebar and the sticky commit bar. It is a **peer** surface, not a floating panel: it takes a 1px `--line-hairline` on its content-facing edge and **never casts a shadow onto the canvas, in either mode.** In light it is one step below the white page (`#F7F7F7`), so the page reads as the lit surface and the rail as the frame around it. In dark the rail is _darker_ than the page (`#131313` against `#212121`), which is the reference dashboard's move: chrome recedes, and the search field on it, drawn at `--surface-raised`, reads as the one lit object in the frame.

**`--surface-raised` — the object.** Cards, panels, table containers, stat strips, chart panels, right-rail cards, field-group cards, toasts, dialogs. This is the default home for content. Always `1px solid var(--line-border)`, and no shadow in the flow. In both themes a card is the page ground plus its border: the reference separates objects with lines, not with a lighter fill, and a drop shadow is invisible on `#212121` anyway. The rungs that do step away from the ground are `--surface-object` and `--surface-selected` (the composer, the active navigation row) and `--surface-overlay` (a menu above everything).

**`--surface-inset` — the cavity.** Table header rows, code/JSON wells, diff gutters, hash chips, kbd caps, icon tiles (neutral), search fields, the collapsed-context row in a diff, the active sidebar nav row, the table footer. Never a page ground. **Never nested inside another inset.**

**`--surface-object` — the discrete inset row.** A row inside a card that must read as its own separable thing without being elevated: right-rail summary rows, grouped-list rows in a settings ledger, the capability rows in the members roster. Radius 12, `1px solid var(--line-hairline)`, **no shadow, ever.** This is the Remote "Available leave" / "Pending approval" box. Because its separation from the card is thin by design (1.042 light, 1.059 dark), **the hairline is load-bearing and may not be dropped.**

**`--surface-overlay` — the transient layer.** Dropdown menus, popovers, chart hover cards, the command palette, dialogs, toasts. In light it is the same white as a card and separation comes entirely from `--elev-2`/`--elev-3`; in dark it steps one rung lighter than a card so a menu opened over a card is unambiguously above it.

**`--surface-scrim` — behind modals only.** `backdrop-filter: blur(2px) saturate(0.9)`. 2px, not 12px: this is a scrim, not frosted glass.

**`--surface-inverse` — the micro-surface exception.** Tooltips and only tooltips invert: light `#14161A` with `#FFFFFF` text, dark `#F2F4F6` with `#0D0F12` text. A tooltip must read instantly against any rung it is thrown over, and inversion is the only treatment that does that without colour.

### 2.4 State fills

Always alpha, never a hardcoded hex, so they composite correctly over every rung:

```css
--state-hover: rgba(0, 0, 0, 0.045); /* dark: rgba(255,255,255,0.06) */
--state-active: rgba(0, 0, 0, 0.085); /* dark: rgba(255,255,255,0.10) */
--state-selected: rgba(0, 0, 0, 0.06); /* dark: rgba(255,255,255,0.08) */
```

### 2.5 Lines — exactly three weights

A card and its internal dividers must never use the same weight. **There is no fourth weight.** Adding one is a P3 violation.

```css
/* LIGHT */ /* DARK */
--line-hairline: #ececec;
--line-hairline: #2c2c2c;
--line-border: #e3e3e3;
--line-border: #353535;
--line-strong: #c8c8c8;
--line-strong: #595959;
```

- **`--line-hairline`** — dividers _inside_ a card: table row separators, stat-strip vertical rules, grouped-list separators, chart gridlines (dashed), the `--surface-object` row border, the sidebar's section rules, the revision rail spine.
- **`--line-border`** — the outer edge of every raised surface, the sidebar's right edge, inputs, chips.
- **`--line-strong`** — the secondary button's border at rest (the reference draws its outline buttons a full step darker than a card edge), hover borders on inputs, the chart crosshair, threshold ticks, drag handles, the active sortable-header underline, the neutral bar-chart fill.

### 2.6 The inversion being corrected

|             | Today (wrong)                                | This spec (correct)                                       |
| ----------- | -------------------------------------------- | --------------------------------------------------------- |
| Page ground | `--background` `#ffffff`                     | `--surface-canvas` `#F4F5F7`                              |
| Card        | `bg-muted/50` — **darker than the page**     | `--surface-raised` `#FFFFFF` — **lighter than the page**  |
| Card border | `border-border`, same as everything          | `--line-border`, distinct from internal `--line-hairline` |
| Card shadow | none                                         | `--elev-1`, a 1px micro-shadow                            |
| Sidebar     | `bg-muted/50` — **identical fill to a card** | `--surface-rail`, a peer surface with an edge hairline    |

`components/ui/card.tsx` shipping `rounded-lg border border-border bg-muted/50` while `components/shell/app-shell.tsx` ships `bg-muted/50` on the `<aside>` is the single defect this section exists to delete. **A card and the navigation chrome may never share a fill.**

---

## Approved companyos identity, September 2026

The brand symbol is now two interlocking orthogonal brackets, defined in
`components/brand/logo.tsx`, replacing the old commit-node logo. It renders
with currentColor and preserves the same geometry in light and dark themes.
The wordmark is exactly `companyos`, lowercase without spaces, in the
logo-only `t-brand` role: Geist Sans, 20px size, 24px line height, weight 400,
-0.045em tracking. Marketing lockups use a 24px mark; compact application
placements preserve their existing icon slot. Product prose may still use
the readable name Company OS. Functional revision nodes are unchanged.

The favicon uses this same mark and follows the browser's color scheme.
The root Open Graph and Twitter preview use the approved iridescent glass
artwork. The bounded social-artwork exception is recorded in DESIGN.md.

## 3. TYPOGRAPHY

### 3.1 Faces

```css
--font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
--font-mono: var(--font-geist-mono), ui-monospace, monospace;
```

Two faces. There is no third, no display face, and no serif. `--font-serif` and `--font-display` are **deleted** from the token set — they were aliased to the interface face, used nowhere, and advertised in the README as something the product does not have.

Weights used: **400, 500, 600.** Never 300, never 700 or above: the reference sets its titles at 600 and gets its hierarchy from size, and so does this product.

### 3.2 The optical tracking rule

Tracking is a function of size, not a per-component whim. **This table is the authority.** It supersedes any formula; do not interpolate with arithmetic, read the row.

| Size    | Sans tracking | Uppercase adds           | Mono tracking |
| ------- | ------------- | ------------------------ | ------------- |
| ≥30px   | −0.024em      | _(caps forbidden ≥19px)_ | 0em           |
| 26–29px | −0.018em      | —                        | 0em           |
| 19–25px | −0.012em      | —                        | 0em           |
| 17–18px | −0.006em      | —                        | 0em           |
| 15–16px | −0.002em      | —                        | 0em           |
| 14px    | 0em           | +0.07em                  | 0em           |
| 13px    | +0.002em      | +0.07em                  | 0em           |
| 12px    | +0.006em      | +0.07em                  | +0.010em      |
| 11px    | +0.010em      | +0.07em                  | +0.010em      |

Three rules attach to this table and are non-negotiable:

1. **Geist Mono never takes negative tracking, at any size.** Negative tracking destroys the character-by-character scannability of a content hash, which is the only reason the mono face is in the product.
2. **Uppercase below 12px without positive tracking is a bug.** A caps label at 11px sets at `+0.010em + 0.07em = +0.080em`.
3. **11px is the floor for uppercase.** There is no 10px and no 9px caps role. The current codebase ships `text-[9px] uppercase tracking-wider` for the registry's `start` marker and `text-[10px]` in four other places; all of them are deleted.

Mono set inline inside IBM Plex Sans prose renders at `font-size: 0.92em` so the x-heights match. Standalone mono uses its literal px size.

### 3.3 The numeric rule

`font-variant-numeric: tabular-nums lining-nums` and `font-feature-settings: "tnum" 1, "lnum" 1` are **mandatory** on: every table numeric column, every KPI value, every delta, every meter readout, every timestamp, every revision sequence number, every content hash, every token count, every chart axis label, and every count inside a chip or badge.

**The one carve-out: non-tabular numerals are permitted only inside running prose** (a document's `body-read` text, a paragraph of help copy). Tabular figures inside a sentence are wrong.

A column of numbers that does not align on the digit is a defect, not a nitpick.

### 3.3b Three rules the scale obeys

- **Headings are tight.** Every title role sits at a line-height of 1.1 to 1.3 with negative tracking that grows with size; a heading set at body leading reads loose and cheap.
- **Body breathes a little.** `body` is 15/22 and `body-read` 16/26, left aligned, sentence case. More leading than that and a paragraph falls apart; less and it clots. Body never centres.
- **Caps get air.** The two uppercase roles carry +0.08em and +0.07em. Capitals set at body tracking cramp.
- **Units sit on the baseline.** A price and its unit (`£49` and `a month`), a metric and its suffix, share one baseline in a `flex items-baseline` row; the unit is a lighter, smaller role, never superscript.
- **Field labels are sentence case, medium weight, primary ink.** Weight marks the label's role; the uppercase role belongs to tables and stat strips.

### 3.4 The scale

| Role             | px  | Weight | Line-height | Tracking                                  | Usage                                                                                                              |
| ---------------- | --- | ------ | ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `display`        | 36  | 600    | 40px        | −0.026em                                  | The one large title on ATLAS, LEDGER STREAM, REGISTRY and BLANK SLATE: the reference's `Home`.                     |
| `title-1`        | 28  | 600    | 32px        | −0.022em                                  | Page large-title on every route that does not own `display`. Dialog titles.                                        |
| `title-2`        | 24  | 600    | 28px        | −0.018em                                  | Section headings on a page (`Recommended models`), the document H1 in the reader.                                  |
| `title-3`        | 20  | 600    | 24px        | −0.014em                                  | Card titles, panel titles, right-rail card heading, chart panel title.                                             |
| `title-4`        | 17  | 600    | 22px        | −0.010em                                  | Sub-section headings, field-group names, empty-state titles, date-group titles.                                    |
| `title-compact`  | 15  | 600    | 20px        | −0.002em                                  | The collapsed page title inside the top bar.                                                                       |
| `body-read`      | 16  | 400    | 26px        | −0.002em                                  | Document prose in the reader and editor **only**. Measure capped at 68ch / 720px.                                  |
| `body`           | 15  | 400    | 22px        | 0em                                       | Default UI text: navigation rows, table cells, form values, menu items, descriptions.                              |
| `body-medium`    | 15  | 500    | 22px        | 0em                                       | The active navigation row, breadcrumb segments, md/lg button labels, the switcher name.                            |
| `body-strong`    | 15  | 600    | 22px        | 0em                                       | Line 1 of a two-line table cell, list-row titles, tab labels, toast titles, commit messages.                       |
| `cell`           | 15  | 400    | 20px        | 0em                                       | Table cells.                                                                                                       |
| `stat-label`     | 15  | 400    | 20px        | 0em                                       | The label above a stat-strip value.                                                                                |
| `caption`        | 14  | 400    | 20px        | 0em                                       | Line 2 of two-line cells, helper text, chart axis labels, author names, meta strings, empty-state body.            |
| `caption-medium` | 14  | 500    | 20px        | 0em                                       | sm button labels, filter chips, segmented-control items.                                                           |
| `caption-strong` | 14  | 600    | 20px        | 0em                                       | Emphasised meta: a count beside a label, the row title in a dense list.                                            |
| `micro`          | 13  | 500    | 18px        | +0.002em                                  | Table footer counts, tooltips, badge text, `vs prev 30d` suffixes, pagination, legend labels, xs button labels.    |
| `label-caps`     | 12  | 600    | 16px        | **+0.080em**, `text-transform: uppercase` | Table column headers, stat-strip captions, field labels, rail-card row labels, result-group headers, status pills. |
| `group-label`    | 12  | 500    | 16px        | +0.070em, `text-transform: uppercase`     | Sidebar group labels (`DEPARTMENTS`, `MANAGE`), the reference's `PROJECTS`.                                        |
| **Numeric**      |     |        |             |                                           | _(all carry `tabular-nums lining-nums`)_                                                                           |
| `metric-xl`      | 32  | 600    | 36px        | −0.024em                                  | The headline number on a hero readout.                                                                             |
| `metric-stat`    | 22  | 500    | 28px        | −0.014em                                  | The value in a stat-strip cell: the reference's `8,991`.                                                           |
| `metric-lg`      | 24  | 600    | 28px        | −0.018em                                  | Right-rail summary values, run-economics headline, SEQUENCE DETAIL sequence number.                                |
| `metric-md`      | 18  | 600    | 24px        | −0.006em                                  | Meter readouts, inline emphasised numbers.                                                                         |
| `metric-sm`      | 14  | 600    | 20px        | 0em                                       | In-table numbers, delta values, threshold values, chart tooltip values.                                            |
| **Mono**         |     |        |             |                                           | _(Geist Mono)_                                                                                                     |
| `mono-hash`      | 13  | 500    | 18px        | +0.010em                                  | 7-character content hashes, agent-key prefixes, document slugs, MCP endpoint fragments, run ids.                   |
| `mono-hash-lg`   | 14  | 500    | 20px        | 0em                                       | The full 40-character hash on a revision detail surface.                                                           |
| `mono-seq`       | 13  | 600    | 18px        | +0.010em                                  | Revision sequence numbers, rendered zero-padded to four digits. Diff `+n / −m` counts.                             |
| `mono-code`      | 14  | 400    | 22px        | 0em                                       | Code blocks, MCP request/response snippets, endpoint paths, diff row content, JSON payloads.                       |
| `mono-micro`     | 12  | 500    | 16px        | +0.010em                                  | Diff gutter line numbers, kbd glyphs, agent avatar codes, department codes.                                        |

### 3.5 The identifier discipline

Three rules, because in this product the identifier is the evidence.

1. **Sequence numbers are zero-padded to four digits and prefixed with `#`:** `#0007`, `#0142`, `#1608`. Beyond `#9999` the number grows and the column widens. In a table they occupy a **fixed 56px right-aligned column**. They **never wrap, never truncate and never abbreviate — the layout yields to them.** A column of revisions must read as a straight edge down the page.
2. **Content hashes render at exactly 7 characters** in a `HashChip` (§9), with the full value in the tooltip and on copy. A revision-detail surface renders the full 40 in `mono-hash-lg`. A hash is never truncated with an ellipsis and never rendered in body text colour.
3. **`revisionCount` of 0 renders as `0`, not as an absence.** Absence of a count and a count of zero are different facts in a versioned system. The current code renders `· r{seq}` only when `seq` is truthy, collapsing revision 0 and `null` into the same nothing; that is a data-integrity bug expressed as a layout.

### 3.6 Text colour ramp

Hierarchy decays down this ramp. Colour **never** marks category — only importance.

```css
/* LIGHT */ /* DARK */
--text-primary: #0d0d0d;
--text-primary: #f3f3f3;
--text-secondary: #4b4b52;
--text-secondary: #b0b0b5;
--text-tertiary: #66666e;
--text-tertiary: #98989d;
--text-quaternary: #707077;
--text-quaternary: #8a8a8f;
--text-inverse: #f7f7f7;
--text-inverse: #0d0d0d;
```

- `--text-primary` — titles, metric values, table line 1, active nav, document prose.
- `--text-secondary` — body, column header labels, inactive tabs, secondary button labels.
- `--text-tertiary` — meta, table line 2, captions, axis labels, default icon colour, **and every em-dash "no data" value.**
- `--text-quaternary` — **non-informational only**: placeholders, disabled labels, breadcrumb separators, unsorted sort chevrons, the empty-tree glyph. It may never be the sole carrier of meaning, and it is **never used on `--surface-overlay`** (use tertiary there).

**Support text is lighter, never lighter-weight.** The ramp separates primary content from support by colour alone: primary ink for the thing being read, a visibly lighter grey for what supports it in light mode and a visibly darker one in dark mode. Weight is reserved for role (a list-row title, a field label), not for hierarchy between a sentence and its caption.

**Measured.** `--text-secondary` clears 7.3:1 (light) and 6.1:1 (dark) on `--track`, the darkest ground it can sit on; `--text-tertiary` clears 4.8:1 and 4.6:1 there, which is what anti-slop rule 6 asks of body text. `--text-quaternary` is 4.9:1 (light) and 4.7:1 (dark) on the canvas, so the small readings that use it (counts beside labels, step numbers) still clear AA.

---

## 4. COLOUR

### 4.1 THE RULE

> **Structural chrome is MONOCHROME. The brand carries one hue, the accent, and it means exactly one thing: this is where you act.** Near-black on white in light mode; near-white on near-black in dark mode. **Every other colour is functional signal — a value the user must decode.**

"Structural chrome" means, exhaustively: the page ground, cards, the sidebar, the top bar, all borders and dividers, secondary and ghost buttons, the active nav item, the tab underline, the selection fill of a row, filter chips, icon tiles in their default state, avatars, scrollbars, and all typography.

**The accent** (`--accent`, blue: `#2563EB` light, `#5B9CFF` dark) is used consistently and only for: the primary button, links inside prose (`.t-link`), the checked state of a checkbox, radio or switch, the focus ring, and text selection. It is never a status, never decoration, and never applied to a surface. This is the Apple pattern: one hue, everywhere it appears it is an invitation to act.

If any other colour cannot be given a one-word job — _status, series, delta, threshold, diff, validation_ — it does not ship.

### 4.2 Monochrome action tokens

```css
/* THE ACCENT — light */                /* dark */
--accent:             #2563EB;          #5B9CFF;
--accent-hover:       #1D55D6;          #6AA6FF;
--accent-active:      #1A4BC0;          #4D8FF5;
--accent-text:        #1D4FD8;          #86B6FF;   /* links: 6.6:1 / 7.8:1 */
--accent-wash:        rgba(37,99,235,.10)  rgba(91,156,255,.16)

/* PRIMARY BUTTON — the accent, with a label that clears 5.2:1 / 6.3:1 */
--action-fill:        var(--accent);
--action-label:       #FFFFFF;          #0B1A33;
--action-fill-hover:  var(--accent-hover);
--action-fill-active: var(--accent-active);

/* FOCUS — the one hue chrome carries. A keyboard user's position must read
   against every rung at once, and a monochrome ring vanishes on the inverse
   button and the selected row; the reference rings its focused row blue. */
--focus-ring:         var(--accent);

/* SELECTION */
--selection:  rgba(0,0,0,0.14);         rgba(255,255,255,0.20);
```

Primary button label contrast: **19.4:1** light, **16.7:1** dark. Focus ring on the canvas: 4.65:1 light, 5.63:1 dark.

**Links in prose** — because "no blue links" is an unfinished rule without a replacement:

```css
color: var(--text-primary);
text-decoration: underline;
text-underline-offset: 3px;
text-decoration-thickness: 1px;
text-decoration-color: rgba(
  20,
  22,
  26,
  0.28
); /* dark: rgba(242,244,246,0.32) */
```

On hover the decoration goes to full ink. Links are never blue, and links in **chrome** (nav rows, breadcrumbs, card header actions) carry no underline at all — they are ordinary rows with hover fills.

### 4.3 Semantic signal roles

Each role ships four values: `-text` (AA-legible on canvas, card and its own wash), `-mark` (chroma-forward, for dots, strokes, fills and glyphs; clears 3:1 as a graphical object), `-wash` (a low-alpha background), `-border`.

```css
/* ---------------- LIGHT ---------------- */
--positive-text: #0f6e3b;
--positive-mark: #14874a;
--positive-wash: rgba(20, 135, 74, 0.1);
--positive-border: rgba(20, 135, 74, 0.28);
--caution-text: #875100;
--caution-mark: #b87708;
--caution-wash: rgba(184, 119, 8, 0.12);
--caution-border: rgba(184, 119, 8, 0.32);
--critical-text: #ae2217;
--critical-mark: #cc3227;
--critical-wash: rgba(204, 50, 39, 0.1);
--critical-border: rgba(204, 50, 39, 0.3);
--agent-text: #5831be;
--agent-mark: #7346e8;
--agent-wash: rgba(115, 70, 232, 0.1);
--agent-border: rgba(115, 70, 232, 0.28);
--info-text: #0a6870;
--info-mark: #0c8a93;
--info-wash: rgba(12, 138, 147, 0.1);
--info-border: rgba(12, 138, 147, 0.28);
--neutral-mark: #98a0ac;
--neutral-wash: rgba(20, 22, 26, 0.06);
/* --neutral-text = --text-secondary */

/* ---------------- DARK ----------------- */
--positive-text: #49d07f;
--positive-mark: #2fbe6b;
--positive-wash: rgba(47, 190, 107, 0.16);
--positive-border: rgba(47, 190, 107, 0.3);
--caution-text: #f0b44a;
--caution-mark: #e3a02b;
--caution-wash: rgba(227, 160, 43, 0.16);
--caution-border: rgba(227, 160, 43, 0.3);
--critical-text: #ff867c;
--critical-mark: #ef5a4c;
--critical-wash: rgba(239, 90, 76, 0.16);
--critical-border: rgba(239, 90, 76, 0.32);
--agent-text: #b79fff;
--agent-mark: #9a79f2;
--agent-wash: rgba(154, 121, 242, 0.16);
--agent-border: rgba(154, 121, 242, 0.3);
--info-text: #4fd0d8;
--info-mark: #29b4be;
--info-wash: rgba(41, 180, 190, 0.16);
--info-border: rgba(41, 180, 190, 0.28);
--neutral-mark: #6b7480;
--neutral-wash: rgba(255, 255, 255, 0.08);
```

**Job of each role — the only meanings these hues carry:**

| Role       | Job                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `positive` | head revision · merged branch · succeeded run · accepted receipt · healthy threshold band · good-direction delta · diff-add                                 |
| `caution`  | uncommitted/dirty field · open branch · draft document · key expiring <7d · stale beyond cadence · warn threshold band · run in progress                    |
| `critical` | failed run · revoked or expired key · merge conflict · bad-direction delta · diff-remove · breached threshold · validation error · destructive confirmation |
| `agent`    | agent-issued key · agent-authored revision · MCP lane · agent identity tile · the `run_event` marker                                                        |
| `info`     | the `in review` document state · the second chart series. **Teal, deliberately not blue**, so no mark can be mistaken for a link or a brand accent.         |
| `neutral`  | archived · closed · not started · no data · not applicable                                                                                                  |

**`agent` violet marks machine origin and nothing else.** It does **not** double as the `draft` document state (which would make a violet dot ambiguous between "an agent wrote this" and "this is unpublished"). `draft` takes `caution`; agent origin also carries a _shape_ distinction (§5.3) so it survives greyscale.

**Measured, every value.** All ten `-text` values clear 4.5:1 on card, canvas _and_ their own wash (light 5.57–8.08, dark 5.99–10.37). All ten `-mark` values clear 3:1 as graphical objects (light 3.39–5.57, dark 5.07–7.59).

### 4.4 Data-series palette

```css
/* light */                    /* dark */
--series-1: #6E60D7;           #815DDA;   /* VIOLET — always the headline series */
--series-2: #D6396A;           #E5537F;   /* pink */
--series-3: #D97A2B;           #EF9A5C;   /* orange */
--series-4: #2F9A7A;           #53B596;   /* teal */
```

**`--series-1` is the violet of the reference's charts.** A one-series chart is violet on a monochrome ground, which is how a reading is told apart from the chrome around it at a glance. The violet is also the `agent` signal's hue: a chart series and an agent mark never share a surface, and both mean "a machine produced this number", so the overlap is a rhyme rather than a collision.

**`positive` green and `critical` red are RESERVED and may never be assigned as series colours.** A green or red mark inside a plot therefore always means good/bad, never "series 3". A fifth series is not permitted — group the tail into "Other" at `--neutral-mark`.

**Departments are never colour-coded.** Eleven hues would collide with the six-role status vocabulary and become decoration. See §8 for how departments are identified instead.

### 4.5 Diff palette — the only tinted _content_ surfaces

```css
/* ------------- LIGHT ------------- */          /* ------------- DARK ------------- */
--diff-add-bg:      #E7F4EC;                     #143524;
--diff-add-strong:  #C9E9D6;   /* intra-line */  #1E5238;
--diff-add-gutter:  #BCE3CD;                     #22603F;
--diff-add-ink:     #0F5D34;                     #7EE0AC;
--diff-del-bg:      #FBEAE8;                     #3F1D19;
--diff-del-strong:  #F6D3CF;                     #5C2A24;
--diff-del-gutter:  #F0C8C4;                     #6B322B;
--diff-del-ink:     #8F1C13;                     #FFA9A1;
--diff-move-bg:     #F0EBFC;                     #2A2444;
--diff-move-gutter: #D9CDF4;                     #3E3566;
--diff-move-ink:    #4A2A9E;                     #CBB8FD;
--diff-context:     transparent;                 transparent;
```

Measured: ink-on-row-background 7.04–8.50 (light), 8.17–8.40 (dark); every row background separates from the card by ≥1.13 (light) and ≥1.14 (dark). _(An earlier candidate dark delete tint sat at 1.005 against the card — invisible. The value above is the corrected one.)_

**Diff colour is always doubled with position.** Every added line carries a `+` glyph and a 3px left gutter bar; every removed line carries `−` and its bar. Roughly 8% of male users cannot separate the two hues, and the markers — not the tints — are what make the diff readable to them. Removing the markers "for cleanliness" is a review failure.

### 4.6 The exhaustive list of permitted colour

Nothing outside this list. **The list is closed: adding an entry requires removing one.**

1. Status dots (6px / 8px / 10px) and status pills.
2. Data-series strokes, area gradients, bar fills, hover dots and legend swatches inside a chart plot, its legend, or a sparkline.
3. Delta indicators: the ▲/▼ glyph and its numeral.
4. Threshold-banded numeric **values** — `85ms` green / `250ms` amber / `420ms` red — applied here to tokens-per-accepted-receipt, key days-to-expiry, document freshness against cadence, and completeness bands.
5. Diff add / remove / move: the gutter bar, the row background, the `+`/`−` glyph, and the intra-line `<mark>`.
6. Diff summary counts (`+128` positive, `−41` critical) and the 5-block stat bar.
7. Meter fill **only when the meter encodes a threshold**. A meter showing neutral progress (document completeness, upload progress) fills with `--text-primary`, monochrome.
8. Commit-node state on the revision rail: head = `positive`, branch ring = `agent`, conflicted ring = `critical`; every other node is `--text-tertiary`.
9. Agent origin: the agent identity tile's `--agent-wash` ground and `--agent-text` glyph.
10. Form validation: the error message text and the 1px input border in the error state; a `positive` check on async success.
11. Banner / callout: the 3px left rule and the leading icon, for the six roles.
12. Destructive affordances: `--critical-text` on ghost destructive buttons and menu items; and a **solid** `--critical` fill on exactly one element in the entire product — the confirm button inside a destructive confirmation dialog.
13. Toast leading icon.
14. The unread/notification dot: 6px `--critical-mark` with a 1.5px `--surface-rail` halo.
15. Text selection (`--selection`, monochrome — listed for completeness).

### 4.7 Explicitly forbidden

Coloured primary buttons · a coloured sidebar active state (it is `--surface-inset` + a 2px **monochrome** left bar) · a coloured tab underline (2px `--text-primary`) · a coloured focus ring · coloured filter-chip selection (selection is an inverted monochrome fill) · tinted icon tiles that carry no state · coloured links in chrome · gradients as decoration · brand-tinted page or card backgrounds · hue distinguishing one department from another · a raw hex literal or a `bg-blue-*`-style utility anywhere under `app/**`.

### 4.8 Enforcement

The rule survives contact with a stakeholder only if it is mechanical:

1. **Signal tokens are unavailable at the CSS-variable layer** to the `Button`, `NavRow`, `Tab`, `FilterChip` and focus-ring components. Not discouraged in prose — _not in scope_.
2. Ship **no raw hue tokens at all.** Colour is exposed exclusively as `--{positive|caution|critical|agent|info|neutral}-{text|mark|wash|border}`, `--series-{1..4}` and `--diff-*`. If a hue has no semantic token name, it cannot be typed.
3. A lint rule rejects hex literals and Tailwind palette utilities (`bg-blue-500`, `text-emerald-600`, …) under `app/**` and `components/**`.
4. **The same rule applies to stylesheets.** Rule 3 reads string literals in `.tsx`, so it only ever sees utility classes — which leaves an escape hatch exactly the size of _"write plain CSS instead."_ `scripts/lint-css-tokens.mjs` closes it: in any `.css` file a colour literal is legal **only** as the value of a custom property, and `font-size` / `font-weight` / `line-height` / `letter-spacing` may carry a literal **only** where the scale is defined — inside a custom property, or inside a `.t-*` role. Everywhere else both arrive as `var(--…)` or from a role.

   This is deliberately agnostic about _which_ tokens a surface declares. A scoped palette for a separate surface is allowed to exist; it simply has to be a palette rather than a habit. Defining `--landing-line: rgba(9,9,9,.12)` once is a design decision; writing that same `rgba()` inline in nine rules is nine decisions nobody made together.

   Violations predating the rule are recorded in `scripts/css-token-debt.json`, keyed by selector + property + value so the baseline survives edits and reordering. **It may only ever shrink** — regenerate it after _removing_ violations, never to silence new ones.

---

## 5. SHAPE AND ELEVATION

### 5.1 The radius principle

Radius is semantics, not decoration. It is what lets the eye sort a monochrome interface without hue:

> **Pill = "act on me." Rounded rectangle = "read me." Square = "compare me."**

Controls that get pressed are fully round. Containers that hold content are rounded rects at 10–20. Anything that is a grid of data is square at 0–8, because a grid of rounded cells reads as a toy.

### 5.2 Radius scale

```css
--r-0: 0px;
--r-2: 2px;
--r-4: 4px;
--r-6: 6px;
--r-8: 8px;
--r-10: 10px;
--r-12: 12px;
--r-14: 14px;
--r-16: 16px;
--r-20: 20px;
--r-full: 9999px;
```

| Token      | Applied to                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--r-0`    | Table cells and rows, diff rows and gutters, chart plot edges, full-bleed dividers, sticky date headers, the rail spine, hunk headers.                                           |
| `--r-2`    | Sparkline bar caps, meter fills ≤4px tall, diff gutter bars, chart legend swatches (12×3), the 2px selection bar.                                                                |
| `--r-4`    | Checkbox, skeleton text bars, kbd caps, inline mono tokens inside prose, table-cell micro-tags, hash chips.                                                                      |
| `--r-6`    | Inputs 28–32px, sm/xs buttons, icon buttons 28px, menu and palette rows, table-row hover fill, the agent square avatar, the agent commit node.                                   |
| `--r-8`    | Buttons 36px, icon tiles 28px, sidebar nav rows, popovers, dropdown menus, code wells, the commit-message input, canvas dropzones.                                               |
| `--r-10`   | Icon tiles 32px, right-rail cards, `--surface-object` rows, quick-action cards at compact size, standalone stat cells, small toasts.                                             |
| `--r-12`   | **The default object radius.** Cards, panels, table containers, stat strips, chart panels, `--surface-object` grouped rows, banners, tooltips, icon tiles 40px.                  |
| `--r-14`   | Large containers in dense contexts: the data-table container, the document reading column, icon tiles 48px.                                                                      |
| `--r-16`   | Page-level cards, quick-action cards, media tiles, task-row cards, the empty-state panel, right-rail summary cards.                                                              |
| `--r-20`   | Dialogs, sheets, drawers, the command palette. **Nothing in the product is rounder than 20 except pills.**                                                                       |
| `--r-full` | All buttons, filter chips, status pills, count badges, segmented-control track _and_ thumb, search fields, human avatars, pagination controls, switches, meter tracks and fills. |

### 5.3 The two shape rules that carry meaning

**HUMAN / MACHINE.** Human identity is a **fully round** avatar. Agent identity is a **rounded square** (`--r-6` at 24px, `--r-8` at 28px+) on `--agent-wash`. Round means person, square means process. On the revision rail this extends to the node itself: a human commit is a **circle**, an agent commit is a **rounded square** at the same optical size. This distinction is load-bearing across the timeline, revision history, run detail and key detail, and — crucially — **it works with colour removed**, which colour-only authorship marking does not.

**THE RAIL EXCEPTION.** Any row that abuts the revision rail is square on the edge that touches the spine and rounded on the other: `border-radius: 0 var(--r-8) var(--r-8) 0`. The row yields its edge so the spine reads as a continuous bound edge rather than a series of interrupted arcs.

### 5.4 Nesting and overflow

**Concentric radius rule:** `inner = outer − padding`, floored at `--r-4`. A 12-radius card with 16px padding takes `--r-0`/`--r-4` children, not another 12. An inner radius may never exceed its outer. Concentric mismatch is the fastest way to make a dense UI look cheap.

**Icon-tile ratio:** radius ≈ 0.30 × size — 28→8, 32→10, 40→12, 48→14. This reads as a superellipse without an SVG squircle, and it means a new tile size derives its own radius instead of drifting.

**Overflow:** a table inside a 14-radius card sets `overflow: hidden` on the card so the first header row and last footer row clip correctly; the header's own corners stay `--r-0`. Segmented thumbs, chips and pills never clip. A sticky table header keeps its top corners only while `scrollTop === 0`, then flattens to `--r-0` as the sticky shadow appears.

### 5.5 Stroke widths

Icon strokes: **1.5px** at 16–20px, **1.25px** at 14px, **2px** at ≥24px. Hairlines are exactly 1px and never scale — where a 1px border would be eaten by a `transform`, use an inset `box-shadow` instead.

### 5.6 What earns elevation — exactly three qualifications

1. It is a distinct addressable **object** the user can act on as a whole (card, table container, panel, right-rail card, stat strip).
2. It is a **transient layer** over content (menu, popover, tooltip, dialog, palette, toast).
3. It has **left the flow** and now overlaps scrolling content (sticky top bar, sticky table header, sticky commit bar).

### 5.7 What does NOT earn elevation — enforce as review failures

- **Sections inside a card.** Use a 1px `--line-hairline` rule, never a nested card.
- **Stat-strip cells.** They are divided by **vertical rules inside one `--elev-1` container** — never four separately-shadowed boxes with gaps. This is the single most identifiable structural signature of the language, taken directly from the ForgeUI KPI row.
- **The sidebar.** A peer surface with a right hairline. It never casts a shadow onto the canvas in either mode. A shadowed sidebar reads as a drawer; this one is permanent.
- **Table rows.** Hover changes background only.
- **`--surface-object` rows.** Flat, hairlined, never shadowed.
- Chips, pills, badges, segmented items, tabs, status dots, meters, sparklines, diff rows, nav items, icon tiles.

**Maximum stacking depth in the product: `canvas → elev-1 → elev-2`** (a menu opened from a card). `elev-3` always sits on a scrim, never on another elevated surface.

### 5.8 Elevation tokens

**LIGHT.** Elevation is a hairline plus a whisper of shadow. Shadow colour is always the ink hue, never pure black — black shadows on a warm-neutral ground read muddy.

```css
--elev-0: none; /* + 1px solid var(--line-hairline) where separating */
--elev-1:
  0 1px 0 0 rgba(20, 22, 26, 0.03), 0 1px 2px -1px rgba(20, 22, 26, 0.1); /* + 1px solid var(--line-border) */
--elev-1-hover:
  0 1px 0 0 rgba(20, 22, 26, 0.04), 0 2px 4px -2px rgba(20, 22, 26, 0.12); /* + 1px solid var(--line-strong) */
--elev-2:
  0 2px 4px -2px rgba(20, 22, 26, 0.1), 0 6px 16px -6px rgba(20, 22, 26, 0.14); /* + 1px solid var(--line-border) */
--elev-3:
  0 12px 32px -12px rgba(20, 22, 26, 0.24), 0 2px 8px -2px rgba(20, 22, 26, 0.1); /* + 1px solid var(--line-border) */
--elev-sticky:
  0 1px 0 0 var(--line-border), 0 4px 8px -6px rgba(20, 22, 26, 0.1);
--elev-sticky-up:
  0 -1px 0 0 var(--line-border), 0 -4px 12px -8px rgba(20, 22, 26, 0.14);
```

**DARK.** A drop shadow is physically invisible against `#0D0F12`, so elevation is carried by **a lighter surface + a 1px border + a 1px inset top highlight** — the highlight is what makes a dark card read as a physical plane catching light from above. The drop shadow is retained only under overlays, as a separating haze.

```css
--elev-0: none; /* + 1px solid var(--line-hairline) */
--elev-1: inset 0 1px 0 0 rgba(255, 255, 255, 0.04); /* + 1px solid var(--line-border) */
--elev-1-hover: inset 0 1px 0 0 rgba(255, 255, 255, 0.06); /* + 1px solid var(--line-strong),
                                                           background lifts to #1E2127 */
--elev-2:
  inset 0 1px 0 0 rgba(255, 255, 255, 0.06), 0 8px 24px -8px rgba(0, 0, 0, 0.6); /* + 1px solid var(--line-strong) */
--elev-3:
  inset 0 1px 0 0 rgba(255, 255, 255, 0.07),
  0 24px 60px -20px rgba(0, 0, 0, 0.75); /* + 1px solid var(--line-strong) */
--elev-sticky: 0 1px 0 0 var(--line-border); /* hairline only — a dark drop
                                                           shadow under a sticky header
                                                           only muddies */
--elev-sticky-up: 0 -1px 0 0 var(--line-border);
```

**Dark mode has two cues, not one.** Card-to-canvas separation is 1.124 and overlay-to-card is 1.127, but on a low-quality panel at 30% brightness those steps can flatten — so the 1px border and the inset highlight are both mandatory and neither may be treated as optional decoration.

**Hover elevation is an affordance claim, not a flourish.** `--elev-1 → --elev-1-hover` happens **only on cards that navigate or drag**. A stat-strip cell, a KPI card and a static panel do not lift, because you cannot click them. And a card that does lift changes `box-shadow` and `border-color` only — **no `translateY`.** Cards sharpen; they do not levitate.

**Focus never uses shadow as elevation.** It draws a two-stop ring that survives on every rung:

```css
box-shadow:
  0 0 0 2px var(--surface-raised),
  0 0 0 4px var(--focus-ring);
```

On a `--surface-inset`, `--track` or `--surface-canvas` ground, the **first** stop swaps to that ground's token so the offset gap actually reads.

### 5.9 Z-index ladder

`content 0 · rail-overlay lines 5 · sticky header 10 · sticky commit bar 20 · sidebar 30 · dropdown & popover 100 · dialog scrim 200 · dialog 210 · command palette 300 · toast 400.`

---

## 6. SPACING AND GRID

### 6.1 The 4pt scale

```css
--s-1: 2px;
--s-2: 4px;
--s-3: 6px;
--s-4: 8px;
--s-5: 12px;
--s-6: 16px;
--s-7: 20px;
--s-8: 24px;
--s-9: 32px;
--s-10: 40px;
--s-11: 48px;
--s-12: 64px;
```

Every margin, padding and gap in the product is one of these twelve values. **A hardcoded spacing value that is not on the scale is a review failure.** (6px and 2px exist because icon-to-label gaps and hairline offsets genuinely need a sub-4 step; nothing else may use them.)

### 6.2 Vertical rhythm inside a card

This is the operational half of "hierarchy comes from space", and it lets a reviewer catch a violation without measuring:

| Between                                     | Gap      |
| ------------------------------------------- | -------- |
| A heading and its content                   | **16px** |
| Two sibling blocks                          | **12px** |
| A label and its value                       | **8px**  |
| Two lines of the same cell                  | **4px**  |
| A field's control and its helper/error text | **6px**  |

### 6.3 Containers and grid

```css
--page-max: 1440px; /* content column ceiling */
--prose-max: 720px; /* 68ch — document reading measure */
--sidebar-w: 288px; /* collapsed: 48px */
--rail-w: 320px; /* right rail: min 280, max 360 */
--facet-w: 200px; /* in-page facet column (registry) */
--header-h: 56px; /* top bar */
--commitbar-h: 64px;
--rail-gutter: 28px; /* the revision rail grid track */
```

Page gutter: **16px** below 768 · **32px** from 768 to 1023 · **48px** at ≥1024.
Layout grid: **12 columns, 24px gutter.**

**One measure, owned by the shell.** `<main>` sets the container; **no page may declare its own `mx-auto max-w-*`.** The current app has six different measures across eleven pages (`max-w-md`, `-xl`, `-2xl`, `-3xl`, `-4xl`, `-5xl`), each `mx-auto` inside a main that is already offset by a 16rem sidebar, so the text column visibly jumps left and right on every navigation. Archetypes (§10) choose between exactly three container modes, and the shell implements them:

- `measure="prose"` → 720px centred
- `measure="page"` → 1440px centred _(default)_
- `measure="bleed"` → full width minus gutters

### 6.4 Density tiers

Two tiers only, exposed as a segmented control wherever a table offers it. There is no third.

|                         | Comfortable _(default)_           | Compact                                     |
| ----------------------- | --------------------------------- | ------------------------------------------- |
| Table row (two-line)    | 56px                              | 40px, line 2 collapses into a hover tooltip |
| Table row (single-line) | 44px                              | 36px                                        |
| Cell padding            | 12px 16px                         | 8px 12px                                    |
| Nav row                 | 34px                              | _(not offered)_                             |
| Grouped-list row        | 56px with tile / 44px label-value | _(not offered)_                             |

### 6.5 Hit targets

**28px minimum** in dense contexts (table row actions, toolbar icon buttons, rail controls). **36px** default. **44px** for primary actions and on coarse pointers.

Where the visual box is smaller than the required target, expand it with an invisible `::before { position:absolute; inset:-8px }` — **never by growing the visual box.** Density and touch-safety are not in conflict; they are solved in different layers.

---

## 7. MOTION

Motion exists to explain a change of state or position. **If nothing moved, nothing animates.**

### 7.1 Durations

```css
--dur-1: 90ms; /* pure state: hover fill, focus ring, text-colour step, row highlight, value crossfade */
--dur-2: 140ms; /* THE DEFAULT. Disclosure, tab underline travel, segmented thumb, chip toggle,
                     card elev-1→hover, sort-arrow swap, chevron rotation */
--dur-3: 200ms; /* layer entry: dropdown, popover, tooltip, toast, rail push, meter fill */
--dur-4: 260ms; /* dialog, command palette, sheet, drawer, full-screen focus route */
--dur-chart: 300ms; /* chart path draw — FIRST MOUNT ONLY */
--dur-rail: 420ms; /* revision-rail draw-in — FIRST MOUNT ONLY, see 7.3 */
```

**Exit rule:** every exit runs at **0.6×** its entry, floored at 100ms. A dropdown enters in 200ms and leaves in 120ms; a dialog enters in 260ms and leaves in 160ms. Things arrive deliberately and leave immediately.

### 7.2 Easings

```css
--ease-out: cubic-bezier(
  0.22,
  0.61,
  0.36,
  1
); /* entries, expansion, meter fill, chart draw */
--ease-in: cubic-bezier(0.4, 0, 1, 1); /* exits, only */
--ease-move: cubic-bezier(
  0.4,
  0,
  0.2,
  1
); /* SYMMETRIC: an element travelling between two
                                                        positions that are BOTH on screen —
                                                        segmented thumb, tab underline, drag reorder */
--ease-emphasis: cubic-bezier(
  0.32,
  0.72,
  0,
  1
); /* dialogs, sheets, palette, focus routes */
--ease-linear: linear; /* hover fills, opacity-only crossfades, spinner */
```

`--ease-move` is separate from `--ease-out` on purpose: when both endpoints are visible, an asymmetric decelerating curve looks like the element is falling into place rather than sliding to it.

**No springs. No overshoot. No bounce. An instrument's needle does not wobble.**

### 7.3 What animates, precisely

- **Segmented thumb** — `transform: translateX()` + `width`, `--dur-2 --ease-move`. The label colour crossfades over `--dur-1`. **The track never moves.**
- **Tab underline** — one absolutely-positioned 2px bar animating `transform` + `width`, `--dur-2 --ease-move`. Never per-tab borders.
- **Disclosure** (sidebar groups, field groups, diff hunks, date groups) — `grid-template-rows: 0fr → 1fr` + opacity, `--dur-2 --ease-move`; chevron `rotate(0 → 90deg)` on the same curve. **Never animate `height: auto`.**
- **Menu / popover / tooltip** — `opacity 0→1`, `translateY(-4px)→0`, `scale(0.98)→1`, `--dur-3 --ease-out`, `transform-origin` at the trigger edge. Exit 120ms `--ease-in`, opacity and scale only.
- **Dialog / palette** — scrim `opacity 0→1` `--dur-3` linear; panel `scale(0.97)→1` + `translateY(8px)→0` `--dur-4 --ease-emphasis`. Exit 160ms.
- **Sheet / drawer** — `translateX(100%)→0` (or `translateY` on mobile), `--dur-4 --ease-emphasis`.
- **Toast** — enter `translateY(12px)→0` + opacity `--dur-3 --ease-out`; exit `opacity` + `translateX(-8px)` 120ms. Auto-dismiss 5000ms (8000ms with an action; `critical` never auto-dismisses), paused on hover or focus-within.
- **Table row hover** — `background-color` `--dur-1 --ease-linear`. No transform, no border change, no scale.
- **Card hover** (navigating cards only) — `box-shadow` + `border-color` `--dur-2 --ease-out`. **No `translateY`.**
- **Large-title collapse** — driven **continuously by scroll position 0→48px**, not by a discrete threshold: the `display`/`title-2` title interpolates `opacity 1→0` and `translateY 0→-6px` while `title-compact` in the top bar does the inverse. Implement with a single `rAF`-throttled scroll handler writing one CSS custom property (`--title-collapse: 0..1`) that both elements read, or with `animation-timeline: scroll()` where supported. The sticky shadow is a separate, discrete change driven by an **IntersectionObserver sentinel**, not by the scroll handler.
- **Sticky shadow** — `box-shadow` + `opacity` 120ms linear, fired by an IntersectionObserver sentinel placed at the top of the scroll content. Never a scroll listener.
- **Meter fill** — `width` `--dur-3 --ease-out`, on mount and on value change. Indeterminate: a 30%-wide fill translating `-30% → 130%` over 1100ms `--ease-move` infinite.
- **Chart series** — path `stroke-dashoffset` draw over `--dur-chart --ease-out`, area fill `opacity 0→1` over 200ms delayed 120ms. **First mount only.** On a data change (range filter, refetch, tab return) the path **morphs via a 90ms opacity crossfade between the old and new `<path d>` — it never re-draws.** Re-drawing on every filter change is the single most annoying failure mode of hand-rolled charts.
- **Revision rail draw-in** — the one piece of ceremonial motion in the product, and the budget is exactly one: on **first mount** of LEDGER STREAM and the document history rail, the spine strokes in via `stroke-dashoffset` and the nodes fade + `scale(0.6→1)` staggered 24ms each, **capped at the first 12 nodes**; the rest appear instantly. Never on re-sort, re-filter, pagination or route return.
- **Commit-node pulse** — after a successful commit the new head node emits **one** ring: `scale(1→1.9)`, `opacity 0.45→0`, 600ms `--ease-out`, single iteration. This is the only celebratory motion in the product.
- **Button loading** — the leading icon slot crossfades to a 14px, 2px-stroke, 270° arc spinning 700ms linear infinite. The label persists and `min-width` locks to the measured pre-click width so the layout does not jump.
- **Skeleton** — `opacity 1 → 0.62` over 1200ms `--ease-move` infinite alternate. **A pulse, not a travelling shimmer gradient** — a shimmer implies horizontal progress that does not exist, and on a 40-row table it is nauseating. **After 8 seconds the pulse stops and the skeleton holds static: a stuck request must look stuck rather than perpetually busy.**

### 7.4 What must NEVER animate

- **Numbers.** No count-up, no odometer. KPI values swap instantly. A counting animation makes a reading instrument lie for 800ms.
- **Route transitions.** Content appears; the chassis never moves. A version-control tool should feel like it already knows the answer.
- **Table sorting and filtering.** Instant re-render. No FLIP, no reorder animation — rows moving under the cursor in a dense ledger is a legibility failure.
- **Entrance staggers** on lists, cards or table rows (the rail draw-in in §7.3 is the sole, bounded exception).
- **The theme flip.** Applying `.dark` must not crossfade any element through a wrong-mode intermediate colour. Set `data-theme-switching` on `<html>` for one frame with `[data-theme-switching] * { transition: none !important; }`, flip the class, then remove the attribute on the next `requestAnimationFrame`.
- Anything on the canvas ground; icon morphs other than the chevron rotate.

### 7.5 Reduced motion

Under `@media (prefers-reduced-motion: reduce)`:

- All `transform` animations are removed — thumb, underline and panel entries jump to their end state.
- All durations clamp to `0.01ms` **except opacity crossfades, retained at 90ms**, so state changes remain perceptible.
- The chart draw and the rail draw-in are disabled entirely (final state paints immediately).
- The commit-node pulse is disabled.
- The skeleton pulse becomes a static `--track` fill.
- The indeterminate meter becomes a static full-width track at 40% opacity.
- The live status-dot pulse becomes a static ring.
- The large-title collapse becomes an instant swap at `scrollY > 24`.

Nothing becomes non-functional.

---

## 8. ICONOGRAPHY

### 8.1 Sizing and stroke

| Context                                                 | Size    | Stroke |
| ------------------------------------------------------- | ------- | ------ |
| Dense table cell, meta line, chip                       | 14px    | 1.25px |
| Nav row, button, menu item, header cell, tile (28–32px) | 16px    | 1.5px  |
| Sidebar section, tile 40px, banner, toast               | 18–20px | 1.5px  |
| Empty-state tile 48px, page-header identity             | 24px    | 2px    |

One icon family, line style, consistently weighted. Default colour is `--text-tertiary`; `--text-secondary` inside an active nav row or a hovered control; `--text-primary` when active. An icon takes a signal colour **only** when it is one of the permitted uses in §4.6.

### 8.2 Semantic vs decorative — the ban

> **Every icon in the product must be either (a) the sole label of a control, or (b) a type marker that tells you what kind of thing a row is. There is no third reason to draw an icon. Decorative icons are forbidden.**

**Semantic (required):**

- Icon-only buttons — always with an `aria-label` and a 400ms-delay tooltip.
- The **type marker** at the head of a dense row: this is the ForgeUI move, where every column in the log table carries an icon so the row is scannable by shape before it is read. In CompanyOS this means the 12 `events.type` values, the document-kind marker, the field type (text / list / table / canvas), the run type, and the media MIME class.
- **Department glyphs** — see §8.3.
- Status glyphs inside banners and toasts.
- Disclosure chevrons, sort chevrons, the branch glyph, the copy glyph.

**Decorative (forbidden):** an icon beside a page title that just restates the title; an icon in an empty state that is not the neutral 48px tile; a sparkle beside an AI action; a "friendly" glyph in a card header; any icon whose removal would lose nothing.

**Never a raw emoji.** The `⚠ unconverted spend` that once sat in `EconomicsStrip` is a `critical` Banner with a 16px glyph; there is no emoji in the product.

### 8.3 Department identity

With hue unavailable as a categorical device (§4.4), department identity is carried by two things, and **the icon is never spent on anything else**:

1. **The glyph — mandatory, never replaced.** Eleven unique 16px line icons at 1.5px stroke: Landmark (business), Palette (brand), Megaphone (marketing), Handshake (sales), Package (product), Workflow (operations), Wallet (finance), Users (people), HeartHandshake (customer), Scale (legal), Cpu (technology). They live in the shared `DepartmentGlyph` primitive (`components/ledger/department-glyph.tsx`), which the rail, the overview cards, the department header, the timeline lane mark, the search palette and the import target map all draw from.
2. **The code — a compact _label_, never a replacement for the glyph.** Three uppercase mono letters, `mono-micro` on `--surface-inset`: `BUS BRD MKT SLS PRD OPS FIN PPL CUS LEG TEC`. It is used **only where the full label does not fit**: a 24px chip inside a dense table row, the command-palette left gutter, the lane strip on an agent key. A row shows **glyph + code**; it never shows code alone.

Because `BUS`/`BRD`, `PRD`/`PPL` and `CUS`/`LEG` are collision risks, **any grouped display of codes must carry a spelled-out department header above it**, so the code is learnable rather than guessed. The code set is locked once and never regenerated per workspace.

---

## 9. COMPONENT VOCABULARY

### 9.0 Token bridge (`app/globals.css`)

Everything below references these names. Define the raw values on `:root` and `:root.dark`, then bridge into Tailwind v4 with `@theme inline`. **Specificity — not source order — is what makes the dark override win** (`:root.dark` is (0,2,0); `:root` is (0,1,0)), so the blocks may appear in either order; put `@theme inline` last for readability.

```css
:root {
  /* …all values from §2, §3.6, §4, §5.8, §6.1, §7.1, §7.2… */
}
:root.dark {
  /* …dark overrides… */
}
[data-theme-switching] * {
  transition: none !important;
}

@theme inline {
  /* surfaces */
  --color-canvas: var(--surface-canvas);
  --color-rail: var(--surface-rail);
  --color-raised: var(--surface-raised);
  --color-inset: var(--surface-inset);
  --color-object: var(--surface-object);
  --color-overlay: var(--surface-overlay);
  --color-inverse: var(--surface-inverse);
  --color-track: var(--track);
  /* lines */
  --color-hairline: var(--line-hairline);
  --color-border: var(--line-border);
  --color-strong: var(--line-strong);
  /* text */
  --color-ink: var(--text-primary);
  --color-ink-2: var(--text-secondary);
  --color-ink-3: var(--text-tertiary);
  --color-ink-4: var(--text-quaternary);
  --color-ink-inverse: var(--text-inverse);
  /* signals — the ONLY hue names that exist */
  --color-positive: var(--positive-mark);
  --color-positive-text: var(--positive-text);
  --color-positive-wash: var(--positive-wash);
  /* …caution, critical, agent, info, neutral identically… */
  /* series */
  --color-series-1: var(--series-1); /* …2,3,4 */
  /* radius */
  --radius-0: 0px;
  --radius-2: 2px;
  --radius-4: 4px;
  --radius-6: 6px;
  --radius-8: 8px;
  --radius-10: 10px;
  --radius-12: 12px;
  --radius-14: 14px;
  --radius-16: 16px;
  --radius-20: 20px;
  /* shadow */
  --shadow-elev-1: var(--elev-1);
  --shadow-elev-2: var(--elev-2);
  --shadow-elev-3: var(--elev-3);
  /* type */
  --font-sans: var(--font-interface-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
  /* spacing 1..12 mirror §6.1 */
}
```

Usage reads `bg-canvas`, `bg-raised`, `border-hairline`, `text-ink-3`, `shadow-elev-1`, `rounded-12`, `text-positive-text`. **`--accent` is the brand hue (§4.1), and `--success`/`--warning` do not exist: status is `positive`, `caution`, `critical`, `info`, `agent` and `neutral`, each with its own four tokens.**

Typography roles ship as utility classes (`.t-body-strong`, `.t-label-caps`, `.t-metric-xl`, `.t-mono-hash`, …) generated from the §3.4 table, each setting `font-size`, `font-weight`, `line-height`, `letter-spacing` and — for numeric and mono roles — `font-variant-numeric`. **Ad-hoc `text-[13px]` is a review failure.** Every size in the product resolves to a role; `scripts/lint-css-tokens.mjs` refuses a new one.

---

### 9.1 Button

**Anatomy.** An 8px rounded rectangle (`--r-8`), optional leading icon at 8px gap, label, optional 12px trailing chevron for split/menu buttons.

| Size             | Height | Padding | Label role       | Icon |
| ---------------- | ------ | ------- | ---------------- | ---- |
| `xs`             | 28px   | 0 8px   | `micro`          | 14px |
| `sm`             | 32px   | 0 12px  | `caption-medium` | 16px |
| `md` _(default)_ | 36px   | 0 16px  | `body-medium`    | 16px |
| `lg`             | 44px   | 0 24px  | `body-medium`    | 18px |

**Variants.**

- **primary** — fill `--action-fill`, label `--action-label`, no border. Hover `--action-fill-hover`; active `--action-fill-active`.
- **secondary** — `--surface-raised`, `1px solid var(--line-strong)`, label `--text-primary`. Hover: fill `--state-hover`. Active `--state-active`.
- **ghost** — transparent, label `--text-secondary`. Hover `--state-hover` + label `--text-primary`.
- **destructive-ghost** — label `--critical-text`. Hover `--critical-wash`.
- **destructive-solid** — fill `--critical-mark`, label `#FFFFFF` (light) / `#14161A` (dark). **Permitted on exactly one element in the product: the confirm button inside a destructive confirmation dialog.** Measured 5.53:1 / 5.38:1.

**States.**

- _focus-visible_ — the two-stop monochrome ring (§5.8). On a primary fill the first stop is `--action-fill` and the second is `--action-label`, so the ring reads on the button itself.
- _disabled_ — `opacity: 0.4`, `cursor: not-allowed`, all hover suppressed. When a tooltip must explain _why_, use `aria-disabled="true"` and keep the element focusable rather than the `disabled` attribute.
- _loading_ — `min-width` locked to the measured pre-click width; the leading icon slot becomes a 14px 2px-stroke 270° arc, 700ms linear; the label persists; `aria-busy="true"`; `pointer-events: none`.
- _pressed / toggled_ — `--state-selected` fill, label `--text-primary`, `aria-pressed`.

**Never:** a coloured primary; a gradient; `transition: all` (transition only `background-color, border-color, color, box-shadow`); an icon-only button without an `aria-label`; `active:scale-*` on a full-width submit.

---

### 9.2 Icon button

28px `--r-6` (dense: table row actions, card headers, top bar) or 32px `--r-8` (toolbars) or 40px `--r-full` (top-bar identity). Icon 16px, 1.5px stroke, `--text-tertiary`.

**States** — hover: `--state-hover` fill **and** icon → `--text-primary` (the current app's ghost variant changes only the text colour, giving the three topbar controls no hit-area feedback at all); active `--state-active`; focus-visible two-stop ring; toggled-on `--state-selected` + icon `--text-primary` + filled icon variant; disabled 40% opacity.

Always carries an `aria-label` and, in dense rows, a 400ms-delay tooltip. **In a table row the action cluster is `opacity: 0` until row hover or `focus-within`, then 90ms to 1 — but the cluster always reserves its width, so the row never reflows.** On coarse pointers the cluster is permanently visible.

---

### 9.3 Segmented control

**Anatomy.** A pill **track**: `--segment-track` fill, 4px inner padding, `display: inline-flex`, no gaps between segments. The active segment is a **thumb**: `--segment-thumb`, `--r-full`, `--elev-thumb`, absolutely positioned behind the labels. This is the reference's `24h · 7d · 14d · 30d` picker: a near-black pill in dark holding a lighter grey thumb, a light grey pill in light holding a white one.

| Size | Track | Thumb | Label            | Segment min-w / padding |
| ---- | ----- | ----- | ---------------- | ----------------------- |
| `sm` | 32px  | 24px  | `micro`          | 40px / 0 12px           |
| `md` | 36px  | 28px  | `caption-medium` | 48px / 0 16px           |

**States** — inactive label `--text-secondary`, hover → `--text-primary` with **no fill**; active label `--text-primary`; the thumb animates `transform: translateX()` + `width` `--dur-2 --ease-move` while labels stay still; focus-visible rings the **track**, arrows move selection, Home/End jump; a disabled segment is `--text-quaternary` and the thumb does not travel to it; a disabled control drops the track to `opacity: 0.5`.

**Maximum 5 segments** — beyond that use a Select. Uses: chart range (`7D · 30D · 90D · 1Y`), diff mode (`Unified · Split`), density (`Comfortable · Compact`), document mode (`Read · Edit · History`), timeline scope (`All · Humans · Agents`).

**Zero-data:** the control stays enabled and interactive. A range with no data renders an empty chart (§11), never a disabled control.

---

### 9.4 Filter chip

**Anatomy.** `--r-full`, height 30px, padding 0 12px (0 10px with a 14px leading element, gap 6px), `--surface-raised`, `1px solid var(--line-border)`, label `caption-strong` `--text-secondary`. **The count is part of the label, in parentheses, tabular, one tier lighter:** `Open (2)` where `(2)` is `--text-tertiary`. Optional trailing 12px × when removable.

**States** — hover: fill `--state-hover`, border `--line-strong`, label `--text-primary`. **Selected: fill `--text-primary`, label and count `--text-inverse` (count at 70% opacity), border transparent** — monochrome, a deliberate departure from the reference's tinted active chip, because _selection is chrome, not status_. Selected hover: `--action-fill-hover`. Focus-visible: two-stop ring. Disabled (zero matches available): `opacity: 0.4`, not clickable. A chip whose count is `0` but which is still selectable stays enabled with its label at `--text-tertiary`.

**Status-filter variant** gains a leading 6px status dot in the role's `-mark` — the only colour a chip may carry. On a selected chip the dot switches to `--surface-raised` at 100% so it stays visible on the inverted fill.

**Chip bar.** Horizontal, 8px gaps, `overflow-x: auto` with 24px `mask-image` edge fades and no visible scrollbar. An `All (N)` scope chip is always first, **followed by a 1px × 18px `--line-hairline` vertical rule with 12px on each side** (this separator is in the Remote jobs reference and it is what turns a chip row into a control rather than a pile). Selection is single or multi per instance and is announced with `role="group"` + `aria-pressed` per chip.

**Empty:** the bar renders only a disabled `All (0)` chip. It is never omitted, because its absence and a zero result look identical.

---

### 9.5 Icon tile

The leading element of list rows, quick-action cards, right-rail rows, banners and empty states.

| Size | Radius   | Icon |
| ---- | -------- | ---- |
| 28px | `--r-8`  | 14px |
| 32px | `--r-10` | 16px |
| 40px | `--r-12` | 20px |
| 48px | `--r-14` | 24px |

**Default (neutral):** ground `--surface-inset`, icon `--text-secondary`, **no border, no shadow**. This is a deliberate deviation from the references, which tint every tile: under P1 a tile is tinted only when it _encodes state_.

**Status variant:** ground `--{role}-wash`, icon `--{role}-text`. Legal uses: a failed run, an expiring key, a merged branch, an agent identity, a conflicted document.

**Agent identity tile:** 24px `--r-6` (or 28px `--r-8`), `--agent-wash` ground, 13px agent glyph in `--agent-text` — **square where a human avatar is round** (§5.3).

**Department tile:** the department glyph on `--surface-inset`; in dense cells the glyph is followed by the three-letter code in `mono-micro` (§8.3).

**Hover** (only when the tile sits inside an interactive row/card): the ground steps one level toward the ink — light `#E8EAEE`, dark `#282C33` — at `--dur-1`. A tile is never independently focusable or clickable.

---

### 9.6 Status dot and status pill

**Dot.** A filled circle in `--{role}-mark`: **8px** in table cells and list rows, **6px** as a notification/unread indicator, **10px** in a page header. `flex-shrink: 0`, and it sits in a fixed 14px leading slot in a table so labels align across rows whether or not a dot is present. **Always followed by a text label at 6px gap — a dot alone is never sufficient** (colour-blindness and zoom).

_Ring variant_ (1.5px stroke, transparent centre) = the state is pending, scheduled or inactive. _Live variant_ (a running run, an actively-used key) adds a 1px ring at 2px offset in `color-mix(in oklab, var(--{role}-mark) 40%, transparent)` and pulses `opacity 1 → 0.5` over 1600ms `--ease-move` infinite alternate; under reduced motion it becomes a static ring. _Absent_ renders an em dash in `--text-tertiary`, **never a grey dot**.

**Pill.** Height 22px, `--r-full`, padding `0 8px 0 6px`, gap 6px, no border. Contents: a 6px dot in `--{role}-mark` + text in `label-caps`. Ground `--{role}-wash`, text `--{role}-text`. Neutral uses `--neutral-wash` + `--text-secondary`. **Never interactive** — if it needs a menu, put a 20px chevron icon-button beside it, not inside it. Max width 140px then truncate.

**The complete state map — no other pill strings exist:**

| Object           | States                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Document         | `DRAFT` caution · `IN REVIEW` info · `ACTIVE` positive · `ARCHIVED` neutral                                            |
| Branch           | `OPEN` info · `MERGED` positive · `CONFLICT` critical · `ABANDONED` neutral                                            |
| Diff entry       | `ADDED` info · `CLEAN` positive · `CONFLICT` critical · `IDENTICAL` neutral _(visually retired)_                       |
| Agent key        | `ACTIVE` positive · `EXPIRING` caution · `EXPIRED` neutral · `REVOKED` critical                                        |
| Run              | `RUNNING` agent + live dot · `SUCCEEDED` positive · `FAILED` critical · `QUEUED` neutral                               |
| Webhook delivery | `OK` positive · `FAILED` critical                                                                                      |
| Member           | `OWNER` · `ADMIN` · `MEMBER` — all `neutral` wash; **tier is carried by grouping and the capability grid, not by hue** |

---

### 9.7 Stat strip — the signature component

**One container.** `--surface-raised`, `--r-12`, `--elev-1`, `overflow: hidden`, `display: grid` with equal columns, min-height 104px. **Cells are NOT separate cards and there are NO gaps:** every cell after the first takes `border-left: 1px solid var(--line-hairline)`, **inset 16px top and bottom** so the rule does not touch the container edge.

**Cell anatomy**, padding 16px 20px:

1. **Label row** — 14px icon `--text-tertiary` + `label-caps` `--text-tertiary`, 6px gap. (`COMMITS · 30D`, `DOCUMENTS AT HEAD`, `ACTIVE KEYS`, `TOKENS / ACCEPTED RECEIPT`.)
2. **Value** — `metric-xl` `--text-primary`, 12px above. A 72×28 sparkline is absolutely positioned bottom-right, 20px from the right edge, baseline-aligned to the value.
3. **Delta row** — 8px above: an 8px ▲/▼ glyph + `metric-sm` in `--positive-text` / `--critical-text` + `micro` `--text-tertiary` suffix (`vs prev 30d`).

**The delta component takes a `polarity` prop.** For `tokens_per_accepted_receipt` and every cost metric, a **downward** arrow is `positive` green. Hardcoding ▲ = good renders the product's headline economics discipline backwards.

**Abbreviation:** at ≥5 significant digits the value abbreviates (`12.4k`, `1.2M`) with the exact figure in a hover tooltip. Tabular figures are noticeably wider than proportional ones, and a 4-up strip at 1200px overflows without this.

**States.**

- _hover_ — only when the cell links to a filtered view: the full cell bleed takes `--state-hover` (90ms) and a 14px arrow glyph fades in top-right. The strip **never lifts**.
- _focus-visible_ — the ring inset 2px so it does not clip against `overflow: hidden`.
- _loading_ — value → a 112×30 skeleton, delta → 80×13, sparkline → 72×28. The label renders live.
- _empty (zero data)_ — the value renders `—` in `--text-tertiary` at `metric-xl`; the sparkline is replaced by a 1px dashed `--line-hairline` across the full 72px at the vertical centre; the delta row reads `no prior period` in `micro` `--text-tertiary`. **The strip never collapses or hides when empty — a blank gauge is information.**
- _error_ — value `—` plus a 12px `critical` glyph beside the label with an explanatory tooltip.

**Responsive:** 4-up ≥1200px · 2×2 ≥720px (the horizontal seam becomes `border-top: 1px solid var(--line-hairline)`) · 1-up below, all inside the one container. **The gaps never come back.**

---

### 9.8 Data table

**Container** — `--surface-raised`, `--r-14`, `--elev-1`, `overflow: hidden`.

**Header row** — 40px, `--surface-inset`, `position: sticky; top: var(--header-h)`, `border-bottom: 1px solid var(--line-strong)`; gains `--elev-sticky` and flattens its top corners once scrolled. **Every header cell carries a 14px type icon** `--text-tertiary` + `label-caps` `--text-secondary` + a sort affordance: two stacked 6px chevrons, both at 35% opacity when unsorted; when sorted, the active chevron goes 100% `--text-primary` and the inactive one hides. Hover fills `--state-hover` and promotes the label to `--text-primary`. Sortable headers are `<button>`s with `aria-sort`. Column resize handles are 8px hit areas showing a 1px `--line-strong` line on drag. **Sorting is instant — no row animation.**

**Body row** — 56px two-line / 44px single-line (Compact: 40 / 36), `border-bottom: 1px solid var(--line-hairline)`, none on the last.

- **Two-line cell** — line 1 `body-strong` `--text-primary`, truncating with an ellipsis plus a 400ms tooltip carrying the full string; line 2 `caption` `--text-tertiary` with `·` separators (`Marketing · v14 · 6 fields`). 4px between lines (§6.2).
- **Numeric cell** — right-aligned, tabular, `metric-sm`. A delta column appends ▲/▼ + `metric-sm` in the polarity colour.
- **Identifier cell** — `mono-hash` `--text-secondary`, 7-char hash with a 20px copy icon-button revealed on cell hover; or `mono-seq` in the fixed 56px right-aligned column.
- **Status cell** — 8px dot + `body` label. The dot is the only colour in the row.
- **Threshold-typed numeric cell** — the band colour is applied to **the value text only, never to the row background and never to the cell fill.** A 40-row table of tinted rows is a heat map, not a ledger.
- The leading column may carry a 28px icon tile.

**Row states** — hover `--state-hover` (90ms) + the trailing action cluster fades in; selected `--state-selected` + a 2px full-height `--text-primary` inset left bar; focus-visible an inset two-stop ring on the row; expanded (revision rows) rotates a chevron 90° and opens a nested panel via `grid-template-rows: 0fr→1fr` on `--surface-inset` with a 4px `--text-primary` left bar; archived/disabled drops every text tier by one and shows a lock glyph in the leading slot; **a row with uncommitted changes shows a 2px `--caution-mark` inset left bar.**

**Zebra striping is permitted only on tables wider than 8 columns** (odd rows `--surface-inset`). Everything else uses hairlines.

**Horizontal overflow** scrolls inside the card with the first column `position: sticky; left: 0` and a 12px right-edge gradient shadow that appears only once scrolled.

**Footer** — 48px, `border-top: 1px solid var(--line-border)`, `--surface-raised`, padding 0 16px, space-between. Left: `micro` `--text-tertiary` tabular record count (`4 records` / `1–25 of 1,284`). Right, 12px gaps: a 28px `--r-full` rows-per-page pill select (`Rows 25` + 12px chevron), then 28px circular prev/next icon buttons, then page numbers as 28px circular ghost buttons where the current page is `--action-fill` / `--action-label`. Prev/next disable at the ends. **The footer is hidden when the table shows its empty state.**

**Table states** — _loading_: the header renders live with real column widths, the body shows 8 skeleton rows at exact geometry (two bars per two-line cell at 60% and 38% width, widths chosen deterministically from the row index so the pattern does not flicker between renders). _empty_: a full-span 240px cell holding the EmptyState block, **header row retained** so column meaning survives. _filtered-to-zero_: same cell, but the copy names the active filters and the primary action is `Clear filters`. _error_: full-span cell, `--critical-text` message + `Retry`.

---

### 9.9 Underline tabs

A 44px row sitting on a full-width `border-bottom: 1px solid var(--line-border)`. Triggers: `display: flex`, 24px gaps, padding 0 2px, label `body-strong` — inactive weight 500 `--text-tertiary`, active weight 650 `--text-primary`. A count suffix renders at 6px gap in `micro` tabular `--text-quaternary` (`Revisions 128`); **`0` renders as `0`, never hidden**.

The active indicator is **one** absolutely-positioned 2px bar in `--text-primary` sitting on the hairline, `--r-2` on its top corners, animating `transform: translateX()` + `width` `--dur-2 --ease-move`. Never per-tab borders, never coloured.

**States** — hover promotes the inactive label to `--text-secondary` and shows a 2px `--line-strong` bar at 50% opacity; focus-visible draws an inset ring around the label box (the indicator does not move); disabled `--text-quaternary` with a tooltip explaining why. Overflow scrolls horizontally with 24px mask fades and never wraps to two lines; the active tab scrolls into view on mount. Panels crossfade over `--dur-3`, no translation.

Tabs express depth **within a record** (Read / Revisions / Media / Feedback on a document; Overview / Scopes / Deliveries on a key). They are never top-level navigation, and never used where a segmented control would do.

---

### 9.10 Navigation rail (sidebar)

`--surface-rail`, 288px (collapsed 48px), full height, `border-right: 1px solid var(--line-border)`, `--elev-0`, **never a shadow**, its own scroll container. Padding 20px at the sides.

- **Brand block** — 32px, wordmark `body-medium`, plus a 28px collapse icon-button at the right edge. **Not scrollable.**
- **Identity block — pinned, not scrolled.** The CompanySwitcher and BranchPicker sit _above_ the scroll container. In a versioned multi-tenant product the two pieces of state you must never lose are which company and which branch you are writing to, so they live in `SidebarHeader`, outside the scroll container, and stay put however long the department list gets.
- **Company switcher** — a 40px borderless row, `--r-10`: a 24px inverted monogram, the name in `body-medium`, an up-down chevron. Hover `--state-hover`. The reference's project switcher.
- **Search field** — 40px, `--r-10`, `--surface-raised` on the rail, `1px solid var(--line-border)`, 18px magnifier `--text-tertiary`, placeholder `body` `--text-tertiary`, trailing `⌘K` kbd. On the dark rail this is the one lit object in the frame.
- **Section label** — `group-label` `--text-tertiary`, 32px tall, non-interactive, with `aria-labelledby` binding it to its group.
- **Nav row** — 40px, `--r-10`, padding 0 12px, gap 12px, 18px icon `--text-tertiary` + `body` `--text-secondary`, optional right-aligned count in `mono-micro` `--text-tertiary`, optional 12px disclosure chevron.
- **Child rail** — a 1px `--line-hairline` vertical line; children indented, row height 32px, label `caption`.
- **Pinned utility block** — `margin-top: auto`, `border-top: 1px solid var(--line-border)`, 12px padding: Settings · MCP endpoint · Help, then a 44px account row (24px avatar, name `caption` over role `micro` `--text-tertiary`, 14px chevron opening an `--elev-2` menu).

**States** — hover `--state-hover`, icon and label step up one tier. **Active: `--surface-selected` fill, label `body-medium` `--text-primary`, icon `--text-primary`.** A filled row, no accent bar (anti-slop rule 11) and no tint: on the dark rail `#303030` against `#131313` is the reference's active `Chat` row exactly. Focus-visible: the blue two-stop ring. Disabled: 40% opacity.

**Collapsed (48px):** icons only, centred in 40px squares, labels move to 400ms-delay tooltips on the right; section labels close up.

**Accessibility:** each `<nav>` carries an `aria-label`; disclosure buttons carry `aria-expanded` and `aria-controls`. There is exactly one `<nav>` in the accessibility tree at a time (the mobile Sheet's nav replaces the desktop one, it does not duplicate it).

**Loading:** 6 skeleton rows in a `<Suspense>` fallback. A bare `<Suspense>` with no fallback — the current implementation — is a review failure.

---

### 9.11 Top bar

56px, `--surface-canvas`, `border-bottom: 1px solid var(--line-hairline)`, sticky, `z-index: 10`. It is part of the page, not the chassis: the reference has no bar at all above its content, so this one keeps to the page ground and the lightest line.

- **Left** — the breadcrumb: `micro` `--text-tertiary` segments, `/` separators in `--text-quaternary` with 6px margins, final segment `--text-secondary` at 500 and not a link. On a document surface the trail is `Company / Department / Document`, and a revision-scoped view appends a `mono-seq` segment (`#0142`) that links to the revision. Above 4 levels the middle collapses to a 20px `…` icon-button opening an `--elev-2` menu. **The left half of this bar is the breadcrumb on every route, with a parent chevron on phones (`components/shell/topbar.tsx`).**
- **Centre** — empty at rest; carries `title-compact` once the large title has collapsed (§7.3), and the bar takes `--elev-sticky`.
- **Right** — a cluster of 28px `--r-6` ghost icon-buttons at 4px gaps (search, notifications), a 4px gap, a 1px × 20px `--line-hairline` vertical rule, 4px, then the 28px identity avatar opening the account menu.
- **Branch state** — when the session is on a non-main branch, a 28px BranchChip sits between the breadcrumb and the centre slot, **and the top bar takes a 2px `--caution-mark` bottom border in place of its hairline.** The branch is the most consequential mode in the product and it must be legible peripherally, without being looked at.

The theme control is **not** a top-level icon here. It moves into the account menu as a three-way `Light · Dark · System` segmented control — the current two-state toggle silently destroys the `system` default it cannot restore.

---

### 9.12 Page header

Sits on `--surface-canvas`, padding `32px 0 24px`. **Owned by the shell as `<PageHeader>`; no route hand-rolls it.** Every app route renders it through the one component, so arriving anywhere reads the same.

- **Row 1** — `display` (ATLAS, LEDGER STREAM, REGISTRY, BLANK SLATE only) or `title-1` everywhere else; optional inline status pill at 12px gap; optional `mono-hash` slug at 12px gap in `--text-tertiary`. Right cluster, top-aligned: at most one primary button, at most two secondary, then a 28px overflow icon-button. Padding 32px above, 24px below.
- **Row 2** _(optional)_ — `caption` `--text-tertiary`, max 90ch.
- **Zero-data variant** — the description is replaced by a `micro` `--text-tertiary` fact (`No revisions yet`), the primary button remains and becomes the page's only affordance.

**Every archetype must vary at least one of: title role, action cluster, or the strip immediately beneath.** A page header that is identical to its neighbour's is the defect this component exists to prevent.

---

### 9.13 Card / panel

`--surface-raised`, `--r-12` (dense/table contexts `--r-14`; page-level and quick-action `--r-16`), `--elev-1`, padding 20px (16px compact, 24px hero).

- **Header** _(optional)_ — 52px, padding 0 16px: `title-3` left, action slot right (segmented control, ghost link, or a 28px overflow button). `border-bottom: 1px solid var(--line-hairline)` **only when the body is a table, a list or a chart**; a prose body gets no rule, only 16px of space.
- **Body** — 16px padding; 0 for tables and lists, which bleed to the card edge.
- **Footer** _(optional)_ — 48px, `border-top: 1px solid var(--line-hairline)`, `--surface-inset` for action footers.
- **Sections inside a card** are separated by 1px `--line-hairline` rules. **Never by a nested card** (§5.7).

**Interactive card** (department card, template card, quick action, media tile): the whole card is one `<a>`/`<button>`; hover `--elev-1 → --elev-1-hover` + border `--line-strong` at `--dur-2`, **no translate**; active `--state-active` overlay; focus-visible two-stop ring; `h-full` on the wrapper so a wrapping title never leaves a row ragged.

`CardTitle` renders a configurable heading level (`as` prop), defaulting to `h3` **only when nested under an `h2`**. Hardcoding `<h3>` breaks the document outline of every page by construction, which the current primitive does.

---

### 9.14 `--surface-object` row and inset grouped list

Two closely-related primitives; both are flat and neither is ever shadowed.

**Object row** _(the Remote right-rail box)_ — `--surface-object`, `--r-12`, `1px solid var(--line-hairline)`, 12px 14px padding, 8px gaps in a stack. Contents: a 40px icon tile (status-tinted only when the row carries a status) + a text block of `caption` `--text-tertiary` caption over `metric-lg` tabular `--text-primary` value + an optional parenthetical in `caption` `--text-tertiary` + an optional 12px trailing chevron when the row navigates.

**Inset grouped list** _(the Apple idiom)_ — inside an `--elev-1` card, rows separated by `--line-hairline` rules that are **INSET TO THE TEXT ORIGIN** (`left inset = padding + tile width + gap`), **never full-bleed**. This single detail is what makes a grouped list read as one object rather than a stack of rows. Row 56px with a tile, 44px for a label/value pair; leading 32px tile, `body-strong` primary over `caption` secondary, right-aligned value in `body` `--text-secondary` (or `metric-sm` tabular when numeric), trailing 16px chevron when navigable. The group's `label-caps` header sits **on the canvas above the card**, 12px below.

**States** — hover (navigable rows only) `--state-hover`; pressed `--state-active`; focus-visible inset ring; disabled 45% opacity; an empty group renders a single 56px row of `caption` `--text-tertiary` with no chevron.

---

### 9.15 Right-rail summary card

320px (360px ≥1600px), `position: sticky; top: calc(var(--header-h) + 16px)`, `--r-16`, `--elev-1`, padding 20px.

- **Header** — `title-3` left; optional `caption-strong` ghost action right (monochrome, underline on hover).
- **Body — two variants, and the choice is a rule, not taste:**
  - **Inset** (§9.14 object rows, 8px gaps) when the rail is a **set of destinations or measured quantities** — run economics, branch divergence, key lifecycle.
  - **Ruled** (44px rows separated by `--line-hairline`, `label-caps` left, value `metric-sm`/`mono-hash` right) when the rail is a **list of facts** — document head metadata: seq, hash, author, kind, template version, updated, fork point.
- **Trailing blocks**, in order: a meter with its label pair; a 120×36 sparkline row; a full-width 36px secondary button.

**States** — _loading_: each value becomes a 64×13 skeleton. _empty_: every value renders `—` in `--text-tertiary`, the meter renders its zero stub, and **the footer button promotes from secondary to primary because it is now the only action on the surface.** _error_: a `critical` Banner strip inside the card.

**Responsive:** below 1280px the rail unsticks and moves **above** the main column as a full-width card whose rows become a 2- or 3-column grid divided by vertical `--line-hairline` rules — it becomes a mini stat strip. It is never the only place a value appears.

---

### 9.16 Quick-action card

The primary "next action" affordance. A square-ish `--elev-1` card, `--r-16`, min 168 × 132px, padding 20px, arranged in a 2- or 3-column grid at 16px gaps. Contents: a 40px icon tile top-left → flex spacer → `body-strong` `--text-primary` label bottom-left → optional `caption` `--text-tertiary` second line. **The whole card is one button.**

**States** — hover `--elev-1 → --elev-1-hover` **plus** the tile ground steps one level toward the ink, `--dur-2`; active `--state-active`; focus-visible two-stop ring; disabled 45% opacity with a `caption` reason replacing the second line; loading renders a 90×14 skeleton label and is inert.

Product uses: _New document · New branch · Issue agent key · Import context · Run the founding interview · Export company._

---

### 9.17 Task / list row card

A standalone `--elev-1` card per row (`--r-16`, padding 16px 20px, min-height 76px, 12px between rows) **or** a row inside a card. Left to right: 40px icon tile · a text block of `body-strong` over `caption` `--text-tertiary` clamped to 2 lines · flex spacer · a right cluster of a `caption` timestamp and/or a 28px button and/or a status pill.

**States** — hover `--elev-1-hover` when navigable; the right cluster sits at `opacity: 0.6` at rest and 1 on hover/`focus-within`, **with its width always reserved**; focus-visible ring; _completed_ turns the tile `positive`-tinted with a check, the title `--text-tertiary` with a 1px `--line-strong` strikethrough, and the card drops to `--elev-0`; _dismissing_ exits with opacity + `translateY(-4px)` over 120ms and the stack reflows over `--dur-3`; _loading_ 3 skeleton rows; _empty_ the whole stack is replaced by the EmptyState.

---

### 9.18 Sparkline

Hand-authored inline SVG. Default 72×28 (stat cell), 56×20 (table cell), 120×36 (right rail).

**Mechanics — mandatory.** `vector-effect: non-scaling-stroke` on the path; width from a `ResizeObserver`, never `preserveAspectRatio="none"` (which distorts stroke weight asymmetrically); `overflow: visible`; the path inset 2px vertically so peaks are not clipped.

- **Line variant** — monotone-cubic path, `stroke-width: 1.5`, `stroke-linecap: round`, colour `--series-1` (**graphite — a sparkline is single-series by definition and therefore always monochrome**), no axes, no gridlines, no dots, except a 2.5px filled terminal dot with a 1.5px `--surface-raised` halo.
- **Area variant** — adds a `<linearGradient>` from `--series-1` at 14% (20% dark) to 0%.
- **Bar variant** — the ForgeUI mark: 7–14 columns, 3px wide, 2px gap, `--r-2`, **all at `opacity: 0.30` except the final column at `opacity: 1`**, so the eye lands on "now" instantly. This is the most identifiable mark in the reference set and it is the default inside a stat-strip cell.
- **Threshold variant** — the terminal dot (line) or final column (bar) recolours to the band ink of the **latest** value only; the historical path never changes colour mid-line.

**States** — _hover_ (only when the parent row is interactive): the line thickens to 2px at `--dur-1`. _loading_: a skeleton block at exact geometry. _empty (<2 points)_: **a 1px dashed `--line-hairline` across the full width at the vertical centre — never a flat line at the baseline, which would falsely read as measured zero.** _single point_: the terminal dot alone, horizontally centred.

A sparkline is a **glyph, not a chart**: it has no tooltip, no axis and no legend, and it is permitted only in stat-strip cells, right-rail rows and the branch comparison matrix — **never inside a standard data-table cell**, where the trend belongs in a delta numeral.

---

### 9.19 Chart primitives — governance

> **Exactly three chart primitives exist: `<Sparkline>`, `<AreaLineChart>`, `<BarChart>`, all built over ONE shared `scales/axis/ticks` utility module. One-off inline SVG is forbidden anywhere else in the codebase. A fourth chart type is added to the primitives, never to a page.**

Without this rule, hand-authored SVG across sixteen archetypes drifts into sixteen inconsistent charts, which is worse than taking a dependency.

**The shared module owns:** nice-number tick generation; monotone-cubic interpolation (**Catmull-Rom converted to cubic Béziers** — approximately twelve lines, which is what makes the no-chart-library constraint a verified fact rather than an aspiration); the `ResizeObserver` sizing path; the crosshair snap; axis-label thinning; **null-gap handling**; and the empty/loading/error frames.

**Null gaps are the normal case, not an edge case.** A commits-per-day series for a young company is mostly holes. **The path breaks at nulls rather than interpolating across them, and the gap renders a 1px dashed `--line-hairline` connector.** A path that interpolates across a gap overstates activity, which in this product is a lie about the ledger.

**Axis-label thinning is deterministic:** drop every other label, then every third, until no two labels are within 64px. First and last are always shown and are edge-anchored rather than centred.

---

### 9.20 Area / line chart

Inside an `--elev-1` card. Header 52px: `title-3` left, a segmented range control right. Plot min-height 260px (compact 180, hero 320). Insets: left 44px (axis gutter), bottom 28px, right 8px, top 12px.

- **Grid** — horizontal only, 4–5 lines, `1px dashed var(--line-hairline)` with `stroke-dasharray: 2 4`, drawn behind the series. **No vertical gridlines. No axis lines.**
- **Axis labels** — `micro` tabular `--text-tertiary`; y right-aligned in the gutter with an 8px gap; x thinned per §9.19.
- **Series** — `stroke-width: 2`, `stroke-linejoin: round`, monotone-cubic; area fill a vertical gradient from 14% (20% dark) to 0% at 88% of plot height. **Max 4 series, assigned `--series-1` → `--series-4` in legend order.** One series is therefore fully monochrome.
- **Legend** — below the plot, 20px gaps: a 12×3 `--r-2` swatch + `caption` `--text-secondary`. Clicking toggles: the swatch drops to `--line-strong`, the label to `--text-quaternary`, and the path fades to `opacity: 0` over `--dur-2`.
- **Crosshair** — on pointer move a 1px dashed `--line-strong` vertical rule snaps to the nearest x-datum; each series shows a 3.5px filled dot with a 1.5px `--surface-raised` ring; an `--elev-2` hover card (`--surface-overlay`, `--r-12`, padding 8px 10px) shows a `label-caps` x header, a `--line-hairline` rule, then one row per series: swatch + `caption` name + right-aligned `metric-sm` tabular value. **The card flips side at the plot's midpoint.**

**States** — _loading_: the frame, gridlines and axis labels render **immediately**; the plot area holds a skeleton block. _empty_: **gridlines and axes still render** (an empty gauge is a gauge), with a centred `caption` `--text-tertiary` line (`No commits in this range`) and a ghost `Widen to 1Y` button. _error_: the same frame, a `--critical-text` message and `Retry`.

---

### 9.21 Bar / column chart

Same card chrome. Columns `--r-2` on the **top two corners only**, computed width `(W − (n−1)·gap)/n`, gap 2px at ≤40 bars and 1px above, **minimum rendered height 2px so a non-zero value is never invisible**, baseline a 1px `--line-hairline` rule.

**The default fill is `--line-strong`, not a series colour**, because a commit-frequency chart is not a series — it is one quantity over time. **The most recent column fills `--text-primary` to anchor "now."** A series colour is used only when the bars are one member of a genuine multi-series comparison.

**Hover:** the hovered column goes to `--text-primary` (or 100% of its series colour) and all others drop to `opacity: 0.4` at `--dur-1`; the `--elev-2` hover card appears above it. Value labels print above columns only when column width ≥24px, in `micro` tabular `--text-tertiary`. Zero-value columns render a 2px `--line-hairline` stub at the baseline so the slot is still legible.

_Empty_: baseline rule only + a centred `caption` `No commits in this range`.

---

### 9.22 Meter

Linear, never a donut or a radial. Track `--track`, `--r-full`; fill `--r-full`. Heights: `sm` 4px · `md` 6px · `lg` 8px.

**Fill colour is a rule, not a choice:**

- **Monochrome `--text-primary`** when the meter shows neutral progress — document completeness, registry coverage, upload progress. _Progress is a quantity, not a status._
- **A band `-mark`** only when the meter encodes a **threshold** — key lifetime remaining, quota consumed, freshness against cadence. Bands carry 1px `--surface-raised` notches at each boundary so they read at a glance.

**Label row** above, 8px gap: `label-caps` `--text-tertiary` left, `metric-md` tabular value right (in the band ink when threshold-typed). Optional `caption` below at 6px.

**Segmented variant** (agent-key lane coverage, registry three-state coverage): N equal segments at 4px gaps, each `--text-primary` when filled and `--track` when not; each segment is labelled by department code in a tooltip and by an `aria-label` on the group.

**States** — _mount_: `width 0 → value`, `--dur-3 --ease-out`, once. _value change_: width only; the number never animates. _indeterminate_: a 30%-wide `--text-primary` fill sweeping `-30% → 130%` over 1100ms. _zero_: **an empty track with a 2px `--line-hairline` stub at the left end and `0` in `--text-tertiary` — visibly present-and-zero, never a 1px sliver and never absent.** _no denominator_: the track renders at `--line-hairline` with a centred `—` and no fill. _over-100%_: the fill clamps and a 2px `--critical-mark` cap appears at the right end. _complete_: the label value takes `--positive-text` when completion is the goal.

---

### 9.23 Revision rail and commit node — the signature structure

**The rail is a real grid track, not a decoration.** The page sets `grid-template-columns: var(--rail-gutter) 1fr`, nodes are drawn per row, and **the spine is a per-row 1px pseudo-element, never one tall absolutely-positioned line.** A single full-height line cannot survive windowed rendering of a 10,000-commit timeline; the current codebase draws exactly that (`absolute left-[11px] top-7 h-full w-px bg-border`, byte-identical in `timeline/page.tsx` and `runs/page.tsx`) and it is the construction being replaced.

- **Spine** — 1px `--line-hairline` at x = 13.5px within the 28px gutter. It terminates flush with the head node's top and ends in a 3px rounded cap 8px below the last node.
- **Node vertical centre** aligns to 14px from the row top — the optical centre of the row's first text line — not the row's geometric centre.
- **Branch lanes** at x = 14 + 20n, **capped at 4 lanes**, then collapsed to an 18px `+n` pill. Fork/merge curves are 1px `--line-strong` quarter-arcs of radius 8 over a 16px vertical run, `stroke-linecap: round`.

**Commit node variants:**

| Variant        | Form                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal (human) | 9px **circle**, fill `--surface-canvas`, 1.5px ring `--text-tertiary`                                                                                                             |
| Normal (agent) | 9px **rounded square** `--r-2`, same fill and ring — shape carries authorship                                                                                                     |
| **Head**       | 10px, fill `--positive-mark`, a 3px gap ring in the parent surface colour, **plus** a 1px `--positive-mark` outer ring at 16px — a reticle. Head is the only node with two rings. |
| Branch         | ring `--agent-mark`                                                                                                                                                               |
| Merge          | 11px with a 1px horizontal bar through it at node width +4px                                                                                                                      |
| Conflicted     | ring `--critical-mark` + a 1px vertical bar through the centre                                                                                                                    |
| Selected       | fill `--text-primary`, no ring, a 4px `--surface-inset` halo                                                                                                                      |

**Commit row.** 60px, `border-radius: 0 var(--r-8) var(--r-8) 0` (the rail exception), padding `12px 16px 12px 12px`, flush against the rail with no gap. Line 1: the commit **message** in `body-strong` truncated to one line, with the sequence number `#0142` in `mono-seq` right-aligned in the fixed 56px column. Line 2 (4px gap): a 16px author element (round avatar / square agent tile) + author name in `caption` `--text-secondary` + `·` + relative time in `caption` `--text-tertiary` + the HashChip + a DepartmentChip. A commit touching >1 document appends a `4 docs` count chip.

**Rows are separated by a `--line-hairline` inset 12px from the left**, so it starts after the rail and the spine reads as continuous.

**States** — hover `--state-hover` across the full bleed, node ring rises to `--text-secondary`, and a 14px `→` glyph appears at the right; selected `--state-selected` + a 2px `--text-primary` bar drawn over the spine; focus-visible a two-stop ring at the rail radius; a commit on an unreachable branch drops every text tier and its node ring to `--text-quaternary`.

**Empty:** **the spine is not drawn at all — a rail with no commits is a lie about history.** Render the EmptyState instead.

**Critically, this component renders `event.doc`, `event.rev` and `event.branch`.** Those three objects come back from `api.timeline.list` and the feed renders all of them: the document, its revision hash and the branch it landed on.

---

### 9.24 Hash chip, sequence ref, department chip, branch chip

**HashChip** — inline-flex, 20px tall, `--r-4`, padding 0 6px, `--surface-inset`, `1px solid var(--line-hairline)`, `mono-hash` `--text-secondary`. **Exactly 7 characters.** A 14px copy slot is _reserved_ at 6px gap and its glyph fades in on hover at `--dur-1`, so nothing shifts. On click the label swaps to `copied` in the same mono at the same width for 1200ms — **no colour change, because a successful copy is not a status.** Long variant (revision detail): 28px, `--r-6`, `mono-hash-lg`, the full 40 characters, with a trailing kbd for the copy shortcut. Absent renders `—` in `--text-tertiary`, **never an empty chip**.

**SequenceRef** — `mono-seq` `--text-tertiary`, `#` + four-digit zero-padded number, in a fixed 56px right-aligned column. On a detail surface it promotes to a `label-caps` kicker (`REVISION`) above `metric-lg` `--text-primary`. Never truncates (§3.5).

**DepartmentChip** — 22px, `--r-full`, `--surface-inset`, `1px solid var(--line-hairline)`: the 14px department glyph + the label. In dense cells the label is the three-letter code in `mono-micro`; elsewhere it is the full `ViewMeta.label`. **Never the raw lowercase ViewId** — the current pull cards print `from brand` because the one label lookup the page needs it does not do.

**BranchChip** — 24px, `--r-full`, `--surface-inset`, `1px solid var(--line-hairline)`, a 12px branch glyph + the branch **name** in `caption-strong` truncated at 160px, plus an ahead/behind suffix `↑3 ↓1` in `mono-seq` `--text-tertiary`. The glyph takes `--agent-mark` on branch-scoped surfaces; **`main` always renders its glyph in `--text-secondary` and is never violet.** A conflicted branch prepends an 8px `--critical-mark` dot. States: hover `--state-hover` + border `--line-border`; active (the branch being viewed) `--surface-inverse` with `--text-inverse` text; focus-visible ring; a merged or abandoned branch reached by URL renders its status pill inline so a frozen branch can never masquerade as an open one.

---

### 9.25 Authorship stamp / avatar

**Human avatar** — `--r-full`, sizes 16 / 20 / 24 / 28 / 40. Image, or initials in `micro` (600) `--text-secondary` on `--surface-inset` with a 1px `rgba(20,22,26,0.06)` inset ring so light images keep an edge. **Neutral grey — never a generated hue.**

**Agent glyph** — the same sizes but `--r-6` / `--r-8` (a squircle), `--agent-wash` ground, a 14px agent icon or a two-character mono code in `--agent-text`. An agent stamp **additionally renders the issuing key's short id as a HashChip**, so every machine write is traceable to a key.

**Stamp** — avatar + name in `caption` `--text-secondary` + `·` + a `<RelativeTime>`. **Stacked variant**: up to 3 avatars overlapping by 8px with a 2px `--surface-raised` ring each, then a `+N` count chip in `micro`.

The topbar's account chip renders the signed-in person's avatar and name, read after hydration so the first client frame matches the HTML (`lib/hydrated.ts`).

---

### 9.26 `<RelativeTime>`

Renders `<time dateTime={iso}>` containing `timeAgo(ts)`, with the absolute `formatDate(ts)` in both `title` and an on-focus tooltip. **The absolute value is never hover-only**, because the exact timestamp is what correlates a run with a commit and hover is unavailable on touch.

**Future timestamps** (agent-key expiry) use a **separate** `<Countdown>` component with an urgency ramp — `> 30d` `--text-tertiary` · `7–30d` `--text-secondary` · `< 7d` `--caution-text` + a caution dot · `< 24h` `--critical-text` — and always print the absolute date beside the relative one. `timeAgo()` is written for the past and is never given a future timestamp; `/agents` uses the countdown for expiry.

---

### 9.27 Input, textarea, select, and the field primitive

**Input** — 36px (touch 44), `--r-10`, `--surface-raised`, `1px solid var(--line-border)`, padding 0 12px, `body` `--text-primary`, placeholder `--text-quaternary`. Hover: border `--line-strong`. Focus: border `--text-primary` + the two-stop ring. Error: border `--critical-border`, a 14px `--critical-mark` glyph inside the right edge, and the helper text swaps to `--critical-text`, wired with `aria-invalid` and `aria-describedby` — **the input's own text never turns red.** Async-validated success: a 14px `--positive-mark` check inside the right edge, border unchanged — **no green border.** Disabled: `--surface-inset` ground, `--text-quaternary` value. Read-only: no border, `--surface-inset` ground, `cursor: text`. Loading: a 14px spinner in the right edge.

**Textarea** — the same, `min-height: 96px`, `resize: vertical`, `line-height: 22px`.

**Select** (`components/ui/select.tsx`) — the same box + a 14px chevron `--text-tertiary`, opening the product's menu (`--surface-overlay`, `--elev-2`, `--r-12`, 36px rows) with a 14px check on the chosen row. Two sizes (`md` 36px for fields, `sm` 32px inline) and two variants (`box`, and `quiet` for a select that sits inside a table cell and reads as the cell). Built on the DropdownMenu primitive, so arrows, Home/End, type-ahead and Escape behave like every other menu. **There is no raw `<select>` in the product**; the last thirteen were replaced in September 2026.

**Field** — the wrapper, and the only sanctioned way to render a labelled control: `label-caps` `--text-tertiary` label (bound with `htmlFor`/`id` via a real `<label>`), 6px, the control, 6px, `caption` `--text-tertiary` helper or `--critical-text` error. A `label-caps` `REQUIRED` badge on `--caution-wash` or `OPTIONAL` on `--neutral-wash` sits inline right of the label. **A character counter is mandatory wherever the server enforces a cap** — commit message 500, title 200, interview answer 4000, import source 200 000, webhook description 200 — rendered in `micro` `--text-tertiary`, turning `--caution-text` at 90% and `--critical-text` at 100%.

**Checkbox** 18px `--r-4`, 1.5px `--line-strong` border; checked = `--action-fill` with a 12px `--action-label` check drawn over 160ms. **Radio** identical but `--r-full` with an 8px inner dot. **Switch** 44×26 track `--r-full`, off `--track` + `1px --line-strong`, on `--action-fill`; 20px knob travelling 18px at `--dur-2 --ease-move`. **None of these is ever coloured.** All carry a 44px hit area on coarse pointers and a clickable adjacent `body` label.

---

### 9.28 Field editor family (the document body)

Three genuinely distinct editors sharing one field chrome. They are not one component with a `compact` boolean; the current implementation distinguishes a quadrant of a strategy canvas from a section of a 14-field record by `text-[12px]` vs `text-[13px]`, which is not a design.

- **Field chrome** — the `label-caps` name; **the registry `hint` rendered persistently as `caption` `--text-tertiary` beneath the label in BOTH read and edit mode** (never a placeholder that vanishes on the first keystroke: the guidance is there exactly when the field is empty and confusing); and a 24px right-gutter **status slot** outside the text measure showing: nothing when clean · a 6px `--caution-mark` dot when locally modified · a 6px `--critical-mark` dot when required-and-empty · a 14px lock when read-only on this branch · a 10px spinner while saving.
- **Prose field** — read mode is a `body-read` block capped at 68ch; edit mode is a borderless textarea showing a 1px `--line-hairline` bottom rule on hover and the full input treatment on focus. At rest the editor reads as a document, not a form.
- **List field** — **a real item-per-row editor**: 32px rows, a 6px `--line-strong` bullet, a 16px drag handle fading in at the row's left on hover, a delete icon-button at the right, keyboard reorder (space to grab, ↑↓ to move), and an `+ Add item` ghost row at the end. Read mode is the same row rhythm without controls. **Not a textarea split on `\n`**: the registry's most common field type (257 fields) gets `ListField`, where an item is a row and reordering is a drag or an arrow key.
- **Table field / DataGrid** — a real grid: **column typing inferred from `column.label`** (status / owner / hex / date / currency / numeric / URL / RICE) driving alignment, tabular-nums and right-alignment for numerics, and derived column widths; a sticky header in `label-caps` on `--surface-inset`; row numbers; keyboard cell traversal (arrow / tab / enter); paste-from-TSV; row handles with reorder; per-row delete **with undo**; and a horizontal-scroll shadow. 120 table fields up to 8 columns depend on this. Colour swatches render in **both** read and edit mode.
- **Canvas frame + cell** — for the 15 layout kinds: a CSS grid from the template's `layout.areas` / `layout.columns` with **shared hairline walls and equal-height rows**, not floating boxes. Cells are `--surface-inset`, `--r-10`, a `label-caps` area name pinned top-left, an `--text-tertiary` item count top-right, `min-height: 120px`, and **in-cell overflow scrolling so one long block cannot collapse the canonical silhouette.** Empty cells are `1px dashed var(--line-hairline)` with a one-line prompt. Read-only cells take a 3px diagonal `--line-hairline` hatch at 8%.
- **Empty field states are typed, not one sentence.** An empty table renders **its column headers**; an empty list renders one ghost row plus its expected cardinality; an empty prose field renders its hint. One italic sentence standing in for all three is the failure this rule names.

---

### 9.29 Commit bar

The component that makes the versioning model unavoidable. Sticky to the bottom of the **content column** (aligned to its gutters, not the viewport edge), 64px, `--surface-rail`, `border-top: 1px solid var(--line-border)`, `--elev-sticky-up`, `--r-12` on its top corners, padding 0 24px, `z-index: 20`.

- **Left** — the DiffSummary (`+18 −4`) + `micro` `3 fields changed in 1 document`, with a 6px `--caution-mark` dot when dirty and no dot when clean.
- **Centre** (`flex: 1`, max 560px) — the commit-message input, 36px, `--r-6`, `--surface-inset`, placeholder `Describe this revision`.
- **Right** — a ghost `Discard` (destructive-ghost on hover) and a primary `Commit`, 8px gap.

**The message field is pre-filled with a generated-from-diff default that the user edits.** An empty required field produces `update` and `.` within a week, and the timeline's entire legibility argument collapses when every row's line 1 is one character.

**States** — _clean_: the bar drops to `opacity: 0.6`, the input disables, Commit disables, the counter reads `No changes`. _dirty + empty message_: Commit is `aria-disabled` with a 400ms tooltip `A commit message is required`; **the input does not turn red until submit is attempted.** _submitting_: Commit enters its loading state, the input and Discard disable, **the bar keeps its exact height.** _success_: the bar returns to clean and a toast carries the new `mono-hash` with a `View revision` action, while the rail's new head node fires its single pulse. _conflict_: the bar grows to 88px to hold a `--critical-wash` strip naming the conflicting document count and a `Review conflicts` secondary button.

Both whole-document overwrites — `Discard` and `Draft with AI` — route through `<ConfirmDialog>`, as does every other destructive action in the product.

---

### 9.30 Diff viewer

Container `--elev-1`, `--r-14`, `overflow: hidden`.

- **Header** — 52px, `--surface-inset`, bottom `--line-strong`: two revision selectors (`mono-hash` chips with chevrons) either side of a 14px arrow glyph on the left; a `Unified · Split` segmented control and a `Whitespace` toggle on the right.
- **Gutter** — 56px (28px per side in split), `--surface-inset`, `mono-micro` `--text-quaternary` line numbers right-aligned with 8px padding, `user-select: none`, `border-right: 1px solid var(--line-hairline)`.
- **Marker column** — 14px, holding `+`, `−` or a space in `mono-code` at the diff ink.
- **Content** — `mono-code` `--text-primary`, `white-space: pre`, `tab-size: 2`, horizontally scrollable with the gutter sticky.
- **Row backgrounds** — `--diff-add-bg` / `--diff-del-bg` / `--diff-move-bg` with a 3px left gutter bar in the matching `-gutter` token; context is transparent, never tinted. Intra-line changes wrap in a `<mark>` at the `-strong` tint, `--r-2`, padding 0 1px.
- **Hunk header** — 28px, `--track`, `mono-code` `--text-tertiary`, `@@ −12,7 +12,9 @@`, with a 24px ghost expander at the right.
- **Collapsed context** — 28px row, `--surface-inset`, `--r-6`, centred `caption` `⌄ 24 unchanged lines`, expanding over `--dur-3`; ⌥-click expands all.
- **Split mode** — two panes at a 1px `--line-border` divider with synchronised scroll; empty-side rows fill `--surface-inset` with a 3px diagonal `--line-hairline` hatch.

**Field-level variant** (typed documents, not code): each changed field renders as an `--surface-object` row showing the field's `label-caps` name and a before/after pair. **A table field diffs as a cell matrix** — changed cells take the role wash, unchanged stay `--surface-raised`, with `label-caps` row and column headers. **A list field diffs as reordered rows with a `moved ↓3` `micro` badge.** A canvas field diffs as two side-by-side mini-grids with changed areas washed.

- **Footer** — 48px: `+n additions · −m deletions across k fields` in `micro`, and on a branch diff a primary `Merge` plus a ghost `Abandon branch`.
- **Conflicted hunks** take a 2px `--caution-border` left border and a `Keep base · Keep incoming · Edit` segmented control pinned to the hunk's top-right. **The resolution control shows what each side discards**, never two bare OS radios: the highest-stakes irreversible choice in the app is drawn, per document, on the comparison matrix.

_Empty_: `These revisions are identical` centred at 160px with the two long HashChips above. _Loading_: the header renders, the body shows 12 skeleton lines with the gutter drawn.

**DiffSummary** (reused in the commit bar, branch rows, revision rows, merge dialog): `+128` in `mono-seq` `--positive-text`, `−41` in `--critical-text`, then a 5-block bar of 8×8px `--r-2` cells at 2px gaps filled proportionally — additions `--positive-mark`, deletions `--critical-mark`, remainder `--track`; **any non-zero change fills at least one block.** An unchanged diff renders `±0` in `--text-tertiary`.

---

### 9.31 Dropdown menu / popover

`--surface-overlay`, `--r-8` (popover `--r-12`), `--elev-2`, padding 4px (popover 16px), min-width 200px, max-width 320px, max-height 60vh with internal scroll.

**Item** 34px, `--r-6`, padding 0 10px, gap 10px: a 16px icon `--text-tertiary` + `body` `--text-secondary`, optional trailing kbd or 14px chevron. A **reserved** 20px leading slot holds the check on checkable items so labels align whether or not one is checked.

**States** — hover / active-descendant `--state-hover` + label `--text-primary`; destructive item label and icon `--critical-text` with hover `--critical-wash`; disabled `--text-quaternary` with a right-aligned `micro` reason; submenu on a 120ms hover intent. Section label `label-caps` at `8px 10px 4px`; separator a 1px `--line-hairline` with 4px margins. Keyboard: ↑↓ roving tabindex, Home/End, type-ahead, Escape closes and returns focus to the trigger. _Empty_: a 32px non-interactive `caption` `--text-quaternary` row.

---

### 9.32 Dialog, sheet, and confirm

**Dialog** — `--surface-overlay`, `--elev-3`, over `--surface-scrim` with `blur(2px)`. Widths 400 (confirm) / 560 (form, default) / 720 (review). `--r-16` at ≤480px, `--r-20` above.

- **Header** — padding 24px, `title-3` (destructive: `title-1`) + a `caption` `--text-tertiary` subline; a 28px close × top-right; a bottom `--line-hairline` appears only when the body scrolls.
- **Body** — 24px padding, `max-height: 60vh`, scrolls.
- **Footer** — 64px, `border-top: 1px solid var(--line-hairline)`, `--surface-inset`, buttons right-aligned at 8px: ghost Cancel then primary Confirm.

**ConfirmDialog (destructive)** — the header gains a 36px `--r-12` `--critical-wash` tile with a `--critical-text` glyph; the body states the **irreversible consequence in domain terms** (`Revoking this key immediately breaks 3 agent lanes`); a type-to-confirm `mono` input appears when the target is a branch, a key or a member, enabling the confirm only on an exact match; the confirm is the product's **one** destructive-solid button. Focus is trapped, Escape cancels, and **initial focus lands on Cancel, never on the destructive confirm.**

Every destructive action routes through this component: revoke key · abandon branch · remove member · delete webhook · delete table row · discard document · AI whole-document overwrite.

**Sheet: there is none.** Anti-slop rule 21 bans side drawers, so nothing in the product slides in from an edge to hold detail; detail opens on a page of its own or in a centred dialog. Mobile navigation is the rail itself, presented full-height from the left edge (`components/ui/sidebar.tsx`), titled for assistive tech and closed by the trigger that opened it. It is the one full-height panel in the product, and it holds navigation only.

---

### 9.33 Toast

Bottom-right (bottom-centre ≤768px), 16px from the edges, 8px gaps, **max 3 visible** with a `+N more` collapsed row. 320–420px, `--surface-overlay`, `--r-12`, `--elev-2`, padding 14px 16px.

Anatomy: a 16px role glyph (or a 16px spinner for in-flight work) · a text block of `body-strong` title over `caption` `--text-tertiary` detail clamped to 2 lines · an optional `caption-strong` inline action · a 24px ghost dismiss ×. A 2px `--r-full` `--text-quaternary` progress hairline along the bottom edge counts down the dismissal; **`critical` toasts have no hairline and never auto-dismiss.** Hover or `focus-within` pauses every timer. `role="status"` for neutral/positive, `role="alert"` for critical.

**A commit-success toast always carries the new revision's HashChip and a `View revision` action.**

**A row-commit toast carries Undo.** Every write an app makes to a table is a row version, and `useCommitToast` (`components/apps/shell/commit-toast.tsx`) is the one way an app announces one: title is the commit message, detail names the revision, and the action is `Undo`, which restores the previous revision forward as a new one, exactly as the record's History tab does. The action is absent, not disabled, when there is nothing before this revision or the person lacks `context:revert`. The action button is the product's small secondary button (border `--line-strong`, card ground, fill on hover), never sonner's inverted pill. Duration 8000ms with the action.

---

### 9.34 Command palette

640px, `--r-20`, `--elev-3`, `--surface-overlay`, anchored 15vh from the top over the scrim.

- **Input row** 52px, borderless, 20px leading magnifier, 16px/400 text, a trailing `esc` kbd, `border-bottom: 1px solid var(--line-hairline)`.
- **Results** grouped under `label-caps` headers — `DOCUMENTS · TEMPLATES · DEPARTMENTS · BRANCHES · KEYS · ACTIONS` — each 44px, `--r-6`, padding 0 12px, gap 12px: a DepartmentChip in a persistent left gutter + `body` title + a right-aligned `mono-hash` path (`marketing/positioning-brief`) and, for committed documents, a `mono-seq`. **Matched ranges are highlighted with a `--state-selected` background — never bold, never coloured.**
- **Footer** 40px, `--surface-inset`, `micro` legend `↑↓ navigate · ↵ open · ⌘↵ new tab · esc close`.

**A full keyboard contract is mandatory and shipped:** a selected index, ArrowUp/ArrowDown, Home/End, Enter, `role="listbox"`/`role="option"` and `aria-activedescendant`. The active row takes `--state-selected` + a 2px `--text-primary` left bar. Hover also sets selection.

**States** — _idle (no query)_: a `RECENT` group of the last 5 documents plus 4 quick actions; never an empty box. _searching_: a 2px indeterminate hairline under the input. _no results_: a 120px block echoing the query in `mono-hash` plus a `Create a document named "…"` action. _truncated_: a `micro` footer note when the server capped the result set, so a complete answer is distinguishable from a clipped one.

**The palette passes the current `?b=` branch to `api.search.docs`** on branch-aware routes, so ⌘K on a branch searches that branch.

---

### 9.35 Banner / callout

Full width inside its container, `--r-12`, padding 14px 16px, `--{role}-wash` ground, `1px solid var(--{role}-border)`, and a **3px `--{role}-mark` bar on the left edge**, `--r-2`, inset 1px. Contents: a 20px `--{role}-text` glyph · a text block of `body-strong` `--text-primary` title over `caption` `--text-secondary` · a right-aligned ghost action and/or a 24px dismiss ×.

Product uses: `unconverted spend` (critical) · key expiring in 3 days (caution) · merge conflict present (critical) · viewing a historical revision (caution, **non-dismissible, sticky under the top bar**) · editing on a branch overlay (agent, non-dismissible) · AI/media not configured (neutral, with a real action, never a Card with no content). Dismissals persist per user per object id; a non-dismissible banner has no ×.

---

### 9.36 Skeleton

`--track` fill, radius **matched to the element being replaced** (text `--r-4`, tiles and cards their own radius, avatars `--r-full`). Geometry is **identical to the final content** — same row heights, same column widths, same card radius, same rail spine and node positions — so the swap causes zero layout shift. Text-bar widths come from a fixed set (96%, 72%, 58%, 40%, 30%) chosen **deterministically from the row index**, so the pattern does not flicker between renders.

Animation: `opacity 1 → 0.62` over 1200ms `--ease-move` infinite alternate — **a pulse, never a travelling shimmer**. **After 8 seconds the pulse stops and the skeleton holds static.** Content replaces skeletons with a 90ms opacity crossfade. **Never render a skeleton for a transition under 200ms** — below that, render nothing and let the content land.

The current `<Skeleton className="h-96" />` — a single 384px grey slab standing in for a canvas, a 14-field record, a table and a timeline alike — is deleted. `SkeletonTable`, `SkeletonRail`, `SkeletonCanvas`, `SkeletonRecord`, `SkeletonStatStrip` and `SkeletonNav` each mirror their landed geometry.

---

### 9.37 Empty state

A centred column, `max-width: 400px`, padding 48px 24px (32px inside a card, 96px full-page), `text-align: center`.

**Anatomy:** a 48px `--r-14` `--surface-inset` icon tile with a 24px `--text-tertiary` glyph · 16px · `title-4` (page-level: `title-1`) headline naming the **object and its verb** · 8px · `caption` `--text-secondary` body, max 2 lines, stating what will appear here and why · 20px · one 36px primary button and at most one ghost secondary. Full-page states add a left-aligned 3-item numbered `caption` `--text-tertiary` list of what happens next.

**On version-control surfaces only** — timeline, document history, branch list, diff — the icon tile is replaced by **git's empty-tree hash**, `4b825dc642cb6eb9a060e54bf8d69288fbee4904`, set in `mono-hash` `--text-quaternary`, wrapped to two lines, with a 1px `--line-hairline` struck horizontally through its centre. It is a literal statement that nothing has been committed yet, it costs no asset, and it teaches the data model. _(It is the empty **tree**, not the empty blob `e69de29b…` — the two are commonly confused and only the tree is correct here.)_ Everywhere else — a finance department at zero data, an empty media panel — uses the neutral tile, because a git in-joke is not the mark a CFO should meet first.

**No illustrations. No mascots. No exclamation marks. No marketing copy.**

The five variants are specified in §11.3.

---

### 9.38 Small parts

**Count badge** — 18px min-width, `--r-full`, `--surface-inset`, `micro` tabular `--text-secondary`, padding 0 5px, caps at `99+`. **Zero renders as `0`, never hidden.** On an inverted parent it flips to `--state-active` over the inverted fill.

**Kbd** — 20px min-width, `--r-4`, `--surface-inset`, `1px solid var(--line-hairline)` with a 2px `--line-border` bottom edge (a subtle keycap), padding 0 5px, `mono-micro` `--text-tertiary`. Chords are separate elements at 3px gaps with **no `+` character**.

**Tag** — 20px, `--r-4`, `--surface-inset`, `mono-hash` `--text-secondary`, padding 0 6px. Square-ish, because a kind slug is an identifier, not a state.

**Tooltip** — `--surface-inverse` ground, `--text-inverse` text, `--r-8`, padding 6px 10px, `caption`, max-width 260px, no arrow, `--elev-2`. 400ms hover intent (0ms if a sibling is already open), 0ms on focus-visible, dismisses on blur/leave/Escape. **Never contains interactive content** — that is a popover. Replaces every native `title=` attribute in the codebase.

**Separator** — a 1px `--line-hairline` rule; horizontal full-bleed inside its container, or vertical at 18–20px tall with 12px margins. Uses the installed-but-unimported `@radix-ui/react-separator`.

**Breadcrumb, ScrollArea, Tabs, Popover, Label** — all five Radix packages are already installed with **zero imports**; they are wrapped here rather than re-implemented.

---

## 10. PAGE ARCHETYPES

### 10.1 The partition rule

> **Every archetype occupies a silhouette used exactly once.** Each is implemented as a real layout component (`<AtlasLayout>`, `<WorkbenchLayout>`, `<LedgerStreamLayout>`, …) that owns its grid and its container mode. **Ad-hoc page-level grid CSS is a review failure.** An archetype that cannot be named is a page that should not ship.

Each archetype below therefore declares not only what it _is_ but **what it denies itself**, naming the sibling it must never be mistaken for. Sixteen routes, sixteen archetypes. This is the direct antidote to the first audit's core finding, two pages sharing one byte-identical spine and ten pages opening with the same two lines of markup.

Three archetypes are permitted to alter the chassis itself — **only these three**: COMPARISON MATRIX and INGESTION CONSOLE collapse the sidebar to 64px to buy horizontal room; COMPOSER and GENESIS SHEET suppress the shell entirely.

### 10.2 The sixteen

**A1 · SPECIMEN SHEET** — _container `bleed`._ The registry shown as evidence rather than described in prose. A full-bleed scrollable catalog: a department index where each of the 11 views shows glyph + label + its `description` sentence + its group names + its true kind count (18/15/23/19/10/18/8/7/6/6/6); **at least one real canvas kind drawn at true fidelity from its own `layout.areas`**; one real table field rendered with its actual `TableColumn` headers; and a commit strip showing message, author, `#0142` and hash exactly as `revisions` stores them. **Denies itself:** a centred hero, a three-up value-prop card grid, and a KPI strip. It is the only page with no tenant, therefore the only place the registry appears _unfiltered_ — every in-app page shows one company's coverage _of_ it.

**A2 · GATE** — _container `prose`, shell suppressed._ A 380px credential panel, vertically centred, that **names the destination it will restore** (`continue to acme / agents`, read from `?next`). Two fields with real `<label>`s, one primary, one footer link. **Denies itself:** any disclosure. Where ENROLMENT expands, GATE contracts — it has no policy to satisfy, no consequence to explain and no downstream step to preview.

**A3 · ENROLMENT** — _container `prose`, shell suppressed._ A 480px two-block panel: the credential form **plus an identity preview** rendering the literal `authorLabel` string this account will produce, set in the exact typographic treatment the commit rail uses (`Ada Lovelace` vs `ada@example.com`), so the optional name field shows its permanent consequence without a word of explanation. The password policy renders as a **live three-item checklist** (≥10 characters · ≥1 letter · ≥1 digit), all three of which the server enforces and the form shows live. **Denies itself:** GATE's minimalism. This creates a person in the ledger; it should feel weighty.

**A4 · REPOSITORY INDEX** — _container `page`._ A dense, sortable, comparison-oriented data table: one row per company, `mono-hash` slug, role as a leading column, right-aligned tabular `documentCount` **rendered against `KINDS.length` as a coverage meter**, `commitCount`, and a recency column that reads as a scale. **Denies itself:** a card grid. Home's only job is cross-row comparison, and a 2-up grid of cards destroys exactly the column alignment that makes comparison possible.

**A5 · PROVISIONING FORM** — _container `page`._ Two columns: fields left; on the right a **live "what will be created" manifest** — the resolved `/c/<slug>` URL in mono derived by the importable `slugify()`, the owner membership row, the literal first event message `Founded {name}`, and the six kinds the founding interview will commit next, pulled by id from `lib/kinds`. **Denies itself:** the plain vertical form. This is the only irreversible namespace decision in the product — no mutation anywhere can rename a slug — and the only form whose output is an identity rather than content.

**A6 · ATLAS** — _container `page`._ A company **masthead over a coverage ledger**: an identity block where `mission` is set as real typography (not a 14px bordered aside); one dominant coverage instrument rendering the true three-state classification per template (essential-and-committed / committed / untouched) at **real per-department cardinalities** (6→23), as 11 segmented meters — never eleven equal cards with equal hairlines; the economics brief as the page's one typographically loud number, because it is the only _measurement_ here rather than a count of the registry; and a **full-width** commit log with seq, hash, actor kind, department chip and a link to the document. **Denies itself:** a stat strip _above_ the coverage instrument, and a 20rem sidebar for the commit feed. It is a repo front page, not a KPI dashboard.

**A7 · LANE CONSOLE** — _container `page`._ A per-department instrument strip locked above an **adaptive** catalog. The strip is genuinely per-department: coverage as a three-state meter, and — for the five departments that can _never_ produce signals (brand, product, people, legal, technology, because only 8 of 136 kinds carry a signal-bearing table) — a substitute built from what they do have: the fill-ratio distribution across their documents, staleness against the 45-day threshold, and canvas/table composition. The catalog's column count **tracks group cardinality** (real groups run 1→8 kinds), and tiles are content-bearing: fill meter, field-type fingerprint, head commit message, `#0142`, branch-override and archived flags — **never the registry's generic blurb**, which is identical for every company. **Denies itself:** ATLAS's aggregate coverage and a fixed 3-column grid.

**A8 · WORKBENCH** — _container `page` + `prose` body._ Two welded rails: an always-visible **commit spine** (§9.23) locked against a typed content body whose internal geometry is chosen **per template** — canvas frame for the 15 layout kinds, reading record for prose-dominant kinds, ledger grid for the 120 table fields — plus the persistent commit bar. Clicking a rail node time-travels the body into a read-only state announced by a sticky caution Banner. **Denies itself:** a single-axis layout. It is the only surface where the user _writes_, the only one whose content shape is polymorphic across 137 declared schemas, and the only one where two orthogonal axes — structure and history — must be legible simultaneously.

**A9 · GENESIS SHEET** — _full-viewport focus route, shell suppressed, URL-addressable and back-button-safe._ A 52px bar (close × left, `title-compact` centre, step counter right), a 2px top-edge progress meter, then a 640px column: the kind's identity at full weight; the **typed field guide legible as a schema** (every field's label, type and hint); the title presented as the thing that mints the document's permanent slug, **with a live slug preview and a uniqueness check against siblings**; an optional "draft from N committed documents" step that names its sources; and one irreversible primary framed as `Create at revision #0001`. **Denies itself:** WORKBENCH's history rail, hash, branch state and completeness — every one of which is definitionally absent here. It is the only purely prospective page in the product. _(It also fixes a live bug: because `docSlug` is null, the current commit omits it and the server falls back to `kind`, so "create a second product" overwrites the first.)_

**A10 · LEDGER STREAM** — _container `page`._ A three-zone commit tape: (1) a top strip of aggregates only this page can own — per-day commit histogram, per-department distribution across the 11 views, human-vs-agent split; (2) a persistent left **revision rail** with sticky `label-caps` day/week group headers on the canvas, so the vertical axis is calibrated time rather than uniform padding; (3) rows as true aligned columns, with `#0142` and the hash in a fixed-width right block so machine identity reads as a straight edge. **Rows live in one card per day-group** — the group header sits on the canvas, the rows do not. **Denies itself:** the mission grouping of MISSION INSPECTOR and any per-object aggregate. It is the only unbounded, append-only, time-primary dataset in the app.

**A11 · COMPARISON MATRIX** — _container `bleed`, sidebar collapsed to 64px._ The only surface defined by its relationship to _another_ version of the world, so it holds two simultaneous truths. A compact left index of branches (open pinned and live; merged and abandoned collapsed into a settled register carrying `mergedAt`) beside a **full-width diff page, not a modal**. Per-document rows are grouped by the 11 departments using the `entry.view` the query already returns, and each row draws a **revision ruler with three marks** — fork point (`forkedFromSeq`), branch head (`branchRevision`), main head (`mainRevision`) — so "main moved underneath" is a picture instead of the string `branch r3 · forked at main r1 · main now r4`. Conflicts promote to a resolution ledger with an explicit unresolved count. **Denies itself:** a vertical stack of equal cards, and a dialog: the most valuable screen in the product is a page of its own.

**A12 · CREDENTIAL CONSOLE** — _container `page`._ Two registers stacked, plus a form rail. (1) A fixed **connection spec sheet**: endpoint, transport, protocol version `context-ledger.v1`, the literal `Authorization: Bearer cos_…` form, and the ten MCP tools as a typed capability grid split read (6) / write (4) with their real caps — **derived from `TOOLS`, not retyped as prose.** (2) A credential table whose primary axis is the **11-department lane grid**: one row per key with lane coverage as an 11-cell segmented meter (filled = writable, full width = unrestricted), scope as a hard column rather than a chip, and issued → last-used → expires drawn as a lifecycle bar so dormancy and imminent expiry are shapes, not sentences. The right rail **holds inputs** (the issue-key form) rather than a readout — the only archetype where it does. Webhooks split off into a sibling delivery-health panel rendering the last 20 outcomes from `webhooks.deliveries`, so the UI can say a delivery failed and why. **Denies itself:** MISSION INSPECTOR's master-detail. Nothing else in the product has an object whose value literally cannot be shown twice.

**A13 · MISSION INSPECTOR** — _container `page`._ Master-detail, not a feed. Runs are the only bounded, nested, numeric dataset in the product: rows roll up by `runId` into missions — first event → last event, duration, event-type histogram, terminal state — using the `by_company_run` index the schema already ships for exactly this. A dense run table with a type-lane strip and economics columns (tokens observed, accepted receipts, tokens/receipt with the threshold ramp, `unconverted_spend` as a hard flag) sits beside a detail pane showing the selected run's ordered events with a **typed payload renderer** — known keys as metrics, unknown keys as a key/value table, raw JSON as the _fallback_ rather than the default. `actorLabel` links back to the issuing agent key. **Denies itself:** LEDGER STREAM's rail and day-grouping entirely. Timeline is one continuous human history where every row is equal; Runs is a set of discrete machine executions whose value is aggregation and cross-run comparison.

**A14 · ACCESS ROSTER** — _container `prose`._ The smallest, most static and most consequential dataset, and the only one whose interesting structure is **hierarchy rather than time**. The roster is segmented and ordered by tier (Owners → Admins → Members) with counts per tier, as **inset grouped lists** (§9.14), beside an explicit **capability grid** rendering the authority model itself — invite · remove members · remove admins · grant admin · commit · read — so the four rules the server enforces are legible **before** anyone violates one, rather than arriving as a `toast.error` after the click. A membership audit strip (`member_added` / `member_removed`) sits below. **Denies itself:** every scanning, comparison-driven affordance of A12 and A13. This page should read as **settled** — a short list that resolves at a single glance.

**A15 · INGESTION CONSOLE** — _container `bleed`, sidebar collapsed to 64px._ The only page whose output is a **set of proposed writes**, so it needs a before/after tension no other page has. Left: a real source workspace — multi-source (paste + file drop), each chunk labelled, counted live against the true 200 000-character server cap. The `note` field is promoted from an afterthought input to a first-class steering field. Right: a persistent **registry target panel** showing 11 departments × 136 kinds as a density map, dimmed at rest, resolving in place on completion into a per-department extraction manifest where **committed / skipped / silently-truncated are three visually distinct states** (the server slices at 40 documents with no signal in the return value — the UI must show it). Between them, a genuine long-running-task strip: elapsed, stage, cancel. **Denies itself:** a single 288px textarea. This is the only page in the app that blocks on a minute-long server action.

**A16 · COMPOSER** — _full viewport, shell suppressed entirely._ The only page in the app where nothing exists yet: no history, no branch, no search, no documents. It is therefore the only route that suppresses the AppShell — wrapping the emptiest possible chrome (a sidebar listing 11 departments and 136 unfilled templates, a ⌘K over a store with zero documents) around the single most important moment in the product is the current design's worst structural mistake. Left: a persistent numbered stack of **all nine questions**, editable in place with answered/unanswered state, so the founder always sees the whole interview instead of stepping ±1 through a peephole. Right: a **live manifest of the six documents being composed**, each with its true registry title from `kindTemplate()`, its complete field list, and a live indication of which fields this answer populates — **plus a visible strike-through when a blank answer is about to drop an entire document**, so the `hasContent` guard is never silent. The three newline-split answers (`targets`, `differentiation`, `channels`) get a real list editor; the other six get a prose editor, because the server draws that distinction and the form makes it visible. **Denies itself:** the wizard peephole and the 4px progress hairline that restates in pixels what the eyebrow already says in words.

**A19 · PRODUCT LAB** — _container `page`._ One selected Product record's evidence-to-decision loop: identity and current lifecycle stage above a non-linear eight-stage rail, followed by a workbench of the next decision, revision-backed Company context, active learning, segment-bounded PMF status, the 63-type artifact catalog, and ten evidence-bearing everyday-design checks. Multiple products require explicit selection; missing fields remain visibly unset; artifact and context records retain their own revision identities. A gate review writes a separate revision-pinned decision and never silently mutates lifecycle stage. **Denies itself:** ATLAS's company-wide coverage, LANE CONSOLE's template inventory, and any implication that artifact completion proves product-market fit.

### 10.3 Supporting archetypes (not among the sixteen routes)

- **SEQUENCE DETAIL** — _(`/c/[slug]/timeline/[rev]`)_ one revision rendered as a document: a `label-caps` `REVISION` kicker, the sequence number at `metric-lg`, the message at `title-1`, an authorship stamp, the long HashChip, the BranchChip, the DiffSummary, then a ruled list of changed documents, then the unified diff inline. **Explicitly no tabs — a commit is one immutable thing and cannot be paginated.**
- **FOCUS DIALOG** — a modality, not a page: a deep-linkable route rendering as a dialog **over the archetype beneath it, which stays fully visible at 100% behind the scrim**. Used for Commit, Merge branch, Issue key, Revert revision and every destructive confirm. Some actions must not lose the page you are acting on, which a full-viewport takeover always does.
- **BLANK SLATE** — a **substitution rule**, not a block inside a page. At zero commits it replaces ATLAS, LANE CONSOLE, LEDGER STREAM and COMPARISON MATRIX **wholesale**: a full-viewport centred 420px column with the empty-tree glyph, a `title-1` headline, a `caption` body, one primary and one ghost action, and beneath them three suggested first commits drawn against a 28px rail stub with **hollow nodes — the future history, rendered empty**. It is the product's proof that zero-data was designed, not patched.

### 10.4 Route → archetype map

| Route                                               | Archetype                  | Container               | Why it differs from its neighbours                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | -------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                 | **A1 SPECIMEN SHEET**      | `bleed`                 | The only page with no tenant, so the only one that can show the 136-template registry _unfiltered_ — every in-app page shows one company's coverage of it.                                                                                                                                                                                                                                          |
| `/signin`                                           | **A2 GATE**                | `prose`, no shell       | Zero disclosure obligations; its only real datum is `?next`, so it contracts to a destination-naming credential panel.                                                                                                                                                                                                                                                                              |
| `/signup`                                           | **A3 ENROLMENT**           | `prose`, no shell       | Carries two obligations GATE lacks — a three-rule password policy and a name field that becomes the permanent commit byline — so it expands where GATE contracts.                                                                                                                                                                                                                                   |
| `/home`                                             | **A4 REPOSITORY INDEX**    | `page`                  | The only account-scoped, cross-tenant page; _n_ rows of one uniform shape whose job is comparison, unlike `/c/[slug]`, which is one entity in depth.                                                                                                                                                                                                                                                |
| `/new`                                              | **A5 PROVISIONING FORM**   | `page`                  | The only form that creates a _namespace_ rather than content, and the only irreversible identifier in the product — so it pairs fields with a consequence manifest.                                                                                                                                                                                                                                 |
| `/c/[slug]`                                         | **A6 ATLAS**               | `page`                  | The only route where all 11 ViewMetas and all 136 templates are in scope at once, and the only one holding the company's prose identity and the cross-department economics snapshot.                                                                                                                                                                                                                |
| `/c/[slug]/[view]`                                  | **A7 LANE CONSOLE**        | `page`                  | Per-document within one registry slice with branch-overlay semantics — inventory-with-state, which nothing else is; ATLAS has no per-document granularity, WORKBENCH shows no inventory.                                                                                                                                                                                                            |
| `/c/[slug]/[view]/[doc]`                            | **A8 WORKBENCH**           | `page` + `prose` body   | The only surface where the user _writes_, the only one whose geometry is chosen per-template from registry data, and the only one holding two orthogonal axes at once.                                                                                                                                                                                                                              |
| `/c/[slug]/[view]/new`                              | **A9 GENESIS SHEET**       | full viewport           | Purely prospective: no head, no history, no hash, no branch state, no meaningful completeness — every load-bearing element of WORKBENCH is definitionally absent.                                                                                                                                                                                                                                   |
| `/c/[slug]/timeline`                                | **A10 LEDGER STREAM**      | `page`                  | The only unbounded, append-only, time-primary dataset; calibrated by day rather than grouped by object, which is precisely what separates it from `/runs`.                                                                                                                                                                                                                                          |
| `/c/[slug]/branches`                                | **A11 COMPARISON MATRIX**  | `bleed`, nav 64px       | The only surface that must hold two simultaneous truths and force a choice between them; every other screen renders exactly one state of the world.                                                                                                                                                                                                                                                 |
| `/c/[slug]/agents`                                  | **A12 CREDENTIAL CONSOLE** | `page`                  | The only page whose subject is a _secret_ — one-time reveal, irreversibility, scope and expiry _are_ the information design — and the only one needing a permanent 11-lane authorization axis.                                                                                                                                                                                                      |
| `/c/[slug]/runs`                                    | **A13 MISSION INSPECTOR**  | `page`                  | The only bounded, nested, numeric dataset: rows roll up by `runId` into missions and the numbers demand cross-run comparison, not chronological reading.                                                                                                                                                                                                                                            |
| `/c/[slug]/members`                                 | **A14 ACCESS ROSTER**      | `prose`                 | The only dataset whose structure is hierarchy rather than time, and the only page that should read as _settled_ — the opposite register from A12 and A13, whose row recipe it must never share.                                                                                                                                                                                                     |
| `/c/[slug]/import`                                  | **A15 INGESTION CONSOLE**  | `bleed`, nav 64px       | The only page whose output is a set of _proposed writes_, and the only one that blocks on a minute-long server action — so it alone needs a source pane, a target map and a task strip.                                                                                                                                                                                                             |
| `/c/[slug]/found`                                   | **A16 COMPOSER**           | full viewport, no shell | The only page whose job is to make the ledger _exist_; every other route presupposes history, revisions, branches and search, so it is the only one that suppresses the shell entirely.                                                                                                                                                                                                             |
| `/c/[slug]/data`                                    | **A17 RECORD REGISTER**    | `page`                  | The only cross-department inventory whose rows carry no state — a table exists or it does not — so it denies itself every status, completeness and branch affordance A7 needs, and leads instead with the one datum nothing else shows: **shape**, the column-type strip, because a table is identified by its columns long before its row count.                                                   |
| `/c/[slug]/data/[dataset]`                          | **A18 GRID**               | `bleed`                 | The only surface whose primary object is a **cell**. It denies itself the commit spine that A10 and A8 are built on: those show one object's history, while a grid holds as many histories as it has rows, so a spine would have to pick one and imply it mattered most — row history is a panel you open, not a permanent axis. It takes `bleed` because a table that wraps cannot be read across. |
| `/c/[slug]/product-lab`                             | **A19 PRODUCT LAB**        | `page`                  | The only selected-product surface that joins evidence, learning, product-design artifacts, human-centered review, and an explicit lifecycle gate without merging those records or inferring progress from template completion.                                                                                                                                                                      |
| `/c/[slug]/setup`                                   | **A20 SETUP PATH**         | `page`                  | The only page whose rows are steps rather than records: seven, five of them core, each with a verb, done or not, and it retires itself once the core is done.                                                                                                                                                                                                                                       |
| `/c/[slug]/inbox`                                   | **A21 INBOX**              | `page`                  | What is waiting on you, across every kind of thing: a draft, a stale document, finished work, a sync problem. Severity orders it, and the same list is the digest email.                                                                                                                                                                                                                            |
| `/c/[slug]/apps` and `/c/[slug]/apps/install/[app]` | **A22 STORE**              | `page`                  | Installed apps and the consent step before one is added: what the install creates, what it depends on, what it costs, and one button.                                                                                                                                                                                                                                                               |
| `/c/[slug]/apps/[app]`                              | **A23 APP FRAME**          | `page`                  | Every native app on one frame: a stat strip of its metrics, then Work, Records, Activity, Metrics and Settings tabs. The app owns only the Work tab's shape.                                                                                                                                                                                                                                        |
| `/c/[slug]/apps/[app]/[record]`                     | **A24 RECORD**             | `page`                  | One row of an app's primary table as a page, the way a document is: fields, the app's own sections, history with restore, and the actions its state allows. Nothing slides in from the side.                                                                                                                                                                                                        |
| `/c/[slug]/billing`                                 | **A25 METER**              | `page`                  | The plan, usage against its limits as meters, apps billed monthly, and the three plans side by side. Nothing here changes a plan; Stripe does.                                                                                                                                                                                                                                                      |
| `/changelog`                                        | **A27 LEDGER OF CHANGES**  | `prose`                 | What merged, by day, newest first, each entry saying what a person can now do and where. Opening it clears the rail's "What's new" reading for that browser. Testimonials on `/` and the team on `/about` read lists that ship empty and render nothing until a real person is in them.                                                                                                             |
| `/developers/submit` and `/developers/review`       | **A26 DESK**               | `page`                  | The partner program's two sides: the form and the queue. The submitter watches the state on the page they filed from; the reviewer works the oldest open submission first.                                                                                                                                                                                                                          |

---

## 11. EMPTY, LOADING AND ERROR STATES

### 11.1 The governing rule

> **The empty-state contract is declared per COMPONENT, not per page**, so a page inherits correct emptiness by construction rather than by someone remembering. Every component in §9 declares its zero-data rendering; a component whose spec does not is incomplete and does not ship.

This is a real workload — sixteen archetypes × four variants ≈ sixty states — and the ones that get skipped are always the boring ones: an empty right-rail value, an empty stat-strip cell, a two-point sparkline, a filter chip whose count is zero. Those are named explicitly below so they cannot be forgotten.

### 11.2 The frame always renders

**Chrome that describes the shape of absent data must still draw.** An empty gauge is a gauge.

| Component               | Zero-data rendering                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stat-strip cell         | `—` at `metric-xl` in `--text-tertiary`; sparkline → a dashed hairline; delta row → `no prior period`. **The strip never hides.**                                        |
| Chart                   | Gridlines, axes and axis labels **still render**; a centred `caption` line plus a ghost range-widening action fills the plot.                                            |
| Sparkline               | A 1px dashed `--line-hairline` at the vertical centre. **Never a flat line at the baseline** — that falsely reads as measured zero.                                      |
| Data table              | Header row **retained** (column meaning survives); a full-span 240px cell holds the EmptyState; the footer hides.                                                        |
| Meter                   | An empty track with a 2px `--line-hairline` left stub and `0` — never a sliver, never absent.                                                                            |
| Right-rail card         | Header retained; every value `—`; the footer button **promotes from secondary to primary**, because it is now the only action.                                           |
| Filter chip             | A count of `0` renders `(0)`; the bar renders a disabled `All (0)` chip rather than disappearing.                                                                        |
| Count badge / tab count | `0`, never hidden. Absence and zero are different facts.                                                                                                                 |
| **Revision rail**       | **The spine is not drawn at all.** A rail with no commits is a lie about history.                                                                                        |
| Command palette (idle)  | `RECENT` (5 documents) + 4 quick actions. Never an empty box.                                                                                                            |
| Sidebar                 | Departments with zero committed documents still render, with their coverage meter at zero — the registry is the product's principal asset and hiding it hides the point. |

### 11.3 The five empty variants

Every list, table, chart, rail, tab panel and page **must declare which of these it renders.** They differ in tile, copy and — critically — **in primary action.**

1. **NEVER-CREATED** — neutral 48px tile (or the empty-tree glyph on VCS surfaces). Headline names the object and its verb: `No revisions yet` · `This branch touches nothing` · `No agent keys issued`. Body states what will appear here and what creating one does. Primary action **creates**.
2. **FILTERED-OUT** — 32px tile. Headline `No documents match these filters`. Body **echoes the active filters**. Primary action is `Clear filters`, styled **secondary**, because clearing is not creation. **The filter chips stay visible above.** This is a distinct state from never-created and must never reuse its copy — the current timeline says `No commits in this department yet` when the truth is `not in the last 200 events`, which is a falsehood the design prints.
3. **PERMISSION** — neutral tile. Headline `This department lane is not in your scope`, body naming the lane. **No create action**; a ghost `Request access`.
4. **ERROR** — a `--critical-wash` tile with a `--critical-text` glyph. Headline `Couldn't load revisions`. Body carries the error id in `mono-hash`. Primary `Retry`, ghost `Copy error id`.
5. **SEARCH-ZERO** — 32px tile. The query echoed in `mono-hash` inside the body line, plus a `Create a document named "…"` action.

**BLANK SLATE (§10.3) supersedes all five** at whole-workspace zero: when a company has no commits at all, the archetype itself is replaced rather than a block being inserted into it.

### 11.4 Loading

1. **Skeletons match final geometry exactly** — same row heights, same column widths, same card radius, same rail spine and node positions — so resolution causes **zero CLS**. The current `h-24`, `h-64`, `h-96` magic-number slabs resemble nothing that lands and make every page visibly jump.
2. **Frame first, content second.** Table headers, chart axes and gridlines, page headers, stat-strip labels and the sidebar's structure all render live; only the _values_ are skeletons. The user learns the shape of the answer while waiting for it.
3. **Nothing under 200ms.** Below that threshold render nothing and let the content land.
4. **Nothing forever.** After 8 seconds the pulse stops and the skeleton holds static: a stuck request must look stuck.
5. **Two loading philosophies on one screen is a defect.** A page picks one philosophy and applies it everywhere; a shaped skeleton above a grey rectangle is the failure this rule names.
6. **In-flight actions keep their geometry.** A loading button locks its width and keeps its label; a submitting commit bar keeps its exact height; a form's inputs **disable** rather than remaining live and re-submittable.

### 11.5 Errors

- **Field-level errors render at the field**, wired with `aria-invalid` and `aria-describedby` — never only as a toast in the opposite corner of the screen. Every failure mode of `/new` (empty name, malformed slug, taken slug) is field-level.
- **Preconditions that are knowable before work begins are stated before work begins.** Role denial and "this company already has committed context" are structural facts, not outcomes; they belong in the page, not in a toast after nine answered questions.
- **Never discard the server's message.** `catch { setError("Sign-in failed…") }` with an unbound catch destroys a correct, specific, already-written server message and replaces it with a guess — including the one case where the real message names the actual rule (`Passwords need at least one letter and one digit`).
- **Unconfigured-service states are product UI, not developer output.** A missing `OPENROUTER_API_KEY` or Wasabi credential renders a neutral Banner with a real action and a one-sentence explanation — never a bare Card with a header, no content, no action, and four `<code>` env-var names in the middle of a document page.
- **Toasts are for outcomes of actions the user just took**, never for state a page could have shown. `critical` toasts never auto-dismiss.

---

## 12. ACCESSIBILITY

### 12.1 Contrast — measured, not asserted

Every value in §2–§4 has been computed. The **minimums** this language guarantees:

| Class                                               | Minimum   | Measured range                         |
| --------------------------------------------------- | --------- | -------------------------------------- |
| Body and meta text on any surface it can land on    | **4.5:1** | light 4.92 → 18.11 · dark 4.88 → 17.85 |
| `--text-quaternary` (non-informational only)        | **3.0:1** | light 3.03 → 3.39 · dark 3.27 → 3.67   |
| Signal `-text` on card, canvas **and its own wash** | **4.5:1** | light 5.57 → 8.08 · dark 5.99 → 10.37  |
| Signal `-mark` as a graphical object                | **3.0:1** | light 3.39 → 5.57 · dark 5.07 → 7.59   |
| Chart series strokes                                | **3.0:1** | light 3.70 → 10.91 · dark 5.20 → 13.01 |
| Diff ink on its own row background                  | **4.5:1** | light 7.04 → 8.50 · dark 8.17 → 8.40   |
| Button labels on their fills                        | **4.5:1** | 5.38 → 18.11                           |
| Focus ring against any ground                       | **3.0:1** | 15.49 → 17.41                          |

`--text-tertiary` is verified against the **darkest ground it can ever sit on** — `--track`, not merely the card — because a component that puts caption text on a segmented-control track or a meter label must not silently drop below AA. That check is what the earlier candidate `#667080` failed at 4.12:1.

**Non-text separation** (surfaces, diff row tints) is informational rather than WCAG-regulated; the language holds surfaces to ≥1.04 and, where separation is thinner than 1.10, **mandates a 1px border as the second cue** — `--surface-object` in both modes, and every dark elevated surface.

### 12.2 Colour is never the sole carrier

- Every **status dot** is followed by a text label at 6px.
- Every **diff line** carries a `+`/`−` glyph **and** a 3px positional gutter bar in addition to its tint.
- Every **delta** carries a ▲/▼ glyph as well as its colour.
- **Human vs agent** is carried by _shape_ (round vs square, §5.3), which survives greyscale, colour-blindness and print — not by violet alone.
- **Departments** are carried by glyph and label, never hue.
- Every **threshold value** prints its unit and, on hover, its band name.

A greyscale screenshot of any screen in this product must remain fully decodable. If it does not, the screen has a colour-only encoding and is a review failure.

### 12.3 Focus

- **`:focus-visible` only** — never `:focus` — using the two-stop monochrome ring: `box-shadow: 0 0 0 2px <ground token>, 0 0 0 4px var(--focus-ring)`. The first stop takes the token of the surface the control actually sits on, so the offset gap reads on canvas, card, inset, track and inverted fills alike.
- **Every interactive element has one.** Every variant in `buttonVariants` carries the ring, and the ring is the accent (§4.1).
- `outline-none` without a replacement is a review failure.
- **Focus is never destroyed by an action.** Closing a menu, dialog or palette returns focus to its trigger. Dialogs trap focus; a destructive dialog places initial focus on **Cancel**.
- **A skip link is the first focusable element in the document** (`components/shell/app-shell.tsx`), rendered before the rail, `sr-only` until focused and then a real secondary button pinned top-left, targeting `<main id="main" tabindex="-1">`. Pressing it moves focus into the content, not just the scroll position.

### 12.4 Keyboard

- **The command palette has a full contract** (§9.34): selection index, ↑↓, Home/End, Enter, `role="listbox"`/`option`, `aria-activedescendant`.
- Segmented controls: ←/→ move selection, Home/End jump. Tabs: ←/→ move focus, Enter/Space activate. Menus: ↑↓ roving tabindex plus type-ahead. Tables: rows are focusable, ↑↓ traverse, Enter opens.
- The DataGrid supports arrow/tab/enter cell traversal and paste-from-TSV; list fields support space-to-grab and ↑↓ to reorder.
- **Every destructive action is reachable without hover.** Hover-only controls (`hidden group-hover:block` on media delete, table row actions) are unreachable on touch and invisible to keyboard users; the pattern is `opacity-0` + `group-hover:opacity-100` + `group-focus-within:opacity-100`, with permanent visibility on coarse pointers.

### 12.5 Hit targets

**28px minimum** in dense contexts · **36px** default · **44px** for primary actions and all coarse-pointer targets. Where the visual box is smaller than required, expand with an invisible `::before { inset: -8px }` — never by growing the visual box (§6.5).

### 12.6 Semantics

- Real `<label for>` on every control, through `Field` (`@radix-ui/react-label`). A placeholder is never the accessible name; it vanishes on input.
- `<time dateTime>` on every timestamp, with the absolute value in `title` **and** a tooltip.
- Headings form a correct outline: `CardTitle` takes an `as` prop rather than hardcoding `h3`.
- Each `<nav>` carries an `aria-label`; disclosure buttons carry `aria-expanded` and `aria-controls`; the mobile navigation Sheet is titled `Navigation`, not the wordmark markup.
- Tables use real `<table>/<thead>/<th scope>` with `aria-sort` on sortable headers.
- **A sideways-scrolling container is a tab stop.** Every `overflow-x-auto` wrapper around a table carries `tabIndex={0}`, `role="group"`, `aria-label="Scrolls sideways"` and the inset focus ring, so a keyboard can reach the columns a narrow viewport hides.
- **The desktop rail is an `<aside>` landmark** named by the sidebar's label; every meter that draws no visible label names what it measures through `ariaLabel` (`Revenue: 53% of target`); rail disclosure ids are valid id tokens.
- **Links inside a sentence use `.t-link`** (underline at rest, §4). A hover-only underline on an inline link fails WCAG 1.4.1 because the ink step between `--text-secondary` and its surrounding text is under 3:1.

### 12.7 Zoom, reflow and motion

- The entire system must be walked at **200% browser zoom** and at **320px width** before ship. `label-caps` at 11px is never the sole carrier of meaning; it always sits beside a value.
- Wide content — tables, diffs, canvases, code blocks — scrolls **inside its own container**. The page body never scrolls horizontally.
- `prefers-reduced-motion: reduce` is honoured per §7.5, and **nothing becomes non-functional** under it.
- `color-scheme` is set on `:root` for both modes so native form controls, scrollbars and portalled content do not desync during a theme flip.

---

### 12.8 The check

`axe-core` (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`) runs over the overview, inbox, direction, sales board, a record, tables, the store, billing, members, the empty-company setup path, the marketing home and pricing, at 375 and 1440 in both themes, and reports nothing. A surface that adds a finding does not ship.

- Icon-only buttons carry `aria-label`; decorative SVG carries `aria-hidden="true"`.
- Live regions: toasts `role="status"` (`role="alert"` for critical); a submitting commit bar sets `aria-busy`.
- Per-route `generateMetadata`, so a tab in a multi-company workspace does not read `Company OS` on all sixteen routes.

## 13. ANTI-PATTERNS

A reviewer may reject a pull request by citing a numbered line here.

### 13.1 Surface and elevation

1. **A card darker than the page.** `bg-muted/50` on a `#ffffff` ground. This inversion is defect zero (§2.6).
2. **A card with no border and no shadow**, floating on nothing.
3. **The sidebar and a card sharing a fill.** The rail is `--surface-rail` and a card is the canvas plus its border; if they ever share a fill, a card reads as a piece of the sidebar that came loose.
4. **A card inside a card.** Subdivide with `--surface-inset` or `--surface-object` and a hairline; never a second shadowed box.
5. **An inset dropped directly on the canvas** — you skipped a card (§2.1).
6. **Nesting deeper than `canvas → raised → (inset|object)`.**
7. **A stat strip built as four separate shadowed cards with gaps.** Cells are divided by **vertical rules inside one container** (§9.7).
8. **A shadow on the sidebar**, a row, a chip, a tab, a stat cell or a `--surface-object` row.
9. **A static card that lifts on hover.** Only cards that navigate change elevation, and they change shadow and border — never `translateY`.
10. **A dark elevated surface without both its border and its inset top highlight.**

### 13.2 Colour

11. **Any hue on structural chrome or a primary action** — a blue button, a blue active nav item, a blue tab underline, a blue focus ring, a blue link.
12. **A tinted icon tile that carries no state.**
13. **Departments distinguished by colour.** Eleven hues collide with the six status roles and become decoration.
14. **A hue with no semantic token name** — a raw hex literal or a `bg-blue-500`-style utility under `app/**` or `components/**`.
15. **An accent token that equals the foreground.** `--accent: #0a0a0a` is identical to `--foreground: #0a0a0a`, so nine `text-accent` / `border-accent/40` call sites — the nav's `start` marker, branch status, write-scope keys, revision badges, the founding progress bar — render as plain body text. Same for `--success` (= foreground) and `--warning` (= muted-foreground): an "alarm" border indistinguishable from a default border is worse than none.
16. **A status carried by colour alone**, with no adjacent label.
17. **A diff row without its `+`/`−` marker and gutter bar.**
18. **`positive` green or `critical` red used as a chart series colour.**
19. **A second destructive-solid button.** There is exactly one in the product.
20. **A threshold ramp applied to a row background or cell fill** rather than to the value text.

### 13.3 Typography

21. **An ad-hoc `text-[13px]`.** Every size resolves to a role, and the token lint refuses a new one.
22. **Uppercase below 11px**, or uppercase at any size without positive tracking.
23. **Geist Mono with negative tracking.**
24. **A non-tabular numeral in a table, metric, timestamp, hash or count.** (Prose is the only carve-out.)
25. **A truncated or abbreviated sequence number.** The layout yields to it.
26. **A content hash rendered in body-text colour**, smaller than the prose beside it, or without a copy affordance.
27. **One typographic device carrying every level of a hierarchy.** One caps label carrying the section heading, the group name and the column header at once is the failure this names; the roles in §3.4 exist so each level has its own.
28. **A raw ViewId printed where a label belongs** (`from brand` instead of `from Brand`).
29. **A hardcoded count that duplicates a derivable one.** `136 living documents` typed as a string one import away from `KINDS.length`, and `ten departments` printed beside `VIEWS.length === 11`.

### 13.4 Structure and layout

30. **A page declaring its own `mx-auto max-w-*`.** The shell owns the measure (§6.3).
31. **A hand-rolled page header.** `<PageHeader>` is a component, not a pattern.
32. **Two pages sharing an archetype**, or ad-hoc page-level grid CSS (§10.1).
33. **`/runs` and `/timeline` sharing a rail construction.** They are different nouns: one is a continuous human history, the other a set of discrete machine executions.
34. **A revision rail drawn as one full-height absolutely-positioned line.** It cannot survive virtualization (§9.23).
35. **A fixed column count applied to a variable-cardinality group.** Real registry groups run 1→8 kinds; `sm:grid-cols-2 lg:grid-cols-3` gives a 1-kind group a full row with two holes.
36. **The most valuable screen in the product inside a modal.** The branch diff is a page.
37. **A `<Link><Card/></Link>` with no `h-full`, no focus ring and no press state.**
38. **A spacing value not on the 4pt scale** (§6.1).
39. **A fourth border weight** (§2.5).
40. **A layout spacer implemented as `<span className="flex-1" />`** instead of `justify-between`, so an action cluster lands at a different x on every card.

### 13.5 State, data and honesty

41. **Fetched and never rendered.** `event.doc`, `event.rev`, `event.branch`, `revisions.authorKind`, `doc.status`, `doc.onBranch`, `doc.forkedFromSeq`, `head.templateVersion`, `webhook.description`, `branch.mergedAt`, `member` join dates, `company.role`, `signal.docTitle`, `media.uploadedBy` — if a query returns it, either render it or stop asking for it. The timeline, the roster and the agents page render theirs.
42. **A query that exists and is called by nothing.** `api.webhooks.deliveries` returns the last 20 delivery outcomes with `httpStatus` and `error`; nothing calls it, so the UI can say a delivery failed and never say why.
43. **A headline number that is quietly wrong.** `committedKinds.size / KINDS.length` counts _distinct kinds_, so three ICP instances count as one; and `commitCount` sums across documents including archived ones, so `/c/[slug]` and `/c/[slug]/[view]` disagree about the same company.
44. **Two surfaces applying different archive filters to the same data.**
45. **An empty state that states a falsehood** — `No commits in this department yet` when the truth is `not in the last 200 events`.
46. **A skeleton whose geometry does not match what lands.**
47. **Two loading philosophies on one screen.**
48. **A number that animates.** No count-up, ever.
49. **A chart that re-draws on a filter change** instead of crossfading its path.
50. **A chart that interpolates across nulls.** Break the path; draw a dashed connector.
51. **A flat zero-value sparkline** where there is no data — it reads as a measured zero.
52. **A component that hides itself when empty**, so absence and zero look identical. The BranchPicker vanishing until the first branch exists also means the nav shifts vertically the first time anyone branches, and a new user is never taught branching exists.
53. **`timeAgo()` applied to a future timestamp.** Key expiry needs `<Countdown>` (§9.26).
54. **A relative time with no absolute value**, or an absolute value available only on hover.

### 13.6 Controls and interaction

55. **A raw `<select>`, `<input type="radio">` or `<input type="checkbox">`.** The agent-key form draws its own checkbox (§9.27) and every select is `components/ui/select.tsx`.
56. **A destructive action with no confirmation.** Revoke key, abandon branch, remove member, delete webhook, delete row, discard document, AI overwrite all route through `ConfirmDialog`.
57. **A hover-only control**, especially a destructive one: unreachable on touch, invisible to keyboard.
58. **A control shaped exactly like a static chip.** The webhook active/paused toggle is a raw `<button>` wrapping a `<Badge>` with no hover, focus or affordance.
59. **`outline-none` with no focus-visible replacement.**
60. **A ghost button with no hover background** — a text-colour shift on a 16px glyph is not hit-area feedback.
61. **`transition: all` on an interactive element**, which animates layout properties on hover.
62. **`active:scale-*` baked into every button**, including full-width submits and text links.
63. **A required field with an invisible cap.** `maxLength={4000}` with no counter is a wall the user hits mid-sentence.
64. **A validation rule enforced by the server and not stated by the UI** — or worse, stated _wrongly_: `minLength={10}` alone, when the server also requires a letter and a digit, means ten letters passes the browser, fails the server, and reports a false cause.
65. **A one-time secret rendered in the quietest treatment on the page.**
66. **Two back affordances to the same destination with different labels.**
67. **The primary action scrolling off-screen** on a long form.
68. **A single integer wizard with only ±1 transitions** for a nine-question interview.
69. **A "Finish later" control that discards all state.** Label controls by what they do.

### 13.7 Iconography and ornament

70. **A decorative icon** (§8.2).
71. **A raw emoji** — `⚠ unconverted spend` in a codebase that otherwise uses one icon library.
72. **All twelve event types drawing the same glyph.** A merged branch, an issued key, a removed member and a commit each draw their own glyph from `EVENT_GLYPH`.
73. **A shared map living privately inside a page.** `VIEW_ICONS`, `ICONS`, `Stat`, `Metric` are each defined two or three times because they were never promoted to `components/`.
74. **An illustration or mascot in an empty state.**
75. **A gradient that is not a chart area fill.**
76. **`backdrop-blur` over content with nothing to blur** — it costs a compositing layer and buys nothing on white-on-white.
77. **The empty-tree glyph outside a version-control surface.**

### 13.8 The five that matter most

If a reviewer checks only five things, check these:

- **The ground is below and the card is above, in both modes.** (§2.6)
- **No hue on chrome; every hue on screen can be named by its job.** (§4.6)
- **Elevation is earned by objecthood, transience or leaving the flow — nothing else.** (§5.6)
- **The page's archetype is named, and no other route uses it.** (§10.1)
- **The screen is legible, complete and beautiful with zero rows of data.** (§11)

---

_End of specification. Every hex in this document was verified for contrast before publication; §12.1 reproduces the measured ranges. Where this document and an existing implementation disagree, this document is correct. Full file at `/home/user/companyos/COMPANYOS-DESIGN-LANGUAGE.md`._
