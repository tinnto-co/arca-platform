---
name: estudio-contable-design
description: Use this skill to generate well-branded interfaces and assets for Estudio Contable (Arca Dashboard), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

Key files:
- `README.md` — brand context, content fundamentals, visual foundations, iconography.
- `colors_and_type.css` — CSS custom properties for colors, type scale, shadows, radii, spacing.
- `fonts/` — Inter Tight (display), Inter (UI), JetBrains Mono (numeric / mono).
- `assets/` — logos and brand imagery.
- `ui_kits/dashboard/` — click-thru React recreation of the Arca Dashboard / Inicio screen.
- `preview/` — atomic design-system cards (colors, type, components, spacing).

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. Reference `colors_and_type.css` via `<link>` so tokens stay consistent. Prefer Lucide icons (stroke 1.5–2, 24-grid) to match the system's iconography.

If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
