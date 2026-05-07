# Design Tokens — Arca Dashboard

Paste these into the codebase's existing token layer (Tailwind config, CSS custom properties, theme file, etc.). If a token already exists with an equivalent purpose, prefer the existing one — consistency wins.

---

## Color

### Neutrals (warm)

| Token              | Value     | Usage                                      |
| ------------------ | --------- | ------------------------------------------ |
| `--bg`             | `#F7F6F2` | Page background (warm off-white)           |
| `--surface`        | `#FFFFFF` | Cards, tables, primary surfaces            |
| `--surface-2`      | `#FBFAF6` | Table headers, subtle nested surfaces      |
| `--border`         | `#ECEAE3` | Default border, divider                    |
| `--border-strong`  | `#DFDCD3` | Button borders, period-pill border         |

### Ink (text)

| Token     | Value     | Usage                                |
| --------- | --------- | ------------------------------------ |
| `--ink`   | `#12131A` | Primary text, KPI values, titles     |
| `--ink-2` | `#3E404A` | Secondary text, body                 |
| `--ink-3` | `#6E7079` | Tertiary text, labels, card subs     |
| `--ink-4` | `#9B9CA3` | Placeholders, muted timestamps       |

### Primary — Navy

| Token        | Value     | Usage                                 |
| ------------ | --------- | ------------------------------------- |
| `--navy-900` | `#0B1730` | Sidebar background                    |
| `--navy-800` | `#142447` | Hover / pressed navy surfaces         |
| `--navy-700` | `#1E3460` | Primary data color (chart-1), accents |
| `--navy-600` | `#2A4680` | Ramp step, avatar gradient start      |

### Status accents (oklch — same chroma, hue varies)

| Token                 | Value                         | Usage                               |
| --------------------- | ----------------------------- | ----------------------------------- |
| `--accent-pos`        | `oklch(0.62 0.13 160)`        | Green — "al día", positive delta    |
| `--accent-pos-bg`     | `oklch(0.94 0.04 160)`        | Green tint bg for badges            |
| `--accent-neg`        | `oklch(0.60 0.15 25)`         | Coral — vencido, negative delta     |
| `--accent-neg-bg`     | `oklch(0.94 0.04 25)`         | Coral tint bg                       |
| `--accent-warn`       | `oklch(0.72 0.13 75)`         | Amber — pending, warnings           |
| `--accent-warn-bg`    | `oklch(0.95 0.04 75)`         | Amber tint bg                       |
| `--accent-info`       | `oklch(0.60 0.12 240)`        | Blue — info                         |
| `--accent-info-bg`    | `oklch(0.94 0.04 240)`        | Blue tint bg                        |

Darker on-bg variants for badge text: `oklch(0.45 0.13 160)` / `oklch(0.45 0.15 25)` / `oklch(0.50 0.13 75)` / `oklch(0.45 0.12 240)`.

### Chart palette

| Token       | Value     | Usage                          |
| ----------- | --------- | ------------------------------ |
| `--chart-1` | `#1E3460` | Ventas (primary data)          |
| `--chart-2` | `#7AA2C8` | Compras (secondary data)       |
| `--chart-3` | `#C2A878` | Margin line, tax bucket        |
| `--chart-4` | `#8FB39F` | Payroll bucket, quaternary     |

---

## Typography

### Font families

| Token          | Value                                                 | Usage                                   |
| -------------- | ----------------------------------------------------- | --------------------------------------- |
| `--ff-sans`    | `'Inter', system-ui, -apple-system, sans-serif`       | Body, UI, labels (400/500/600/700)      |
| `--ff-display` | `'Inter Tight', 'Inter', sans-serif`                  | H1, KPI values, card titles (500/600/700) |
| `--ff-mono`    | `'JetBrains Mono', ui-monospace, monospace`           | CUIT, emails, invoice IDs, `kbd` (400/500) |

### Type scale (selected)

| Element                     | Family  | Size / Weight / Leading / Tracking                    |
| --------------------------- | ------- | ----------------------------------------------------- |
| Page H1 (greeting)          | display | 30px / 600 / 1.15 / -0.025em                          |
| KPI value (primary)         | display | 28px / 600 / 1 / -0.025em, tabular-nums               |
| KPI value (mini / cashflow) | display | 22–26px / 600 / 1 / -0.02em                           |
| Card title                  | display | 15px / 600 / 1.3 / -0.01em                            |
| Card sub                    | sans    | 12px / 400 / var / 0                                  |
| Body / table cell           | sans    | 12.5–13px / 400–500 / 1.5 / 0                         |
| Nav label                   | sans    | 13px / 500 / 1.5 / 0                                  |
| Section micro-label         | sans    | 10.5px / 600 / 1.5 / 0.08em, uppercase                |
| Table TH                    | sans    | 10.5px / 600 / 1.5 / 0.06em, uppercase                |
| Status tag                  | sans    | 11px / 500 / 1.5 / 0                                  |
| Delta badge                 | sans    | 11.5px / 600 / 1.5 / 0, tabular-nums                  |
| kbd                         | mono    | 10.5px / 400                                          |
| Due-date big number         | display | 16px / 700 / 1 / -0.02em                              |
| Due-date month              | display | 9.5px / 600 / 1 / 0.1em, uppercase                    |

Body base: `font-family: var(--ff-sans); font-size: 14px; line-height: 1.5;` on `html, body`.

All numeric display **must** use `font-variant-numeric: tabular-nums`.

---

## Spacing

Not a formal scale in the reference; common values in use:

`2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 24 · 28 · 32 · 36 · 60`

Map these to the codebase's existing spacing scale (e.g. Tailwind's `0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8, 9, 15` or whatever is closest). Consistency with the rest of the codebase beats exact pixels.

Grid gaps between cards: `14px`.
Page padding: `28px` top / `36px` horizontal / `60px` bottom.
Card padding (standard): `16px 20px` head, `20px` body, `12px 20px` footer.

---

## Radii

| Token    | Value  | Usage                                     |
| -------- | ------ | ----------------------------------------- |
| `--r-sm` | `6px`  | kbd, inner chips                          |
| `--r-md` | `10px` | Buttons, inputs, nav items, period pill   |
| `--r-lg` | `14px` | Cards, KPI tiles                          |
| `--r-xl` | `18px` | (reserved; not currently used)            |

Pills / status tags: `20px` (pill-shaped).
Circular: `50%` (avatars, bell-dot).

---

## Shadows

| Token         | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| `--shadow-sm` | `0 1px 2px rgba(18,19,26,0.04)`                                        |
| `--shadow-md` | `0 1px 3px rgba(18,19,26,0.04), 0 4px 12px rgba(18,19,26,0.04)`        |

Shadows are intentionally subtle. Do not inflate.

---

## Motion

| Token           | Value        |
| --------------- | ------------ |
| Duration fast   | 120ms        |
| Duration base   | 150ms        |
| Easing          | `ease` (default) — nothing fancy |

Respect `prefers-reduced-motion: reduce`.

---

## Iconography

- Line icons, 1.5–2.2 stroke width (2 is default), 24×24 source, rendered at 12–15px most of the time.
- Use [lucide](https://lucide.dev) (or the icon library already in the codebase). The reference is drawn to match lucide's stroke aesthetic.
