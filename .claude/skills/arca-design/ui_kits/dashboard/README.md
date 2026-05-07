# Arca Dashboard — UI Kit

Click-thru recreation of the Arca Dashboard / Inicio screen.

## Files
- `index.html` — full dashboard (loads all components).
- `Shell.jsx` — `<AppShell>`, `<Sidebar>`, `<Topbar>` (sticky layout).
- `Primitives.jsx` — `<Button>`, `<IconButton>`, `<Chip>`, `<TabBar>`, `<StatusTag>`, `<Delta>`, `<ProgressBar>`, `<Sparkline>`, `<Avatar>`, icons.
- `KPIs.jsx` — `<KpiCard>` and `<MiniKpi>`.
- `Chart.jsx` — `<EvolucionChart>` + `<FlujoCajaCard>`.
- `Tables.jsx` — `<ClientesTable>`, `<VencimientosList>`, `<ActividadFeed>`.
- `data.js` — mock data for the single `abr 2026 / 30d` period.

## Interactions
- Period pill (Hoy/7d/30d/90d/YTD) — toggles active state (no data refetch, mock is static).
- Chart tabs (Mensual/Trimestral/Anual) — toggle active state.
- Activity feed tabs — filter feed rows.
- Nav items — hover state live; active is "Inicio".
- Buttons, KPI cards, table rows — hover lift / bg change.

## Not implemented
- Workspace switcher dropdown (no design supplied).
- Filter popover.
- Real data-refetch on period change.
- Dark mode (reference is light-only).
