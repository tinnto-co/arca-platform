# Component Spec — Arca Dashboard

Per-component breakdown of the dashboard. Build each as a reusable component; don't inline them in the page.

---

## `<AppShell>`

Two-column grid. `grid-template-columns: 248px 1fr; min-height: 100vh; background: var(--bg)`.

Children: `<Sidebar />` and `<MainColumn />`.

---

## `<Sidebar>`

- Width 248px, sticky top:0, height 100vh.
- Background `--navy-900`, text `#E8E9EE`.
- Padding `14px 12px`, internal gap `4px`.
- Flex column; `<SidebarFooter>` pinned to bottom via `margin-top: auto`.

### Children (in order)

1. `<WorkspaceSwitcher>` — 32×32 monogram tile (cream gradient bg, navy text, display font 13/700), workspace name + handle (mono 11.5 / `#8A8F9E`), chevron-up-down glyph. Clickable; opens workspace picker.
2. `<SidebarSearch>` — input shell with search icon + "Buscar" placeholder + `⌘K` kbd on the right. `rgba(255,255,255,0.04)` bg, `rgba(255,255,255,0.06)` border, 10px radius.
3. `<NewButton>` — full-width CTA, cream bg (`#F7F6F2`), navy text, plus icon.
4. `<NavItem>`s — home/inicio (active by default on this page).
5. `<NavGroupLabel>` "Plataforma" — 10.5px/600 uppercase, tracking 0.08em, color `#6E7283`, padding `14px 10px 6px`.
6. `<NavItem>`s — Clientes (57), Notificaciones (12 red badge), Trabajos (24), Facturas (699), Sueldos, Calendario, Informes.
7. `<NavGroupLabel>` "Cuenta".
8. `<NavItem>` Administración.
9. `<SidebarFooter>` — top border `rgba(255,255,255,0.06)`, contains `<UserCard>`.

### `<NavItem>` props

```ts
{ icon: ReactNode; label: string; count?: number | { value: number; urgent?: boolean }; active?: boolean; href: string; }
```

- Default state: `color: #C6C9D3`.
- Hover: `background: rgba(255,255,255,0.04); color: #F2F3F7;`
- Active: `background: rgba(255,255,255,0.06); color: #FFFFFF;` plus a `::before` 2px light bar at `left: -12px; top: 8px; bottom: 8px; border-radius: 2px; background: #F7F6F2;`.
- Count is right-aligned, mono 11px, color `#8A8F9E` default. Urgent variant: coral pill (`oklch(0.60 0.15 25)` bg, white text, 16px tall, 6px horizontal padding).

### `<UserCard>`

- 30×30 circle avatar with initials on a `linear-gradient(135deg, #2A4680, #C2A878)`.
- Name (12.5/600) + email (11 / `#8A8F9E`), both truncated.
- Trailing chevron-down (14px, `#8A8F9E`).
- Hover: `background: rgba(255,255,255,0.04)`.

---

## `<Topbar>`

- Sticky `top: 0; z-index: 5;`.
- `padding: 18px 36px`, bottom border `--border`, background `--bg`.
- Flex row space-between.

### Left
`<Breadcrumbs>`: items separated by `/` (color `--ink-4`), last item (`cur`) is `--ink` 500.

### Right — `<TopbarActions>`
- `<PeriodControl>` segmented — options: `Hoy · 7d · 30d · 90d · YTD`. Selected uses `--ink` bg + white text, dividers are `--border`.
- `<IconButton>` (download) — `32×32`, 10px radius, `--border-strong` border, `--surface` bg.
- `<IconButton>` (bell) with a `dot` absolutely positioned top-right (7px circle, coral, 1.5px surface-colored stroke).
- `<Button variant="primary">` "Nueva factura" + plus icon. Primary: `--ink` bg, white text, `--ink` border; hover `#000`.

---

## `<Greeting>`

- Flex row space-between, `flex-wrap: wrap`, gap 24px, margin-bottom 24px.
- Title: display 30/600, letter-spacing -0.025em. Renders as `Buenas {partOfDay}, <span class="sub">{workspace}</span>` where `.sub` is 500 weight, `--ink-3` color.
- Sub paragraph: 13.5px, `--ink-3`, max 560px.
- Right side: `<Button>` (calendar icon + date range text) and `<Button>` (filter icon + "Filtros").

---

## `<KpiCard>` (primary)

```ts
{ label: string; icon: ReactNode; delta?: { kind: 'pos'|'neg'|'warn'; text: string }; value: string; currency?: string; foot: { label: string; value?: string }; spark: { kind: 'pos'|'neg'|'warn'|'navy'; path: string; areaPath: string }; }
```

- `background: --surface`, 1px `--border`, 14px radius, padding `18px 20px`.
- Relative positioning so sparkline can absolute-pos bottom-right (`right: 16px; bottom: 14px; width: 90px; height: 34px`).
- Label row: 22×22 icon tile (6px radius, `--surface-2` bg, `--border` border, `--ink-2` icon) + label text (12.5 / 500 / `--ink-3`). Delta on right: pill, 2px/7px padding, 20px radius, semantic color pairing.
- Value: display 28/600, tabular-nums, prefix `$` in 18/500 `--ink-3` then the number in `--ink`.
- Foot: 11.5px, `--ink-3`, flex space-between.

4 instances on the page (Ventas / Compras / Resultado bruto / IVA a pagar).

## `<MiniKpi>`

```ts
{ label: string; icon: ReactNode; trailing?: ReactNode; value: string; valueSub?: string; progress: { kind: 'pos'|'neg'|'warn'|'info'; pct: number }; footLeft: string; footRight: string; }
```

- Padding `14px 16px`, 14px radius, 10px gap.
- Progress bar: 4px tall, 2px radius, `--surface-2` track, `--border` outline, filled bar in semantic color.
- Value row: display 22/600 with a smaller trailing label (11.5 / 500 / `--ink-3`).

4 instances (Clientes activos / Facturas / Notif. / Deudas).

---

## `<EvolucionChart>` card

- Header: title "Evolución mensual" + sub "Ventas vs Compras · últimos 6 meses", right side `<TabBar>` (Mensual/Trimestral/Anual) + overflow `<IconButton>`.
- Legend row below header, `11.5px`, with 10×10 square swatches.
- SVG chart, `viewBox="0 0 820 300"`, width 100%, height 316px container, `padding: 20px 14px 12px`.
  - 5 dashed horizontal gridlines, `#ECEAE3`, `dasharray 3,4`.
  - Y-axis labels right-aligned `text-anchor="end"` at x=42 in `9B9CA3` 10px.
  - 6 month groups. Each month: 2 bars 36px wide, 4px gap between them. Ventas in `#1E3460`, Compras in `#7AA2C8`, 5px radius.
  - Current month (rightmost): `fill-opacity: 0.65` + floating `#12131A` pill above it at y=35, 80×22, 6px radius, text "En curso" white 11/600.
  - Margin line: dashed `#C2A878`, 2px width, dasharray 4 4, with dots on each month — the current month dot is inverted (white fill, gold 2px stroke).
  - X-axis labels below bars at y=300, `6E7079` 11px, current month bolded in `--ink`.
- Footer: "Promedio mensual: $X" + right-aligned link "Ver reporte completo →".

Render the chart with a charting library that matches the codebase (recharts / visx / uplot). Re-producing the exact visuals matters more than SVG fidelity.

---

## `<FlujoCajaCard>`

- Header: "Flujo de caja" / "Distribución mes en curso" on the left, right-side `<Chip>` "En regla" with green swatch.
- Body `padding: 20px`:
  - Big value `$169.183.051` (display 26/600) + caption "Saldo neto del periodo".
  - Stacked horizontal bar 8px tall, 4px radius, 4 segments with `flex` weights (56/22/14/8). Colors navy-700 / chart-3 / chart-4 / coral.
  - List of 4 rows, each: 10px square swatch + label (left) · amount (right) · sub-line (percentage + detail).
- Footer: updated time + link "Ver flujo completo →".

---

## `<ClientesTable>` card

- Header: title "Clientes con movimiento", sub "Facturación del mes · top por volumen". Right-side "Filtrar" button with funnel icon.
- `<table class="t">`:
  - `<th>`: 10.5px / 600 / uppercase, letter-spacing 0.06em, `--ink-3`, bg `--surface-2`, 10px 20px padding, top + bottom 1px border `--border`.
  - `<td>`: 12px 20px, bottom 1px border `--border`, color `--ink-2`.
  - `.num` cells right-aligned, tabular, `--ink` 500.
  - Row hover: `--surface-2`.
- Cell composition for Cliente: 28×28 tile (7px radius, 2-letter initials in white 10.5/700) + name (`--ink` 600 13px) + CUIT (mono 11px `--ink-4`).
- `<StatusTag kind="ok|pend|late">`: 11px, pill radius, colored-bg semantic variant with matching dot (6px).
- Footer: "Mostrando 5 de 57 clientes" + "Ver todos →".

## `<VencimientosList>` card

- Header: title "Vencimientos próximos", right chip "3 urgentes" in coral.
- List of `<DueItem>`s, each row grid `46px 1fr auto`:
  - `<DateBlock>`: 46px wide, 8px radius, 1px border, `--surface-2` bg; 16/700 day + 9.5/600 uppercase month. Urgent variant uses `--accent-neg-bg` bg, coral text, no border.
  - Title (13 / 500) + subtitle (11.5 / `--ink-3`).
  - Amount (12 / 600, tabular, right).
- Footer: "Próximos 30 días" + "Ver calendario →".

---

## `<ActividadFeed>` card

- Header: title "Actividad reciente", sub, `<TabBar>` (Todo/Facturas/Sueldos/Tareas).
- List of `<FeedItem>`s, grid `28px 1fr auto`, padding `12px 20px`, 1px bottom border `--border`.
- `<IconTile kind>`: 28×28, 7px radius, 1px border `--border`, default bg `--surface-2` + `--ink-2` icon. Kinds: `pos` (green bg+fg), `info` (blue bg+fg), `warn` (amber bg+fg), `neutral` (default).
- Title: 13 / 500 `--ink`, with `<b>` bolded entities (600).
- Sub: 11.5 / `--ink-3`, inline mono references where relevant.
- Timestamp: 11 / `--ink-4`, tabular, nowrap, right-aligned.
- Footer: "22 eventos hoy" + "Ver registro completo →".

---

## Shared primitives

### `<Button>`
- Base: inline-flex, 6px gap, `8px 14px` padding, 10px radius, 13/500, border `--border-strong`, bg `--surface`, color `--ink`. Hover: bg `--surface-2`.
- Variant `primary`: bg `--ink`, text white, border `--ink`; hover `#000`.
- Small variant: `6px 10px`, 12px font (used by "Filtrar").

### `<IconButton>`
- 32×32 square, 10px radius, 1px border `--border-strong`, `--surface` bg, icon `--ink-2`. Hover `--surface-2`. Supports a `dot` top-right for notifications.

### `<Chip>`
- inline-flex, 5px gap, 3px/8px padding, 20px radius, `--surface-2` bg, 1px border `--border`, 11/500 `--ink-3`. Optional leading 7px round swatch. Semantic variants overlay status colors.

### `<TabBar>`
- inline-flex, `--surface-2` bg, 1px border `--border`, 10px radius, 2px inner padding.
- Buttons: 4px/10px, 6px radius, 12/500 `--ink-3`.
- Active button: `--surface` bg, `--ink` text, `shadow-sm`.

### `<StatusTag kind>`
- inline-flex, 5px gap, 2px/8px padding, 20px pill, 11/500. Tinted bg + matching text per status. Leading 6px dot.

### `<Delta kind>`
- inline-flex, 3px gap, 2px/7px padding, 20px pill, 11.5/600, tabular. Tint + text per `pos|neg|warn`.

### `<ProgressBar kind pct>`
- 4px tall, 2px radius, `--surface-2` track, 1px `--border` outline, fill in semantic color scaled by pct.

### `<Sparkline>`
- Inline SVG, 90×34, non-preserving aspect ratio. Pair: area path with a top→transparent linear gradient, line path 1.5 stroke. Uses `semantic` color per context.

### `<Avatar>`
- Workspace variant: 32×32, 8px radius, cream gradient.
- User variant: 30×30 circle, navy→gold gradient.
- Client variant: 28×28, 7px radius, solid color from a per-client palette.

---

## Responsive notes

The reference is laid out for ≥1280px. For smaller viewports:

- ≥1100px: reduce `.page` horizontal padding to 24px, collapse mini-kpi row to 2×2, keep everything else as-is.
- ≥900px: collapse `grid-main` to a single column (chart stacks above cashflow), collapse `grid-bot` to single column.
- ≥640px (tablet): hide sidebar behind a hamburger in the topbar; primary KPI row becomes 2×2; tables get a horizontal scroll container.
- <640px (phone): the dashboard is not optimized for mobile in this design. Either out-of-scope or the dev should propose a simplified mobile layout in a follow-up pass.

These are reasonable defaults; confirm with product whether mobile is in-scope for this milestone.
