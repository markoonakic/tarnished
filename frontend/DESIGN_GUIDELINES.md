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
| **Neutral**   | `bg-transparent text-fg1` | `hover:bg-bg1` (on bg-bg0), `hover:bg-bg2` (on bg-bg1), `hover:bg-bg3` (on bg-bg2), `hover:bg-bg4` (on bg-bg3), `hover:bg-bg0` (on bg-bg4) | `hover:text-fg0` | Cancel, Edit, Skip |
| **Danger**    | `bg-transparent text-red` | `hover:bg-bg1` (on bg-bg0), `hover:bg-bg2` (on bg-bg1), `hover:bg-bg3` (on bg-bg2), `hover:bg-bg4` (on bg-bg3), `hover:bg-bg0` (on bg-bg4) | `hover:text-red-bright` | Delete buttons (ALL variants) |
| **Icon-only** | `px-2 py-1` transparent   | `hover:bg-bg1` (on bg-bg0), `hover:bg-bg2` (on bg-bg1), `hover:bg-bg3` (on bg-bg2), `hover:bg-bg4` (on bg-bg3), `hover:bg-bg0` (on bg-bg4) | Edit, Delete icon buttons (text color depends on type) |

### Button Hover Background Rule (5-Layer Rule)

Buttons use the **next darker color** from their container's background for hover states. This ensures visible hover states across all contexts.

**Container → Button hover mapping:**
- Container `bg-bg0` → Button hover `hover:bg-bg1`
- Container `bg-bg1` → Button hover `hover:bg-bg2`
- Container `bg-bg2` → Button hover `hover:bg-bg3`
- Container `bg-bg3` → Button hover `hover:bg-bg4`
- Container `bg-bg4` → Button hover `hover:bg-bg0` (wrap around)

**Why:** Buttons with the same hover background as their container are invisible. The next-color rule ensures hover states are always visible while maintaining the theme's layered aesthetic.

### Button Sizing

- Regular: `px-4 py-2`
- Small: `px-3 py-1.5`
- Icon-only: `px-2 py-1` (smaller padding for proportional hover area)

### Cursor Pointer

**ALL interactive elements must have `cursor-pointer` class:**
- `<button>` elements
- `<a>` elements (links)
- Elements with `onClick` handlers
- `<label>` elements wrapping clickable inputs

This ensures users get proper visual feedback for all interactive UI elements.

### Transition Standard

**ALL buttons use:** `transition-all duration-200 ease-in-out`

---

## Navigation Buttons

Navigation elements use `transition-transform` only (no background color transition):

### Navigation Link Exception

Navigation links (to other pages) use `transition-colors duration-100 ease-in-out` (2x faster than standard) for snappier feel on page navigation.
This exception applies only to Link components that navigate between pages.

All other interactive elements (buttons, badges, inputs, hover effects) use the standard `transition-all duration-200 ease-in-out`.

## Form Inputs

### Input Background Layering (5-Color Palette)

Inputs must use the **next color in line** from their container's background. This creates proper visual hierarchy and ensures inputs are visible.

**Gruvbox background palette:**

- `bg0` (282828) → `bg1` (3c3836) → `bg2` (504945) → `bg3` (665c54) → `bg4` (7c6f64)

**Layering rule:** Always use the next darker background color for inputs (same as with button hover bg)

**Why:** Inputs with the same background as their container are invisible. The next-color rule ensures inputs stand out while maintaining the theme's layered aesthetic.

**Input borders:** Inputs have NO default border. The border only appears on focus via `focus:border-aqua-bright`. This works in Tailwind without requiring a base `border` class.

**Key elements:**

- `focus:border-aqua-bright` — Aqua-bright border appears on focus only
- `transition-all duration-200 ease-in-out` — Smooth transition
- NO base `border` class — borders only on focus

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

## Dropdowns

**DO NOT use native `<select>` elements.** Always use the universal `Dropdown` component for consistency.

### Component API

**Import:**
```tsx
import { Dropdown } from '@/components/Dropdown';
```

**Props:**
```tsx
interface DropdownProps {
  options: DropdownOption[];  // Array<{ value: string, label: string }>
  value: string;              // Currently selected value
  onChange: (value: string) => void;
  placeholder?: string;       // Default: "Select..."
  disabled?: boolean;         // Default: false
  size?: 'sm' | 'md' | 'lg';  // Default: 'md'
  containerBackground?: 'bg0' | 'bg1' | 'bg2' | 'bg3' | 'bg4';  // Default: 'bg1'
}
```

### 6-Layer Rule for Dropdowns

Dropdowns follow a 6-layer color rule with wrap-around:

**Layer sequence:** `bg0` → `bg1` → `bg2` → `bg3` → `bg4` → `bg-h` → (wrap to `bg0`)

**Container mapping:**
- **Trigger background:** container + 1 layer
- **Selected option:** container + 2 layers
- **Hover option:** container + 3 layers (wraps to bg0 if on bg4, uses bg-h if on bg-h)

**Examples:**

| Container | Trigger | Selected | Hover |
|-----------|---------|----------|-------|
| `bg-bg1`  | `bg-bg2` | `bg-bg3` | `bg-bg4` |
| `bg-bg2`  | `bg-bg3` | `bg-bg4` | `bg-h` |
| `bg-bg4`  | `bg-h` | `bg-bg0` | `bg-bg1` |

The `--bg-h` CSS variable (hard color) extends the palette for contexts beyond bg4:
- Gruvbox Dark: `#928374`
- Gruvbox Light: `#7c6f64`
- Nord: `#5e81ac`
- Dracula: `#44475a`

### Styling

**No default border:** `border-0`
**Border on hover/active:** `hover:border-aqua-bright`, `data-active:border-aqua-bright`

**Active state:** Both trigger border AND dropdown menu border use accent color (`aqua-bright`)

### Icon

- Chevron icon scales proportionally to dropdown size
- Rotates 180deg when open
- Animation: `transition-transform duration-200 ease-in-out`

### Animation

**Menu:** fade + slide down
- `opacity-0` → `opacity-100`
- `translateY-2` → `translateY-0`

**Standard timing:** `transition-all duration-200 ease-in-out`

### Accessibility

**ARIA attributes:**
- `role="combobox"`
- `aria-expanded={isOpen}`
- `aria-selected={selectedValue}`
- `aria-disabled={disabled}`

**Keyboard navigation:**
- `ArrowUp` / `ArrowDown` — Navigate options
- `Enter` / `Space` — Select focused option
- `Escape` — Close dropdown
- `Home` — Focus first option
- `End` — Focus last option

**Behavior:**
- Click outside to close
- Position below trigger (flips up if near bottom edge)
- Controlled component (parent manages state)

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
