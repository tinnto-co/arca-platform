# Arca Platform — Style Guide

## Color Palette

### Primary
- **Primary**: `#232c50` — App sidebar, main graphics, headings, and titles.
- **Primary Light**: `#2e3a66` — Hover states, subtle backgrounds.
- **Primary Dark**: `#1a2040` — Active states, deep accents.

### Secondary
- **Secondary**: `#139ed9` — Buttons, links, interactive elements, and accent details.
- **Secondary Light**: `#3db8e8` — Hover states on buttons, highlighted elements.
- **Secondary Dark**: `#0e7eb0` — Active/pressed button states.

### Neutral
- **Gray Background**: `#efeeef` — Page backgrounds, card backgrounds, subtle separators.
- **Gray Medium**: `#d1d0d1` — Borders, dividers, disabled states.
- **Gray Dark**: `#8a8a8a` — Secondary text, muted labels.
- **White**: `#ffffff` — Card surfaces, input backgrounds.
- **Black**: `#1a1a1a` — Body text.

### Semantic
- **Success**: `#16a34a` — Confirmations, positive indicators.
- **Warning**: `#f59e0b` — Alerts, caution states.
- **Error**: `#dc2626` — Errors, destructive actions.
- **Info**: `#139ed9` — Informational messages (reuses secondary).

## Typography

### Font Family
```
font-family: 'Noto Sans', sans-serif;
```
Import:
```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap');
```

### Scale
| Usage            | Size    | Weight   | Color       |
|------------------|---------|----------|-------------|
| Page title       | 24px    | 700      | `#232c50`   |
| Section heading  | 20px    | 600      | `#232c50`   |
| Card title       | 16px    | 600      | `#232c50`   |
| Body text        | 14px    | 400      | `#1a1a1a`   |
| Small / caption  | 12px    | 400      | `#8a8a8a`   |
| Button label     | 14px    | 500      | `#ffffff`   |

## Corners & Radius

- **Small elements** (badges, chips, tags): `rounded-md` (6px)
- **Buttons, inputs**: `rounded-lg` (8px)
- **Cards, panels**: `rounded-xl` (12px)
- **Modals, dialogs**: `rounded-2xl` (16px)
- **Avatars, icons**: `rounded-full`

## Gradients

Use gradients sparingly to add depth and a modern tech feel.

- **Sidebar / primary gradient**: `bg-gradient-to-b from-[#232c50] to-[#1a2040]`
- **Button accent gradient**: `bg-gradient-to-r from-[#139ed9] to-[#0e7eb0]`
- **Hero / header gradient**: `bg-gradient-to-br from-[#232c50] via-[#2e3a66] to-[#139ed9]`
- **Subtle card highlight**: `bg-gradient-to-br from-white to-[#efeeef]`

## Shadows

- **Card default**: `shadow-sm` — subtle elevation.
- **Card hover**: `shadow-md` — lift on interaction.
- **Dropdown / popover**: `shadow-lg`
- **Modal overlay**: `shadow-2xl`

## Buttons

### Primary (action buttons)
```
bg-gradient-to-r from-[#139ed9] to-[#0e7eb0]
text-white font-medium rounded-lg px-4 py-2
hover:from-[#3db8e8] hover:to-[#139ed9]
active:from-[#0e7eb0] active:to-[#0a6a96]
transition-all duration-150
```

### Secondary (outline)
```
border border-[#139ed9] text-[#139ed9] rounded-lg px-4 py-2
hover:bg-[#139ed9]/10
active:bg-[#139ed9]/20
```

### Destructive
```
bg-[#dc2626] text-white rounded-lg px-4 py-2
hover:bg-[#b91c1c]
```

### Ghost
```
text-[#232c50] rounded-lg px-4 py-2
hover:bg-[#efeeef]
```

## Sidebar

```
bg-gradient-to-b from-[#232c50] to-[#1a2040]
text-white/80
```
- Active item: `bg-white/10 text-white rounded-lg`
- Hover item: `bg-white/5 rounded-lg`
- Section labels: `text-white/50 uppercase text-xs font-semibold tracking-wider`

## Cards

```
bg-white rounded-xl shadow-sm border border-[#efeeef]
hover:shadow-md transition-shadow duration-200
p-5
```

## Tables

- Header: `bg-[#efeeef] text-[#232c50] font-semibold text-sm`
- Row hover: `hover:bg-[#efeeef]/50`
- Borders: `border-b border-[#efeeef]`
- Rounded container: wrap table in `rounded-xl overflow-hidden`

## Forms & Inputs

```
bg-white border border-[#d1d0d1] rounded-lg px-3 py-2 text-sm
focus:border-[#139ed9] focus:ring-2 focus:ring-[#139ed9]/20
placeholder:text-[#8a8a8a]
```

## Badges / Tags

- **Default**: `bg-[#efeeef] text-[#232c50] rounded-md px-2 py-0.5 text-xs font-medium`
- **Info**: `bg-[#139ed9]/10 text-[#139ed9]`
- **Success**: `bg-[#16a34a]/10 text-[#16a34a]`
- **Warning**: `bg-[#f59e0b]/10 text-[#f59e0b]`
- **Error**: `bg-[#dc2626]/10 text-[#dc2626]`

## Spacing

Follow Tailwind's 4px base scale. Common patterns:
- Page padding: `p-6`
- Card padding: `p-5`
- Section gap: `gap-6`
- Element gap: `gap-3`
- Compact list gap: `gap-2`

## Transitions

All interactive elements should include:
```
transition-all duration-150 ease-in-out
```

## Design Principles

1. **Professional first** — Clean layouts, generous whitespace, muted backgrounds. The app handles financial/business data and must feel trustworthy.
2. **Tech-forward accents** — Gradients, rounded corners, and the secondary blue bring a modern, digital feel without being playful.
3. **Clarity over decoration** — Every visual element serves a purpose. Avoid ornamental graphics.
4. **Consistent density** — Use compact spacing for data-heavy views (tables, lists) and generous spacing for dashboards and forms.
5. **Accessible contrast** — Ensure text meets WCAG AA contrast ratios against its background.
