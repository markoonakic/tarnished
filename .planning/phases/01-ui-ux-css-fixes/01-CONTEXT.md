# Phase 1: UI/UX & CSS Fixes - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a consistent design system that fixes visual inconsistencies and prevents future deviations. This includes standardizing buttons, badges, transitions, focus states, and action verbs throughout the application.

This phase does NOT add new capabilities — it fixes existing inconsistencies to make the interface polished and theme-aware.
</domain>

<decisions>
## Implementation Decisions

### Theme System

**All colors must use CSS custom properties for theme switching to work properly.**
- Never hardcode color values (no `#282828`, no `rgb(...)` in component code)
- Always use variables: `--bg0`, `--bg1`, `--fg0`, `--fg1`, `--aqua`, `--aqua-bright`, `--red`, `--red-bright`, etc.
- This ensures theme switcher works consistently across all components

### 5-Color Layering Rule (Critical)

**All containers and nested elements follow the 5-layer Gruvbox palette:**

| Layer | Variable | Usage |
|-------|----------|-------|
| bg0 | Darkest | Page background |
| bg1 | Dark | Base containers (cards, modals) |
| bg2 | Medium | Hover states, nested containers |
| bg3 | Light | Input backgrounds (when on bg2 containers) |
| bg4 | Lightest | Modal overlay/backdrop |

**Key rules:**
- Inputs on bg2 containers use bg3 (one layer lighter)
- Hover states go one layer lighter (bg1 → bg2, bg2 → bg3)
- NO exceptions — everything follows this layering

### No Borders Rule

**Base containers should NOT have borders.**
- Separation through color layering only
- Remove `border-*` from base containers
- Remove `border-b` from table rows
- Theme dropdown is exception: container uses `border-tertiary` for the dropdown menu specifically

### Accent Color System

**Each theme can define its own accent color via CSS variables.**
- Not all themes use the same accent color
- Use semantic variable like `--accent-primary` that maps to the theme's accent
- Currently "aqua" is used as accent, but each theme should be able to define its own

### Button Variants

**Four button variants to standardize:**

| Variant | Default State | Hover State | Usage |
|---------|---------------|-------------|-------|
| **Primary** | `bg-aqua text-bg0` solid | `bg-aqua-bright text-bg0` | Main actions: Save, Add, Create, Sign In, Submit |
| **Neutral** | `bg-transparent text-fg1` no background | `bg-bg2 text-fg0` | Secondary: Cancel, Edit, Skip |
| **Danger** | `bg-transparent text-red` no background | `bg-bg2 text-red-bright` | Destructive: Delete buttons |
| **Icon-only** | Same as Neutral/Danger but `px-3 py-1.5` padding, icons only | Same hover pattern | Close modals, icon actions |

**Padding:** `px-4 py-2` for regular buttons, `px-3 py-1.5` for icon-only (square proportions for taller icons)

**Neutral/Danger buttons are transparent by default** — background appears on hover (bg-bg2 layer)

**Icon-only buttons must use `px-3 py-1.5`** — NOT `p-1`, NOT `p-2` — ensures square proportions for taller icons

### Hover Transitions (All Interactive Elements)

**Standard across entire application:**
- Property: `transition-all`
- Duration: `200ms`
- Timing: `ease-in-out`
- Applies to: buttons, badges, navigation, focus states, all hover effects

This 200ms ease-in-out transition is the "gradual both ways" feel — smooth on hover-in and hover-out.

### Typography Scale

**Already defined as CSS variables — use these:**
- `--font-h1: 2rem`
- `--font-h2: 1.5rem`
- `--font-h3: 1.25rem`
- `--font-base: 0.875rem`
- `--font-small: 0.75rem`
- `--font-tiny: 0.6875rem`

### Spacing Scale

**REM-based system (already defined):**
- `--spacing-xs: 0.25rem` (4px)
- `--spacing-sm: 0.5rem` (8px)
- `--spacing-md: 0.75rem` (12px)
- `--spacing-lg: 1rem` (16px)
- `--spacing-xl: 1.5rem` (24px)
- `--spacing-2xl: 2rem` (32px)

### Badge Colors

**Status colors should map to palette colors and be theme-aware:**
- Applied → Green (`--green` / `--green-bright` for hover)
- Interview → Blue (`--blue` / `--blue-bright`)
- Offer → Aqua (`--aqua` / `--aqua-bright`)
- Rejected → Red (`--red` / `--red-bright`)
- Withdrew → Yellow (`--yellow` / `--yellow-bright`)
- Pending → Orange (`--orange` / `--orange-bright`)

Badges currently use inline styles. Should switch to using CSS color variables so theme switching works.

### Input Focus States

**All text inputs should show aqua-bright border on focus:**
- `focus:border-aqua-bright` with `transition-all duration-200 ease-in-out`
- Input focus is one of the CSS class generation issues (CSS-02) that needs fixing

### Action Verbs (Button Text)

**Standardized verbs for all buttons:**

| Action | Verb | Example Usage |
|--------|------|---------------|
| Open form | **New** | "New Application" |
| Add to existing | **Add** | "Add Round", "Add Status" |
| Create standalone | **Create** | "Create User", "Create Account" |
| Modify existing | **Edit** | All edit buttons |
| Persist changes | **Save** | Form save buttons |
| Abort action | **Cancel** | Form cancel buttons |
| Destroy permanently | **Delete** | All delete buttons (never "Remove") |
| Bring data in | **Import** | "Import Data" |
| Send data out | **Export** | "Export JSON", "Export CSV" |
| Replace file | **Replace** | Document replace action |
| Dismiss prompt | **Skip** | First-time prompt skip |

**Key rule:** Use "Delete" not "Remove" on all action buttons (UIUX-10)

### Theme Dropdown Pattern

**Standard pattern for theme selection dropdowns:**
- Container: `bg-bg1 border-tertiary`
- Selected option: `bg-bg2`
- Hover state: `bg-bg3`
- This is the ONLY place where borders are used on dropdown containers

### Known Fixes Required (Gap List)

The following fixes have been identified and must be implemented:

| Category | Count | What to Fix |
|----------|-------|-------------|
| Button hover colors | 1 | MediaPlayer.tsx: `hover:bg-bg1` → `hover:bg-bg2` |
| Input backgrounds | 9 | RoundForm.tsx: `bg-bg0` → `bg-bg3` (on bg2 containers) |
| Icon-only padding | ~5 | Close buttons: `p-1` → `px-3 py-1.5` |
| Inverted delete/cancel | ~8 | `bg-bg1` → `bg-transparent` |
| Container borders | 8 | Remove `border-*` from base containers |
| Table borders | 4 | Remove `border-b` from table rows |
| Theme system | 1 | Add `--color-` prefix to all theme variants |

**Total: ~36 fixes across ~15 files**

### Claude's Discretion

- Exact loading skeleton design
- Error state handling patterns
- Border radius values (seem consistent already)
- Exact focus ring width/style beyond the color
</decisions>

<specifics>
## Specific Ideas

**5-Color Layering Rule:**
- Strict hierarchy: bg0 (background) → bg1 (containers) → bg2 (hover/nested) → bg3 (inputs) → bg4 (modals)
- Always step one layer lighter for nested/hover states
- Inputs on bg2 containers use bg3
- This layered approach must be maintained across all themes

**No Borders Philosophy:**
- Base containers separate through color, not borders
- Theme dropdown is special case: uses `border-tertiary` for dropdown menu
- Table rows separate through padding and background, not `border-b`

**Theme Dropdown Pattern:**
- Container: `bg-bg1 border-tertiary`
- Selected: `bg-bg2`
- Hover: `bg-bg3`

**Transition philosophy:**
- 200ms ease-in-out is the standard "gradual" feel
- Applies both directions (hover in and hover out)
- Same feel across all interactive elements (buttons, badges, inputs, nav)

**Current primary buttons are solid bg-aqua** — they should stay solid, not become outlined.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope (design system consistency only).
</deferred>

---

*Phase: 01-ui-ux-css-fixes*
*Context gathered: 2026-01-31*
