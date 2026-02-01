# Frontend Design Guidelines

**Project:** Job Tracker
**Stack:** React 19, TypeScript 5.7, Tailwind CSS 4.1, Vite 7
**Last Updated:** 2026-01-31

---

## Overview

This file defines all frontend design patterns, component standards, and coding conventions. **All AI agents and developers must reference this file before making frontend changes.**

---

## Theme System

### 5-Color Gruvbox Layering Rule (Critical)

All UI elements follow this 5-layer hierarchy:

┌───────┬──────────┬───────────────────────────────────────┐
│ Layer │ Color │ Usage │
├───────┼──────────┼───────────────────────────────────────┤
│ bg0 │ Darkest │ Page background │
├───────┼──────────┼───────────────────────────────────────┤
│ bg1 │ Dark │ Base containers (cards, content) │
├───────┼──────────┼───────────────────────────────────────┤
│ bg2 │ Medium │ nested containers
├───────┼──────────┼───────────────────────────────────────┤
│ bg3 │ Light │ nested containers
├───────┼──────────┼───────────────────────────────────────┤
│ bg4 │ Lightest │ nested containers │
└───────┴──────────┴───────────────────────────────────────┘

**Layering rule:** Always step one layer lighter for nested/hover states.

**Modal Reset Rule:**
Modals reset to bg1 and then follow the 5-layer strategy from there.
This ensures modals stand out from the page while maintaining proper layering.

**Wrap-Around Rule:**
If 5 layers are exceeded in nested contexts, start over from base bg-bg0.
Example: bg0 → bg1 → bg2 → bg3 → bg4 → bg0 → bg1 ...
This prevents running out of colors in deeply nested contexts.

### CSS Custom Properties (Required)

**ALL colors must use CSS variables.** Never hardcode color values.

**Correct:**

```tsx
className = "text-fg1 bg-bg1";
```

**Incorrect:**

```tsx
className="text-[#ebdbb2] bg-[#3c3836]"
style={{ color: '#ebdbb2' }}  // NEVER do this
```

**Available color variables:**

- `--bg0`, `--bg1`, `--bg2`, `--bg3`, `--bg4` — Background layers (darkest to lightest)
- `--fg0`, `--fg1` — Foreground/text (lightest to darker)
- `--aqua`, `--aqua-bright` — Primary accent color
- `--red`, `--red-bright` — Destructive actions
- `--green`, `--green-bright` — Success states
- `--blue`, `--blue-bright` — Informational
- `--orange`, `--orange-bright` — Warning/pending
- `--yellow`, `--yellow-bright` — Withdrew state

### Theme Switching

Themes switch by changing CSS variable values. Using `var(--color-*)` ensures all components update automatically.

---

## Button Variants

### Four Standard Button Patterns

| Variant       | Base State                | Hover State                                                                    | Usage                              |
| ------------- | ------------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| **Primary**   | `bg-aqua text-bg0`        | `hover:bg-aqua-bright`                                                         | Save, Add, Create, Sign In, Submit |
| **Neutral**   | `bg-transparent text-fg1` | `hover:bg based on 5 layer rule hover:text-fg0`                                | Cancel, Edit, Skip                 |
| **Danger**    | `bg-transparent text-red` | `hover:bg based on 5 layer rule hover:text-red-bright`                         | Delete buttons (ALL variants)      |
| **Icon-only** | `px-3 py-1.5` transparent | `hover:bg based on 5 layer rule hover: text dependant of type(edit or delete)` | Edit, Delete icon buttons          |

### Button Sizing

- Regular: `px-4 py-2`
- Small: `px-3 py-1.5`
- Icon-only: `px-3 py-1.5` (asymmetric for square proportions)

### Transition Standard

**ALL buttons use:** `transition-all duration-200 ease-in-out`

---

## Navigation Buttons

Navigation elements use `transition-transform` only (no background color transition):

### Navigation Link Exception

Navigation links (to other pages) use `transition-colors duration-200` (without ease-in-out) for snappier feel on page navigation.
This exception applies only to Link components that navigate between pages.

All other interactive elements (buttons, badges, inputs, hover effects) use the standard `transition-all duration-200 ease-in-out`.

## Form Inputs

### Input Background Layering (5-Color Palette)

Inputs must use the **next color in line** from their container's background. This creates proper visual hierarchy and ensures inputs are visible.

**Gruvbox background palette:**

- `bg0` (282828) → `bg1` (3c3836) → `bg2` (504945) → `bg3` (665c54) → `bg4` (7c6f64)

**Layering rule:** Always use the next darker background color for inputs (same as with button hover bg)

**Why:** Inputs with the same background as their container are invisible. The next-color rule ensures inputs stand out while maintaining the theme's layered aesthetic.

**Key elements:**

- `focus:border-aqua-bright` — Aqua-bright border on focus
- `transition-all duration-200 ease-in-out` — Smooth transition

## Badge Colors

### Status Badge Colors

```tsx
const statusColors = {
  applied: "bg-[var(--color-green)]/20 text-[var(--color-green)]",
  interview: "bg-[var(--color-blue)]/20 text-[var(--color-blue)]",
  offer: "bg-[var(--color-aqua)]/20 text-[var(--color-aqua)]",
  rejected: "bg-[var(--color-red)]/20 text-[var(--color-red)]",
  withdrew: "bg-[var(--color-yellow)]/20 text-[var(--color-yellow)]",
  pending: "bg-[var(--color-orange)]/20 text-[var(--color-orange)]",
};
```

**Use CSS custom properties** so badges update with theme switching.

---

## Spacing & Typography

### Spacing Scale (CSS Variables)

- `--spacing-xs: 0.25rem` (4px)
- `--spacing-sm: 0.5rem` (8px)
- `--spacing-md: 0.75rem` (12px)
- `--spacing-lg: 1rem` (16px)
- `--spacing-xl: 1.5rem` (24px)
- `--spacing-2xl: 2rem` (32px)

### Typography Scale (CSS Variables)

- `--font-h1: 2rem`
- `--font-h2: 1.5rem`
- `--font-h3: 1.25rem`
- `--font-base: 0.875rem`
- `--font-small: 0.75rem`
- `--font-tiny: 0.6875rem`

### Icon Sizing

- Dashboard icons: `text-lg` or `text-xl`
- Status icons: `text-base` or `text-sm`
- Button icons: `w-4 h-4` or `w-5 h-5`

### Icon-Only Button Proportions

Icons are typically taller than wide, so equal padding creates upright rectangles. Use **asymmetric padding** (more horizontal than vertical) for square-like proportions:

**Key pattern:** `px-3 py-1.5` (more X, less Y = square-ish appearance)

This applies to edit/delete icon buttons on cards, modals, and any icon-only action button (but only if the button itself is rectangular as opposed to square-ish)

## Container Borders (Visual Hierarchy)

### Rule: No Borders on Base Containers

**Base containers should NOT have borders.** Separation is achieved through color layering only.

**Main background:** `bg0` (282828)
**First-level containers:** `bg1` (3c3836) — **NO border**
**Nested containers:** Next color in line — **NO border**
**Tables:** **NO border** (only lines that are between elements but the last element should not have a line (since there are no more elements bellow it))

**When to use borders:**

- Input fields (for focus states)
- Dividers/separators (using `border-t` or `border-b`) (remember to make the dividers/semarators follow the 5 layer rule, same as with input fields and button hovers)

**Separation principle:** Use color layering (bg0 → bg1 → bg2 → bg3) to create visual hierarchy, not borders.

---

## Theme Dropdown

### Standard Theme Dropdown Pattern

Theme dropdowns use a consistent layering pattern for visual clarity:

**Pattern:**

- Container: `bg-bg1 border border-tertiary`
- Selected: `bg-bg2`
- Unselected: `bg-transparent`
- Hover (both): `hover:bg-bg3`

---

## Action Verbs (Button Text)

Use consistent terminology:

| Action              | Verb       | Example                         |
| ------------------- | ---------- | ------------------------------- |
| Open form           | **New**    | "New Application"               |
| Add to existing     | **Add**    | "Add Round"                     |
| Create standalone   | **Create** | "Create User"                   |
| Modify existing     | **Edit**   | "Edit Application"              |
| Persist changes     | **Save**   | Form save button                |
| Abort action        | **Cancel** | Form cancel button              |
| Destroy permanently | **Delete** | Delete buttons (NEVER "Remove") |
| Bring data in       | **Import** | "Import Data"                   |
| Send data out       | **Export** | "Export JSON"                   |

**Critical Rule:** Always use "Delete" never "Remove" for destructive actions.

---

## Hover Transitions (All Interactive Elements)

**Standard across entire application:**

- Property: `transition-all`
- Duration: `200ms`
- Timing: `ease-in-out`

Applies to: buttons, badges, navigation, focus states, all hover effects.

---

## Component Patterns

### Modals

Modal content containers use bg1 onwards (modal reset rule) — this ensures modals stand out from the page background:

**Key pattern:**

- Modal overlay: `bg-bg0/80` (80% opacity for dimming)
- Modal content: `bg1` (modal reset rule — 3rd layer from base)
- NO borders on modal containers (color-only separation)

### Cards

Application cards and similar use **no borders** — color-only separation:

**Rule:** Base containers should NOT have borders. See "Container Borders" section above.

---

## TypeScript Patterns

### Component Props

Use TypeScript interfaces for component props:

```tsx
interface ButtonProps {
  variant: "primary" | "secondary" | "danger" | "icon-only";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}
```

### Data Types

Import types from the lib directory:

```tsx
import type { Application, Status, Round } from "@/lib/types";
```

---

## File Naming Conventions

- Components: `PascalCase.tsx` (e.g., `ApplicationCard.tsx`)
- Utilities: `camelCase.ts` (e.g., `apiClient.ts`)
- Types: `types.ts` or `*.types.ts`
- Styles: `*.css` or `*.module.css`

---

## Import Order

```tsx
// 1. React imports
import { useState, useEffect } from "react";

// 2. Third-party imports
import { clsx } from "clsx";

// 3. Local imports
import { Button } from "@/components/Button";
import { api } from "@/lib/api";
import type { Application } from "@/lib/types";
```

---

## When to Update This File

Update this file when:

- New component patterns are established
- Theme variables change
- New button variants or UI patterns are added
- Coding conventions evolve

**This file is the single source of truth.** If code contradicts this file, the code is wrong.

---

**Quick Reference for AI Agents:**

### 5-Layer Rule (Memorize This)

```
bg0 → Page background
bg1 → Base containers (cards, content)
bg2 → Hover states, nested containers, modal content (reset rule)
bg3 → Input backgrounds (on bg2 containers)
bg4 → Nested modal elements
```

**Special Rules:**

- Modal Reset: Modals use bg-bg2 (not bg-bg4) then follow 5-layer from there
- Wrap-Around: If 5 layers exceeded, start over from bg-bg0

### All Patterns

- **Colors:** Always use `--color-*` CSS variables
- **Buttons:** 4 variants (Primary, Neutral, Danger, Icon-only)
  - Icon-only: `px-3 py-1.5` (asymmetric for square proportions)
  - Danger: ALL variants use `bg-transparent text-red hover:bg-bg2 hover:text-red-bright`
- **Transitions:** `transition-all duration-200 ease-in-out`
- **Inputs:** Use 5-color layering (next color in line from container)
  - `bg-bg1` container → `bg-bg2` input
  - `bg-bg2` container → `bg-bg3` input
  - Focus: `focus:border-aqua-bright`
- **Containers:** NO borders on base containers (color-only separation)
- **Modals:** Use `bg-bg1` for modal content (modal reset rule - 2nd layer)
- **Badges:** Use `bg-[var(--color-*)]/20 text-[var(--color-*)]`
- **Actions:** "Delete" not "Remove"
- **Theme dropdown:** Container `bg-bg1 border border-tertiary`, selected `bg-bg2`, hover `bg-bg3`
