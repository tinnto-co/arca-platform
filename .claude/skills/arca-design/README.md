# Arca — Design System

Design system for **Arca**, a SaaS dashboard for **estudios contables** (accounting firms) in Argentina. Warm, calm, editorial B2B look — dense information, generous negative space around typographic anchors, minimal color used purposefully for status and data. Spanish-language UI, ARS currency formatting, AFIP-adjacent workflows.

This system was distilled from a handoff package (`reference/`) containing a single hi-fi HTML mockup of the **Dashboard / Inicio** screen plus developer-facing token + component docs.

## Sources

- `reference/Arca Dashboard.html` — the pixel-considered HTML mockup (single screen).
- `reference/handoff-README.md` — product overview, section-by-section spec, open questions.
- `reference/DESIGN_TOKENS.md` — tokens table (color, type, spacing, radii, shadows, motion).
- `reference/COMPONENT_SPEC.md` — per-component breakdown (props, states, sizes).

Source path (original handoff, not in this project): `design_handoff_arca_dashboard/` (local mount).

No Figma file, no logo, no marketing site and no mobile app were provided — **this system covers one desktop product surface.** See CAVEATS in the summary for follow-ups.

---

## Product context

**Arca — Dashboard / Inicio** is a single-pane overview for an accounting-firm SaaS. The firm logs in and sees portfolio-level metrics across all its client companies:

- Sales (Ventas) vs Purchases (Compras) — current month and 6-month history.
- Gross result + IVA (VAT) obligations.
- Cashflow distribution buckets (Operaciones / Impuestos / Sueldos / Otros).
- Top active clients with status pills (Al día / Pendiente / Vencido).
- Upcoming fiscal deadlines (AFIP, Ingresos Brutos, Aportes, Sueldos, Ganancias).
- Recent activity feed across invoicing, payroll, tasks.

Layout: fixed navy sidebar (248px) + fluid main column with sticky topbar. Max content width 1440px.

---

## Content fundamentals

**Language:** Spanish (es-AR). All copy, labels, dates, numbers. Never mix English into the UI.

**Voice:** Professional, calm, precise — this is an accountant's tool, not a marketing site. No exclamations, no motivational copy, no emoji. Copy is descriptive rather than prescriptive: the UI shows you what's true, it doesn't cheer you on.

**Casing:** Sentence case everywhere — card titles, buttons, labels, tabs, nav. Only micro-labels and table headers go UPPERCASE (with 0.06–0.08em tracking). Proper nouns keep their capitalization (CUIT, AFIP, IVA, CABA, DDJJ, Ganancias, Sueldos, Bienes personales).

**Address:** The app addresses the firm familiarly via "tus" ("tus clientes y actividad contable"). Greetings reference the firm by workspace name ("Buenas tardes, Estudio Blak-G"), part-of-day localized ("mañana" / "tarde" / "noche").

**Length:** Ruthlessly short. Card titles are 1–3 words ("Ventas del mes", "Flujo de caja", "Vencimientos próximos"). Card subs are one short line describing scope ("Ventas vs Compras · últimos 6 meses"). Tooltips would likely be one sentence max.

**Numeric formatting (critical):**
- Currency: `$ 359.929.960` — `.` as thousands separator, `,` as decimal, single `$` prefix (no `ARS`, no three-letter code).
- All numeric values use `font-variant-numeric: tabular-nums`. **Non-negotiable.**
- Deltas: `+92.3%` / `-91.1%` (sign shown), tabular, rendered inside a colored pill.
- Relative time in lowercase Spanish: `hace 12 min`, `hoy, 11:30`, `ayer, 18:42`, `hace 3 d`.

**Examples (lifted from the reference):**

- Greeting title: `Buenas tardes, Estudio Blak-G`
- Greeting sub: `Resumen general de tus clientes y actividad contable · periodo abr 2026, comparado con mes anterior.`
- Card title / sub: `Evolución mensual` / `Ventas vs Compras · últimos 6 meses`
- Empty-state-ish chip: `En regla`, `3 urgentes`
- Status tags: `Al día`, `Pendiente`, `Vencido +8d`
- Delta label: `vs mes anterior`
- KPI footer label: `margen 47.0%`, `débito − crédito fiscal`
- Footer CTAs: `Ver reporte completo →`, `Ver calendario →`, `Ver registro completo →`

**Iconography-as-copy:** `→` arrow is used to signal "more / drill in" on the footer links. That's the only decorative glyph in body copy; nothing else.

---

## Visual foundations

**Palette.** Warm off-white ground (`#F7F6F2`) with pure white card surfaces on top. Borders are warm grey (`#ECEAE3`, `#DFDCD3`) — never cool grey. Primary is a deep navy (`#0B1730` → `#2A4680`) used on the sidebar, chart data, and the workspace avatar gradient start. Status colors are **oklch-based** with matching chroma (0.13–0.15) and rotating hue so the four semantic accents (pos green, neg coral, warn amber, info blue) visually belong to the same family. A gold (`#C2A878`) sits halfway between navy and warm-neutral and carries the margin line and tax bucket.

**Type.** Three Google fonts, tightly scoped.
- **Inter** — everything body/UI (400/500/600/700).
- **Inter Tight** — display for H1 greetings, KPI values, card titles (500/600/700).
- **JetBrains Mono** — mono for CUIT numbers, invoice IDs, emails, kbd. Used sparingly as a texture for "this is a reference, not prose".
- H1 is 30/600 with `-0.025em` tracking. KPI values are 28/600 with the same tracking. Everything numeric is tabular.

**Spacing.** No formal scale; the reference uses `2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 24 · 28 · 32 · 36 · 60`. Card gaps are `14px`. Page padding is `28 / 36 / 60`.

**Backgrounds.** No imagery. No gradients in the page ground. Gradients appear in exactly two places: the workspace avatar tile (cream → darker cream) and the user avatar circle (navy → gold). Both decorative, both small. No full-bleed photography, no repeating patterns, no textures.

**Animation.** Minimal and fast. Hover transitions `120–150ms ease` on background/color only. KPI cards have a micro lift (`translateY(-1px)` + `shadow-md`) on hover. No scroll-triggered animations, no hero motion, no bouncy easing. Respects `prefers-reduced-motion`.

**Hover states.**
- Nav items (dark sidebar): `background: rgba(255,255,255,0.04)`, text brightens to `#F2F3F7`.
- Buttons, icon buttons, cards on light bg: background shifts to `--surface-2` (`#FBFAF6`).
- Table rows: background shifts to `--surface-2`, cursor pointer.
- Primary button: background shifts from `--ink` → `#000`.

**Press states.** Not explicitly defined in the reference — the 120ms hover transition doubles as press feedback. Don't add scale-shrinks or bouncy presses; it would feel out of character.

**Borders.** 1px everywhere; `var(--border)` (`#ECEAE3`) for default dividers (cards, table rows, feed items, topbar bottom), `var(--border-strong)` (`#DFDCD3`) for load-bearing element borders (buttons, icon buttons, the period pill). Active sidebar item uses a 2px left rail (`::before`) in cream, not a background fill — that's the single most distinctive detail.

**Shadows.** Intentionally subtle. Two tokens only: `--shadow-sm` (`0 1px 2px rgba(18,19,26,.04)`) and `--shadow-md` (`0 1px 3px, 0 4px 12px` of the same ink at 4% opacity). Never inflate. Cards rest on 1px border; they do not float.

**Transparency / blur.** Not used. No glassmorphism. Opacity is only used on the "current month" chart bars (`fill-opacity: 0.65`) to signal "partial / in-progress" data, and on hover affordances (`rgba(255,255,255,0.04)` in the sidebar).

**Corner radii.**
- `6px` — inner chips, kbd.
- `10px` — buttons, inputs, icon buttons, nav items, period pill.
- `14px` — cards, KPI tiles (the "default" card radius).
- `18px` — reserved, unused in v1.
- `20px` — pills (status tags, chips, deltas).
- `50%` — avatars, notification dots.

**Cards.** White surface, 1px `--border`, `14px` radius, `overflow: hidden`. Three zones: head (`16 20 14`), body (`20`), optional foot (`12 20` on `--surface-2` with a top border). Card title uses display font with a leading 14px stroke icon; card sub is 12/400 `--ink-3`. Foot is reserved for a left caption + right `Ver X →` link.

**Imagery.** None. Client/workspace/user avatars are generated — colored tiles with 2-letter initials (client), cream-gradient monogram (workspace), navy→gold gradient circle (user). Don't introduce stock photography.

**Layout rules.**
- Sidebar + topbar are `position: sticky`.
- Sidebar: 248px fixed, full viewport height.
- Topbar: sticky top 0, `z-index: 5`, bottom 1px `--border`, bg `--bg` (not white).
- Content: max-width `1440px`, padding `28 / 36 / 60`.
- Grids: `repeat(4, 1fr)` for KPI rows, `2fr 1fr` for chart + cashflow, `1.4fr 1fr` for table + deadlines, single-column for the full-bleed activity feed.
- Card gap: `14px`.

**Charts.** SVG-based in v1. Paired bars (36px wide, 4px gap, 5px radius), dashed gridlines (`3,4` dasharray, `#ECEAE3`), dashed margin overlay (`4 4` dasharray, gold, with dots). Current-period bars get `fill-opacity: 0.65` and a floating dark "En curso" pill above them — this pattern is reusable for any "live / partial" data.

**Density.** High but not cramped. A typical card has `20px` padding and 10–14px gap between internal elements. Tables use `12 20` per cell. The sidebar uses `7 10` per nav item.

---

## Iconography

**Style.** Line icons only — 1.5–2.2 stroke width (2 is default), drawn on a 24×24 grid, rendered at 12–15px most of the time. Stroke ends: round caps, round joins. **No filled icons. No duotone. No emoji.**

**Source.** The reference was drawn to match [**lucide**](https://lucide.dev) — we load it from CDN for v1 (`https://unpkg.com/lucide@latest`). If a codebase import adds a different icon library later (e.g. Phosphor, Heroicons outline), the closest equivalent works as long as stroke weight and corner radii match.

**Used in the reference:** `home, users, bell, clock, file-text, dollar-sign, calendar, trending-up, settings, search, plus, chevrons-up-down, chevron-down, download, filter, bar-chart-2, credit-card, shopping-cart, activity, zap, check, alert-triangle, more-horizontal, upload, message-square, info, square`.

**Icon tiles.** Two container patterns:
- 22×22 / 6px radius, `--surface-2` bg, `--border` border, `--ink-2` icon — used in KPI card label prefixes.
- 28×28 / 7px radius, neutral by default, colored (`--accent-*-bg` + `--accent-*-fg`) for semantic event severity in the activity feed.

**Asset directory.** `assets/` — contains `workspace-logo.svg` (cream-gradient "BG" monogram, from the reference). No brand logo exists for "Arca" itself; if one is added later, drop it in this folder.

**Emoji / unicode.** Emoji is never used. The only unicode glyph in body copy is `→` on footer CTA links. The middot `·` separates metadata (`Ventas vs Compras · últimos 6 meses`).

---

## Index

| Path | What |
| ---- | ---- |
| `README.md` | You are here |
| `SKILL.md` | Agent-Skills-compatible entry point |
| `colors_and_type.css` | CSS custom properties + semantic type classes |
| `reference/` | Original handoff (HTML mockup + dev docs) |
| `assets/` | Logos, monograms, static visual assets |
| `preview/` | Design-system card HTML files (one concept each) |
| `ui_kits/dashboard/` | Interactive recreation of the Arca Dashboard |

## UI Kits

- **`ui_kits/dashboard/`** — the sole product surface. A click-thru recreation of the Dashboard / Inicio screen: sidebar + topbar shell, KPI rows, chart, cashflow, clients table, deadlines list, activity feed. Period control is interactive; nav hover states are live.
