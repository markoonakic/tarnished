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
│ Layer │  Color   │                 Usage                 │
├───────┼──────────┼───────────────────────────────────────┤
│ bg0   │ Darkest  │ Page background                      │
├───────┼──────────┼───────────────────────────────────────┤
│ bg1   │ Dark     │ Base containers (cards, content)      │
├───────┼──────────┼───────────────────────────────────────┤
│ bg2   │ Medium   │ Hover states, nested containers       │
├───────┼──────────┼───────────────────────────────────────┤
│ bg3   │ Light    │ Input backgrounds (on bg2 containers) │
├───────┼──────────┴───────────────────────────────────────┤
│ bg4   │ Lightest │ Modal backgrounds                     │
└───────┴───────────────────────────────────────────────────┘

**Layering rule:** Always step one layer lighter for nested/hover states.

### CSS Custom Properties (Required)

**ALL colors must use CSS variables.** Never hardcode color values.

**Correct:**
```tsx
className="text-fg1 bg-bg1"
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

| Variant | Base State | Hover State | Usage |
|---------|---------------|-------------|-------|
| **Primary** | `bg-aqua text-bg0` | `hover:bg-aqua-bright` | Save, Add, Create, Sign In, Submit |
| **Neutral** | `bg-transparent text-fg1` | `hover:bg-bg2 hover:text-fg0` | Cancel, Edit, Skip |
| **Danger** | `bg-transparent text-red` | `hover:bg-bg2 hover:text-red-bright` | Delete buttons (ALL variants) |
| **Icon-only** | `px-3 py-1.5` transparent | `hover:bg-bg2` | Edit, Delete icon buttons |

### Standard Button Pattern

```tsx
// Primary button
<button className="bg-aqua text-bg0 hover:bg-aqua-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md">
  Save
</button>

// Secondary button
<button className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md">
  Cancel
</button>

// Danger button (regular)
<button className="bg-transparent text-red hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md">
  Delete
</button>

// Danger button (icon-only)
<button className="px-3 py-1.5 rounded bg-transparent text-red hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out cursor-pointer">
  <i className="bi-trash" />
</button>

// Icon-only button (neutral)
<button className="px-3 py-1.5 rounded bg-transparent text-fg1 hover:bg-bg2 transition-all duration-200 ease-in-out cursor-pointer">
  <i className="bi-pencil" />
</button>
```

### Button Sizing

- Regular: `px-4 py-2`
- Small: `px-3 py-1.5`
- Icon-only: `px-3 py-1.5` (asymmetric for square proportions)

### Transition Standard

**ALL buttons use:** `transition-all duration-200 ease-in-out`

---

## Navigation Buttons

Navigation elements use `transition-transform` only (no background color transition):

```tsx
className="transition-transform duration-200 ease-in-out hover:scale-110"
```

---

## Form Inputs

### Input Background Layering (5-Color Palette)

Inputs must use the **next color in line** from their container's background. This creates proper visual hierarchy and ensures inputs are visible.

**Gruvbox background palette:**
- `bg0` (282828) → `bg1` (3c3836) → `bg2` (504945) → `bg3` (665c54) → `bg4` (7c6f64)

**Layering rule:** Always use the next darker background color for inputs.

```tsx
// On bg-bg0 container: input bg-bg1
<div className="bg-bg0">
  <input className="border border-tertiary bg-bg1 text-fg1 focus:border-aqua-bright ..." />
</div>

// On bg-bg1 container: input bg-bg2
<div className="bg-bg1">
  <input className="border border-tertiary bg-bg2 text-fg1 focus:border-aqua-bright ..." />
</div>

// On bg-bg2 container: input bg-bg3
<div className="bg-bg2">
  <input className="border border-tertiary bg-bg3 text-fg1 focus:border-aqua-bright ..." />
</div>
```

**Why:** Inputs with the same background as their container are invisible. The next-color rule ensures inputs stand out while maintaining the theme's layered aesthetic.

### Standard Input Pattern

```tsx
<input
  type="text"
  className="border border-tertiary bg-bg2 text-fg1 focus:border-aqua-bright focus:outline-none transition-all duration-200 ease-in-out rounded-md px-3 py-2"
/>
```

**Key elements:**
- `border border-tertiary` — Default border color
- `bg-bg2` (or next color in line from container) — Background color using layering rule
- `text-fg1` — Text color
- `focus:border-aqua-bright` — Aqua-bright border on focus
- `focus:outline-none` — Remove default outline
- `transition-all duration-200 ease-in-out` — Smooth transition

---

## Badge Colors

### Status Badge Colors

```tsx
const statusColors = {
  applied: 'bg-[var(--color-green)]/20 text-[var(--color-green)]',
  interview: 'bg-[var(--color-blue)]/20 text-[var(--color-blue)]',
  offer: 'bg-[var(--color-aqua)]/20 text-[var(--color-aqua)]',
  rejected: 'bg-[var(--color-red)]/20 text-[var(--color-red)]',
  withdrew: 'bg-[var(--color-yellow)]/20 text-[var(--color-yellow)]',
  pending: 'bg-[var(--color-orange)]/20 text-[var(--color-orange)]',
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

```tsx
// Icon-only buttons (taller icons = more horizontal padding)
<button className="px-3 py-1.5 rounded bg-transparent text-fg1 hover:bg-bg2 transition-all duration-200 ease-in-out cursor-pointer">
  <i className="bi-pencil" />
</button>
```

**Key pattern:** `px-3 py-1.5` (more X, less Y = square-ish appearance)

This applies to edit/delete icon buttons on cards, modals, and any icon-only action button.

---

## Container Borders (Visual Hierarchy)

### Rule: No Borders on Base Containers

**Base containers should NOT have borders.** Separation is achieved through color layering only.

**Main background:** `bg0` (282828)
**First-level containers:** `bg1` (3c3836) — **NO border**
**Nested containers:** Next color in line — **NO border**
**Tables:** **NO border**

```tsx
// Correct: Base container without border
<div className="bg-secondary rounded-lg p-6">
  {/* Content */}
</div>

// Incorrect: Base container with border
<div className="bg-secondary border border-tertiary rounded-lg p-6">
  {/* Content */}
</div>
```

**When to use borders:**
- Input fields (for focus states)
- Modal containers (for emphasis)
- Dividers/separators (using `border-t` or `border-b`)

**Separation principle:** Use color layering (bg0 → bg1 → bg2 → bg3) to create visual hierarchy, not borders.

---

## Theme Dropdown

### Standard Theme Dropdown Pattern

Theme dropdowns use a consistent layering pattern for visual clarity:

```tsx
// Dropdown container
<div className="bg-bg1 border border-tertiary rounded-lg">
  {/* Dropdown content */}
</div>

// Selected theme option
<button className="bg-bg2 text-fg1 hover:bg-bg3">
  Gruvbox Dark <i className="bi-check-lg" />
</button>

// Unselected theme options
<button className="bg-transparent text-fg1 hover:bg-bg3">
  Gruvbox Light
</button>
```

**Pattern:**
- Container: `bg-bg1 border border-tertiary`
- Selected: `bg-bg2`
- Unselected: `bg-transparent`
- Hover (both): `hover:bg-bg3`

---

## Action Verbs (Button Text)

Use consistent terminology:

| Action | Verb | Example |
|--------|------|---------|
| Open form | **New** | "New Application" |
| Add to existing | **Add** | "Add Round" |
| Create standalone | **Create** | "Create User" |
| Modify existing | **Edit** | "Edit Application" |
| Persist changes | **Save** | Form save button |
| Abort action | **Cancel** | Form cancel button |
| Destroy permanently | **Delete** | Delete buttons (NEVER "Remove") |
| Bring data in | **Import** | "Import Data" |
| Send data out | **Export** | "Export JSON" |

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

Modal content containers use **bg-bg4** (lightest layer) — this ensures modals stand out from the page background:

```tsx
{/* Modal backdrop/overlay */}
<div className="fixed inset-0 bg-bg4/90 backdrop-blur-sm z-50">
  {/* Modal content container */}
  <div className="bg-bg4 rounded-lg p-6 max-w-md mx-4">
    {/* Modal content */}
  </div>
</div>
```

**Key pattern:**
- Modal overlay: `bg-bg4/90` (90% opacity for backdrop blur)
- Modal content: `bg-bg4` (solid lightest layer)
- Close buttons: `px-3 py-1.5` (icon-only proportions)
- NO borders on modal containers (color-only separation)

### Cards

Application cards and similar use **no borders** — color-only separation:

```tsx
<div className="bg-secondary rounded-lg p-4">
  {/* Card content */}
</div>
```

**Rule:** Base containers should NOT have borders. See "Container Borders" section above.

---

## TypeScript Patterns

### Component Props

Use TypeScript interfaces for component props:

```tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger' | 'icon-only';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}
```

### Data Types

Import types from the lib directory:
```tsx
import type { Application, Status, Round } from '@/lib/types';
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
import { useState, useEffect } from 'react';

// 2. Third-party imports
import { clsx } from 'clsx';

// 3. Local imports
import { Button } from '@/components/Button';
import { api } from '@/lib/api';
import type { Application } from '@/lib/types';
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
bg2 → Hover states, nested containers
bg3 → Input backgrounds (on bg2 containers)
bg4 → Modal backgrounds
```

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
- **Modals:** Use `bg-bg4` for modal content (lightest layer)
- **Badges:** Use `bg-[var(--color-*)]/20 text-[var(--color-*)]`
- **Actions:** "Delete" not "Remove"
- **Theme dropdown:** Container `bg-bg1 border border-tertiary`, selected `bg-bg2`, hover `bg-bg3`
