# Design System — OU7

The UI language for the app. **Inspired by the Interesting Times "17" visual identity**, adapted from editorial/poster use into a functional product interface. Ships in **light and dark**. The machine-readable source of truth is [`../design/tokens.css`](../design/tokens.css) — never hard-code colours; always use a token.

> For AI builders: import `design/tokens.css`, set `data-theme="light"` or `data-theme="dark"` on `<html>`, and build with the token variables and the component classes below. Both themes must look correct for every screen.

---

## 1. The 17 inheritance (what we keep, what we adapt)

**Kept from 17:**

- **Warm neutrals, never pure.** Base dark is ink `#0A0A0A`; base light is paper `#F2F0EA`. `#000` and `#FFF` are forbidden.
- **Three signal accents** with fixed meaning: green `#39FF14` = go / approved / accent, yellow `#FFE600` = attention / warning, red `#FF3B1F` = destructive / declined. **Pending is shown in grey, not yellow** (see Status).
- **Sharp corners. No gradients.** Discipline is the brand. Default radius is `0`; controls may use `2px` at most. Decorative gradients are banned (the only allowed use of a generated pattern is the functional diagonal hatch that marks *pending* cells on the wall chart).
- **Typography:** **Inter** (UI), **JetBrains Mono** (numbers, dates, codes, metadata — the "receipts"), **Fraunces** (rare serif moment — page hero titles, empty states, the occasional pull quote).
- **Signal-as-signal.** Accents are used as fills, bars, rings and indicators — not as neon body text on paper.

**Adapted for a product (documented deviations from the poster system):**

- **Multiple accents coexist on one screen.** A poster frame allows one accent; a wall chart must show pending (yellow), approved (green) and a declined hint (red) at once. This is a deliberate, functional deviation.
- **An extended categorical palette** exists for leave types (blue, amber, violet, etc.) because three brand accents can't label nine leave types. These are functional data-viz colours, kept muted and distinct, and separated from the status colours.
- **Density over drama.** Editorial whitespace gives way to scannable tables, dense calendars and forms. The discipline (type, colour, sharpness) holds; the scale shrinks.

**Off-brand kill list (don't):** pure black/white, gradients, rounded "pill" cards, drop-shadow everywhere, neon green text on paper, emoji as iconography, AI-cliché imagery, decorative illustration.

---

## 2. Colour

### Neutrals (per theme — from tokens)

| Role | Token | Light | Dark |
|---|---|---|---|
| Page background | `--bg` | paper `#F2F0EA` | ink `#0A0A0A` |
| Raised surface (cards) | `--surface` | `#FBFAF5` | `#161616` |
| Sunken strip / table head | `--surface-2` | `#ECE9E1` | `#202020` |
| Hairline border | `--border` | `#DCD8CE` | `#2A2A2A` |
| Strong border | `--border-strong` | `#C7C2B5` | `#3A3A3A` |
| Primary text | `--text` | ink | paper |
| Secondary text | `--text-muted` | `#5C5A52` | `#A8A498` |
| Tertiary / placeholder | `--text-subtle` | `#8A877C` | `#76736A` |

### Interaction

- `--accent` = signal-green in both themes. Use for focus rings, the active-nav indicator bar, selected-row left border/tint (`--accent-quiet`), toggles, and the "available" arc of the allowance donut. **On light, never use green for small text** (contrast fails) — links are ink + underline (`--link`); on dark, green links are legible.
- **Primary button** is a high-contrast architecture block: ink-on-paper in light, paper-on-ink in dark (`--btn-primary-*`). **Secondary** is a bordered ghost. **Danger** (cancel/decline) is signal-red with paper text.
- **Focus** is always a visible 2px green outline (`:focus-visible`). Never remove it.

### Status (functional semantics)

Shown as **pills**, identical hues in both themes:

| State | Token pair | Look |
|---|---|---|
| Approved | `--status-approved-*` | green fill, ink text |
| Pending | `--status-pending-*` | **grey** fill (grey is reserved for pending) |
| Declined | `--status-declined-*` | red fill, paper text |
| Cancelled | `--status-cancelled-*` | **outline** pill (transparent + border), subtle text |

**Grey = pending, everywhere.** Don't use grey to signal taken, cancelled, disabled or non-working — those use charcoal (`--donut-taken`), an outline, or faint hairlines instead. (Warm neutral chrome — page/card/table surfaces — is structural, not a status, and is fine.)

Feedback text/icons (form errors, toasts) use the accessible `--success / --warning / --danger` tokens (the raw neon signals are pill-fills, not readable text colours on paper).

### Leave-type palette (categorical)

Distinct hues per leave type (`--lt-*`): Vacation = blue, Sick Working = amber, Sick Not Working = red, Bereavement = violet, **Maternity = deep green, Paternity = light green**, Wedding = magenta, **National Holiday = dark brown**, OOO = ochre. Used as **solid block fills** for *approved* leave on the wall chart and as the colour key in My Leave/reports. **Pending leave is a grey cell with a coloured left bar** marking the type — not a hatch (the hatch read as solid and was dropped). For light type colours (Paternity, OOO) put the letter in ink, not paper. Status (grey/green/red) and category hue stay visually separable.

---

## 3. Typography

| Use | Family | Token | Notes |
|---|---|---|---|
| Page hero / empty state | Inter 700 (or Fraunces for a rare literary title) | `--text-display` | tracking `-2%` |
| Section / card title | Inter 600–700 | `--text-h1` / `--text-h2` | |
| Sub-head | Inter 600 | `--text-h3` | |
| Body | Inter 400 | `--text-body` | leading 1.55 |
| Numbers, dates, day-counts, codes | **JetBrains Mono**, tabular-nums | `.t-num` | balances and the wall chart use mono so columns align |
| Micro-labels / metadata | JetBrains Mono uppercase | `.t-label` | table headers, filenames, timestamps |
| Pull quote / empty-state line | Fraunces italic | `.t-editorial` | sparing — when it appears, it lands |

Headlines in the editorial register may end with a period (the 17 signature); product microcopy stays plain and functional.

---

## 4. Spacing, radius, motion

- **Spacing** on a 4px base (`--space-1..8`). Tables and forms use `--space-3` cells; page padding `--space-5/6`.
- **Radius:** `--radius-0` (default, brand-true) for cards/buttons/panels; `--radius-sm` (2px) optional for inputs; `--radius-pill` only for status pills.
- **Motion:** `--motion-fast/base` with `--ease`; respect `prefers-reduced-motion` (tokens already disable animation when set).
- **Elevation:** prefer 1px borders over shadows; `--shadow-overlay` only for modals/toasts.

---

## 5. Core components (build these once, in both themes)

Reference classes live in `tokens.css`; productionise them as React components.

- **Button** — `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-danger`.
- **Input / Select / Date picker** — `.input`; green focus ring; mono for date display.
- **Table** — `.table` with mono uppercase headers on `--surface-2`, hairline rows, hover highlight; numeric columns right-aligned + tabular.
- **Status pill** — `.pill` + state modifier.
- **Card / Panel** — `.card`, sharp corners, hairline border.
- **Wall-chart cell** — `.cell` + `.cell--approved` (solid `--lt-*` fill), `.cell--pending` (grey fill + coloured left bar = type), `.cell--off` (weekend/non-working = faint hairlines, never grey).
- **Toast / inline alert** — **flat**: `--surface` + 1px border + a 3px coloured left edge (`--success/--warning/--danger`). **No drop shadow.** Reserve `--shadow-overlay` for true floating overlays (modals) only.
- **Allowance donut** — available arc green (`--accent`), pending arc grey (`--status-pending-bg`), taken arc charcoal (`--donut-taken`).
- **Nav** — active item marked by a green indicator bar (`--accent`), not a filled pill.

Every component: keyboard-operable, visible focus, and verified at **AA contrast** in light and dark.

---

## 6. Theming mechanics

- Set `data-theme="light" | "dark"` on `<html>`. Default to the user's OS preference (`prefers-color-scheme`), then let them override; persist the choice.
- All components read semantic tokens (`--bg`, `--surface`, `--text`, `--accent`, status/leave tokens) — **never** the raw primitives directly in components, so a theme swap is a single attribute change.
- Test every screen in both themes before merge (Definition of Done).

---

## 7. Accessibility

- WCAG 2.1 **AA** for text and UI contrast in both themes.
- Status/leave never communicated by colour alone — always pair with a label, letter code or icon (e.g. wall-chart cells carry the type's letter; pills carry text).
- Full keyboard support; visible green focus ring; logical tab order; ARIA on the calendar grid, menus and dialogs.
- Honour `prefers-reduced-motion`.
- Hit targets ≥ 40px on touch.

---

## 8. Layout & responsiveness

- **Breakpoints:** mobile ≤ 640px · tablet 641–1024px · desktop ≥ 1025px.
- **App container:** max-width ~1280px, centred; page padding `--space-5` on mobile, `--space-6` on desktop.
- **Density:** compact tables (`--space-3` cells), comfortable forms. Two-column layouts collapse to one column ≤ 640px.
- **Wall chart on mobile:** horizontal scroll with a sticky employee-name column; never shrink day cells below tap size.
- No fixed-pixel page layouts — use CSS grid/flex so the rhythm rescales. Test 360px → 1920px in both themes.

## 9. Iconography

- One **line-icon set** (e.g. Lucide or Phosphor), ~1.5px stroke, drawn with `currentColor` so icons inherit text/accent colour and re-theme automatically.
- Sizes: 16 / 20 / 24px. Optical alignment with adjacent text.
- **No emoji as UI icons.** Status and leave types are never icon-only — always pair with a label or letter code.

## 10. Component states

Every interactive component defines all of: **default, hover, active/pressed, focus (green ring), disabled (45% opacity, no pointer), selected, loading, error**.

- **Loading:** skeleton blocks in `--surface-2` with a subtle opacity pulse (disabled under `prefers-reduced-motion`). Avoid spinner-only content screens.
- **Empty states:** one short line (Fraunces is allowed here) + a single primary action — e.g. *"No leave booked yet."* + **Request leave**.
- **Error states:** inline message in `--danger` with guidance; invalid fields get a red border + helper text, never colour alone.

## 11. Governance, tooling & UI writing

- **Document components in Storybook** (or equivalent): usage, do/don't, props, a11y notes, a code snippet, rendered in **both themes**.
- **Contribution checklist (gates merge):** keyboard-operable · visible green focus · AA contrast in light **and** dark · works in both themes · has tests · uses tokens (no hard-coded hex) · respects reduced-motion.
- **Tokens are versioned**, and each colour token documents its intended AA contrast pairing. Change *semantic* tokens, not components; changing a primitive ripples everywhere by design.
- **UI writing:** plain, sentence case, action-first ("Request leave", "Approve"). Numbers and dates in JetBrains Mono. For any customer-facing/marketing copy use the **17-voice** system; product microcopy stays functional.

## 12. Quick start for builders

```html
<!doctype html>
<html data-theme="light">
  <head><link rel="stylesheet" href="/design/tokens.css"></head>
  <body>
    <button class="btn btn-primary">Request leave</button>
    <span class="pill pill-pending">Pending</span>
    <table class="table"> … </table>
  </body>
</html>
```

Flip `data-theme` to `"dark"` and everything re-themes. That's the contract.
