# Handoff: Arca — Dashboard Redesign (Estudio Contable)

## Overview

This package contains the design for **Arca Dashboard**, a home/overview screen for an accounting-firm SaaS (estudio contable) targeting the Argentine market (Spanish-language UI, ARS formatting, AFIP integrations). The dashboard gives the firm a single-pane view of portfolio-level accounting metrics: sales vs purchases, IVA obligations, cashflow distribution, top active clients, upcoming fiscal deadlines, and a recent-activity feed.

The goal of this redesign is a **warm, calm, editorial B2B look** — closer to a modern finance/operations tool than to a bright marketing dashboard. Dense information, generous negative space around typographic anchors, minimal color used purposefully for status and data.

---

## About the Design Files

The files under `reference/` are **design references created in HTML/CSS** — a static prototype showing the intended look, layout, typography, spacing, color system, and data density. **They are not production code to copy verbatim.**

Your task is to **recreate this design in the target codebase's existing environment** (React / Vue / Svelte / whatever is already in place), following its established conventions — component library, routing, state management, styling approach (CSS modules / Tailwind / styled-components / etc.), icon set, data-fetching layer, and so on.

If no frontend environment exists yet in the target project, pick one that fits the project (React + TypeScript + Tailwind + shadcn/ui is a reasonable default for this kind of B2B dashboard) and scaffold it.

**Do not** ship the raw HTML file. Do **not** inline all styles into one giant file. Break the UI into real components with real props, and wire the data to your app's real data layer (mocked adapters are fine while backend endpoints are still being built — just isolate them behind an interface).

---

## Fidelity

**High fidelity.** The reference HTML is pixel-considered: exact hex/oklch values, specific spacing, specific type scales, specific data formatting conventions. Match it closely. When your existing design system already has an equivalent token (e.g. a spacing scale, a radius scale), prefer the design-system token that most closely matches the reference value rather than hard-coding the reference number — consistency with the rest of the codebase beats pixel-perfection of one screen.

---

## Files in This Package

```
design_handoff_arca_dashboard/
├── README.md                     ← you are here
├── DESIGN_TOKENS.md              ← all color / type / spacing / radii tokens
├── COMPONENT_SPEC.md             ← per-component breakdown and props
└── reference/
    ├── Arca Dashboard.html       ← the HTML mockup (open in a browser to inspect)
    └── browser-window.jsx        ← frame used for presentation; ignore for impl
```

---

## Screens / Views

There is **one screen** in this handoff: the **Dashboard / Inicio** page.

Layout is a classic two-column app shell:

- **Left sidebar** — fixed width `248px`, sticky, full viewport height, dark navy background. Contains: workspace switcher, search, primary CTA ("Crear nuevo"), nav items grouped under "Plataforma" and "Cuenta", and a user card pinned to the bottom.
- **Main column** — fluid, min-width zero so tables and charts can shrink. Contains: a sticky topbar, then a scrollable page with a greeting, two KPI rows, a chart + cashflow row, a clients table + deadlines row, and a recent-activity feed.

Content max-width inside `.page` is `1440px` with `28px` top / `36px` horizontal / `60px` bottom padding.

### Section-by-section

1. **Topbar** (sticky). Breadcrumbs (`Workspace / Inicio`) on the left. On the right: a period segmented control (`Hoy · 7d · 30d · 90d · YTD`, default `30d`), an export icon button, a notifications icon button with a red dot, and a dark primary button "Nueva factura".

2. **Greeting block**. `h1` "Buenas tardes, Estudio Blak-G" using display font, `30px / 600 / letter-spacing -0.025em`. A gray sub-line describes the period. A right-aligned date-range button and a filters button sit on the same row.

3. **Primary KPI row** — 4 cards, equal columns, `14px` gap:
   1. **Ventas del mes** — `$359.929.960` · delta `-91.1%` (neg, coral) · spark line trending down.
   2. **Compras del mes** — `$190.746.909` · delta `+92.3%` (pos, green) · spark area trending up.
   3. **Resultado bruto** — `$169.183.051` · delta `+12.4%` (pos) · margin `47.0%` · navy spark.
   4. **IVA a pagar** — `$32.272.144` · warn badge "vence 20 may" · amber spark.

   Each KPI card: white surface, 1px border, `14px` radius, `18px 20px` padding, absolute-positioned `90×34` sparkline pinned bottom-right. Value uses display font, `28px / 600`, tabular-nums, with a lighter-weight `$` prefix.

4. **Mini KPI row** — 4 smaller cards with progress bars: Clientes activos (57/62, 92%), Facturas del mes (699 emitidas, 78% cobradas), Notif. pendientes (290, 36%, 12 urgentes), Deudas vencidas (5 clientes, +6 días promedio).

5. **Grid main** — `2fr / 1fr` two-column:
   - **Evolución mensual** card — tabbed (Mensual/Trimestral/Anual), SVG chart with 6 months of paired bars (Ventas navy + Compras light-blue) plus a dashed margin line with gold dots. Current month ("abr 26") has reduced opacity and a small "En curso" dark pill floating above it. Y-axis in millions, x-axis labels. Footer shows "Promedio mensual" and a "Ver reporte completo →" link.
   - **Flujo de caja** card — large net-balance number, a single horizontal stacked bar showing distribution, then a list: Operaciones 56%, Impuestos 22%, Sueldos 14%, Otros gastos 8% with amounts and sublines.

6. **Grid bot** — `1.4fr / 1fr` two-column:
   - **Clientes con movimiento** table — Cliente (avatar + name + CUIT), Estado (status pill: Al día / Pendiente / Vencido +Nd), Últ. actividad (relative time), Facturado (right-aligned tabular numbers). 5 rows shown, "Mostrando 5 de 57".
   - **Vencimientos próximos** list — day/month date-block (urgent variant uses coral bg), title + subtitle, right-aligned amount. Header shows a "3 urgentes" chip.

7. **Actividad reciente** feed — full width. Tabbed filter (Todo/Facturas/Sueldos/Tareas). Each row: 28×28 icon tile (colored-bg for positive/info/warn, neutral otherwise), title with bolded entities, sub-line with mono-font references, right-aligned relative timestamp.

See `COMPONENT_SPEC.md` for per-component details, props, and states.

---

## Interactions & Behavior

This is a hi-fi **static mockup** — no JS behavior is implemented in the reference. The developer must wire:

### Navigation
- Sidebar `nav-item`s are router links. Active state: `rgba(255,255,255,0.06)` background + a 2px light bar flush to the left edge (see reference CSS `.nav-item.active::before`). Counts on the right are data-driven.
- Breadcrumbs: each segment is a link except the current one.
- Workspace switcher (top of sidebar) opens a dropdown to switch between the firm's workspaces — not designed in this pass; use the app's existing pattern.

### Period control (topbar)
- Segmented control, single-select. Selected: `--ink` background, white text. Others: no background, `--ink-3` text. Changing it refetches all data on the page scoped to the new range.

### KPI cards
- Hover: subtle lift — add `box-shadow: var(--shadow-md)` on hover and a `transform: translateY(-1px)` with `transition: 120ms`.
- Click: navigate to the relevant detail view (e.g. Ventas → Facturas filtered to period).

### Chart
- Tabs Mensual/Trimestral/Anual swap the data granularity, re-rendering the SVG.
- On bar/dot hover: show a tooltip anchored to the pointer with month, Ventas amount, Compras amount, margin %.
- "En curso" pill is static — pins to the current (rightmost) month.

### Tables
- Row hover: `background: var(--surface-2)`, cursor pointer. Click opens the client profile.
- Status tags are semantic, not clickable.
- "Filtrar" opens a filter popover (not designed here — use app's pattern).

### Deadlines
- Urgent date-block: coral background, coral text. Threshold: due date ≤ 5 days away.
- Click row → opens the obligation's detail/payment flow.

### Activity feed
- Tabs filter events by type (Todo/Facturas/Sueldos/Tareas).
- "Ver registro completo →" links to a full audit log page.
- Icon-tile color is driven by event severity (pos/info/warn/neutral).

### Global
- All numeric values use tabular-nums and `es-AR` formatting (`.` as thousands separator, `,` as decimal).
- Currency is prefixed with `$ ` — no three-letter code. ARS is implied.
- Relative timestamps ("hace 12 min", "ayer, 18:42") should be derived from an `Intl.RelativeTimeFormat('es-AR')`-based helper.

### Animations & transitions
- Sidebar nav hover: `background .12s, color .12s`.
- Workspace, icon-btn, btn hover: `.12–.15s ease` background changes.
- KPI hover: `transform + shadow 120ms`.
- No scroll-triggered animations. No hero motion. Keep it calm.

---

## State Management

Suggested page-level data shape:

```ts
type DashboardData = {
  period: '1d' | '7d' | '30d' | '90d' | 'ytd';
  greeting: { partOfDay: 'mañana' | 'tarde' | 'noche'; workspace: string };
  kpis: {
    ventas:        { value: number; prevValue: number; deltaPct: number; spark: number[] };
    compras:       { value: number; prevValue: number; deltaPct: number; spark: number[] };
    resultadoBruto:{ value: number; marginPct: number; deltaPct: number; spark: number[] };
    iva:           { value: number; dueDate: string; spark: number[] };
  };
  miniKpis: {
    clientesActivos:  { active: number; total: number; newThisPeriod: number };
    facturasDelMes:   { emitted: number; collected: number; deltaPct: number };
    notifPendientes:  { open: number; urgent: number; resolvedToday: number };
    deudasVencidas:   { clientCount: number; totalAmount: number; avgDaysLate: number };
  };
  evolucion: Array<{ month: string; ventas: number; compras: number; marginPct: number; current?: boolean }>;
  flujoCaja: {
    saldoNeto: number;
    buckets: Array<{ key: 'operaciones'|'impuestos'|'sueldos'|'otros'; amount: number; pct: number; subtitle: string }>;
  };
  clientesTop: Array<{ id: string; name: string; cuit: string; status: 'ok'|'pend'|'late'; lateDays?: number; lastActivity: string; billed: number; avatarColor: string; initials: string }>;
  vencimientos: Array<{ id: string; date: string; title: string; subtitle: string; amount: number; urgent: boolean }>;
  actividad: Array<{ id: string; type: 'pos'|'info'|'warn'|'neutral'; title: string; subtitle: string; time: string; icon: string }>;
};
```

- Fetch once on mount; refetch when `period` changes.
- Each card can show its own skeleton independently (preferred for perceived perf) or the whole page can skeleton together; either is fine.
- Debounce period changes 150ms so rapid clicks don't thrash requests.

---

## Design Tokens

See `DESIGN_TOKENS.md` for the complete token table. Summary:

- Background: warm off-white `#F7F6F2`. Surfaces `#FFFFFF` / `#FBFAF6`. Borders `#ECEAE3` / `#DFDCD3`.
- Ink ramp: `#12131A` → `#3E404A` → `#6E7079` → `#9B9CA3`.
- Primary: navy — `#0B1730` / `#142447` / `#1E3460` / `#2A4680`.
- Status (oklch, same chroma 0.13–0.15 across hues):
  - Positive — `oklch(0.62 0.13 160)` (green)
  - Negative — `oklch(0.60 0.15 25)` (coral)
  - Warning  — `oklch(0.72 0.13 75)` (amber)
  - Info     — `oklch(0.60 0.12 240)` (blue)
- Chart: `#1E3460`, `#7AA2C8`, `#C2A878`, `#8FB39F`.
- Type: **Inter** (sans body/UI), **Inter Tight** (display — used for h1/kpi values/card titles), **JetBrains Mono** (mono — used for CUIT, email, invoice numbers, kbd).
- Radii: 6 / 10 / 14 / 18.
- Shadows: `sm: 0 1px 2px rgba(18,19,26,.04)`, `md: 0 1px 3px rgba(18,19,26,.04), 0 4px 12px rgba(18,19,26,.04)`.

---

## Assets

- **Icons:** all icons in the reference are inline `lucide`-style 24×24 stroke icons at 1.5–2.2 stroke-width. Use [lucide-react](https://lucide.dev) or whatever icon library is already in the codebase. Specific icons used: `home, users, bell, clock, file-text, dollar-sign, calendar, trending-up, settings, search, plus, chevron-up-down, chevron-down, download, filter, bar-chart-2, credit-card, shopping-cart, activity, zap, check, alert-triangle, more-horizontal, upload, message-square, info, square`.
- **Logos / imagery:** none — the workspace avatar is a generated monogram (`BG`) on a cream gradient; client avatars are generated colored tiles with initials. No real logos needed.
- **Fonts:** load from Google Fonts (already requested in the reference `<link>`) or self-host with the codebase's font pipeline.

---

## Implementation Notes

- The reference uses `oklch()` for status colors. Modern browsers support this; if the codebase must support older targets, compute sRGB fallbacks at build time (PostCSS `@csstools/postcss-oklab-function` or equivalent).
- Tables should remain proper `<table>` elements for accessibility — don't rebuild them as divs.
- All status pills, date blocks, and icon tiles should be standalone reusable components (`<StatusTag kind="ok">`, `<DateBlock date={...} urgent />`, `<IconTile kind="pos">`).
- The sidebar's active indicator (the 2px left bar) is a `::before` pseudo-element positioned `left: -12px` relative to the padded container — keep that detail; it reads as "the item is flush to the rail."
- Numeric values MUST use `font-variant-numeric: tabular-nums` everywhere (KPI values, table amounts, sparkline labels, timestamps). Values jumping width during updates is the single fastest way this dashboard can feel cheap.
- Keep the topbar and sidebar `position: sticky` so long pages still feel anchored.
- Respect `prefers-reduced-motion` — disable hover lifts and transition durations.
- Respect `prefers-color-scheme: dark` if the app supports dark mode; otherwise this design is light-only.

---

## Open Questions for the Dev / PM

Before implementation, confirm with product:

1. Does "Ventas del mes" compare to the same calendar month last year, or to the previous 30-day window? The reference says "vs mes anterior" — verify.
2. The `-91.1%` delta on Ventas is because the current month is only 20 days in — should deltas be **prorated** (extrapolated to full month) or **point-in-time** (today vs same-day last month)? UX implication.
3. Is the "En curso" marker on the bar chart the preferred treatment for the current (partial) period, or do you prefer a dashed outline / different color? (Reference uses reduced opacity + dark pill.)
4. Search (`⌘K`) behavior — is there a global command palette elsewhere in the app to reuse, or does this need to be built from scratch?
5. Who can see the "Sueldos" figures? Gate the cashflow card's "Sueldos" row behind a role check if payroll is privileged.
