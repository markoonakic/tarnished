# Frontend Design Guidelines

**Project:** Job Tracker
**Stack:** React 19, TypeScript 5.7, Tailwind CSS 4.1, Vite 7
**Last Updated:** 2026-02-02

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

**Input focus state:** Inputs have NO default border. A 1px ring appears on focus using ring utilities (not border). This ensures no visible indicator when not focused, and a clean focus ring when active.

**Key elements:**

- `focus:ring-1 focus:ring-aqua-bright focus:outline-none` — 1px aqua-bright ring appears on focus only
- `transition-all duration-200 ease-in-out` — Smooth transition
- NO base `border` or `ring` class — ring only on focus
- Ring utilities (box-shadow) are used instead of border to avoid layout shifts

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

### Icon-Only Button Proportions

Icons are typically taller than wide, so equal padding creates upright rectangles. Use **asymmetric padding** (more horizontal than vertical) for square-like proportions:

**Key pattern:** `px-3 py-1.5` (more X, less Y = square-ish appearance)

This applies to edit/delete icon buttons on cards, modals, and any icon-only action button (but only if the button itself is rectangular as opposed to square-ish)

---

## Icons

### Icon Library: Bootstrap Icons

**This project uses Bootstrap Icons exclusively.** Loaded via CDN in `index.html`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
```

**Reference:** https://icons.getbootstrap.com/

### Usage Pattern

All icons use the `<i>` element with `bi-*` classes:

```tsx
<i className="bi-pencil" />
<i className="bi-trash" />
<i className="bi-chevron-down" />
```

### Critical Rules

| Rule | Description |
|------|-------------|
| **NO other icon libraries** | Do NOT import `lucide-react`, `react-icons`, `heroicons`, or any other icon library |
| **Check existing usage first** | Before adding a new icon, search the codebase for similar icons to maintain consistency |
| **Use semantic icon names** | Choose icons that clearly communicate their purpose (e.g., `bi-trash` for delete, not `bi-x`) |

### Icon Sizing

Bootstrap Icons are font-based (rendered in ::before pseudo-element) and require dedicated sizing utilities. The project provides icon sizing utilities that work with Bootstrap Icons.

**Bootstrap Icons ::before Override:**
The CSS rule `.bi::before { font-size: inherit !important; }` in index.css ensures icons inherit font-size from parent, enabling the icon utilities to work correctly.

**Icon Sizing Utilities:**

| Utility | Size | Use Case | Example |
|---------|------|----------|---------|
| `icon-xs` | 12px | Table action buttons, compact inline icons | `<i className="bi-pencil icon-xs" />` |
| `icon-sm` | 14px | Standard action buttons, inline icons | `<i className="bi-eye icon-sm" />` |
| `icon-md` | 16px | Media type indicators, primary actions | `<i className="bi-file-text icon-md" />` |
| `icon-lg` | 18px | Larger icons, dropdown lg size | `<i className="bi-chevron-down icon-lg" />` |
| `icon-xl` | 20px | Modal close buttons, dashboard icons | `<i className="bi-x-lg icon-xl" />` |
| `icon-2xl` | 48px | Empty state decorative icons | `<i className="bi-search icon-2xl" />` |

**Critical Rules:**
- ALWAYS use icon utilities (.icon-*) for Bootstrap Icons
- NEVER use Tailwind text-* utilities (text-xs, text-sm, etc.) - they don't work with Bootstrap Icons
- NEVER use explicit width/height (w-[14px] h-[14px]) - use icon utilities instead
- All icon utilities include `line-height: 1` for proper vertical alignment

**Usage Examples:**
```tsx
// Table action button (compact)
<button><i className="bi-pencil icon-xs" /></button>

// Standard action button
<button><i className="bi-trash icon-sm" /></button>

// Modal close button
<button><i className="bi-x-lg icon-xl" /></button>

// Empty state decorative icon
<i className="bi-inbox icon-2xl text-muted mb-4" />

// Dropdown icons (scale with dropdown size)
// xs -> icon-xs, sm -> icon-sm, md -> icon-md, lg -> icon-lg
```

### Color

Icons inherit color from parent or use explicit color classes:

```tsx
<i className="bi-pencil text-fg1" />           // Default text color
<i className="bi-trash text-red" />             // Red (destructive)
<i className="bi-star text-aqua-bright" />      // Accent color
```

### Common Icons

| Action | Icon | Usage |
|--------|------|-------|
| Edit | `bi-pencil` | Edit buttons |
| Delete | `bi-trash` | Delete buttons |
| Close/X | `bi-x-lg` | Modal close, dismiss |
| Plus/Add | `bi-plus-circle` | Add new items |
| Upload | `bi-upload` | File upload |
| Download | `bi-download` | Export/download |
| Eye/View | `bi-eye` | Preview |
| Search | `bi-search` | Search inputs |
| Inbox/Empty | `bi-inbox` | Empty state |
| Chevron Down | `bi-chevron-down` | Dropdown indicators |
| Chevron Right | `bi-chevron-right` | Expand/collapse |
| File | `bi-file-text` | Documents |
| Check | `bi-check-circle` | Success states |
| Refresh | `bi-arrow-repeat` | Replace/update |

### Rotations & Transforms

Icons can be rotated using Tailwind transform classes:

```tsx
<i className="bi-chevron-down transition-transform duration-200 ease-in-out" />
// With rotation state:
<i className={`bi-chevron-down transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
```

### Spacing with Icons

When icons are paired with text, add gap for proper spacing:

```tsx
<div className="flex items-center gap-2">
  <i className="bi-pencil" />
  <span>Edit</span>
</div>
```

---

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
  size?: 'xs' | 'sm' | 'md' | 'lg';  // Default: 'md'
  containerBackground?: 'bg0' | 'bg1' | 'bg2' | 'bg3' | 'bg4';  // Default: 'bg1'
}
```

### 6-Layer Rule for Dropdowns

Dropdowns follow a 6-layer color rule with wrap-around:

**Layer sequence:** `bg0` → `bg1` → `bg2` → `bg3` → `bg4` → `bg-h` → (wrap to `bg0`)

**Container mapping:**
- **Non-selected option:** container + 1 layer (base state)
- **Selected option:** container + 2 layers
- **Hover option:** container + 3 layers (wraps to bg0 if on bg4, uses bg-h if on bg-h)

**Examples:**

| Container | Non-Selected | Selected | Hover |
|-----------|-------------|----------|-------|
| `bg-bg1`  | `bg-bg2` | `bg-bg3` | `bg-bg4` |
| `bg-bg2`  | `bg-bg3` | `bg-bg4` | `bg-h` |
| `bg-bg4`  | `bg-bg-h` | `bg-bg0` | `bg-bg1` |

The `--bg-h` CSS variable (hard color) extends the palette for contexts beyond bg4:
- Gruvbox Dark: `#928374`
- Gruvbox Light: `#7c6f64`
- Nord: `#5e81ac`
- Dracula: `#44475a`

### Sizing

Dropdowns come in 4 sizes for different contexts:

| Size | Padding | Text | Use Case |
|------|---------|------|----------|
| `xs` | `px-3 py-2` | `text-sm` | Match standard input height (use when dropdown appears next to input with `px-3 py-2`) |
| `sm` | `px-3 py-1.5` | `text-sm` | Compact layouts, tight spaces |
| `md` | `px-4 py-2` | `text-base` | Default, most dropdowns |
| `lg` | `px-5 py-2.5` | `text-lg` | Emphasis, prominent selectors |

**Sizing Guidelines:**
- When a dropdown appears **next to an input field**, use `size="xs"` to match standard input padding (`px-3 py-2`)
- In **form layouts**, use `size="sm"` or `size="md"` depending on available space
- For **standalone dropdowns** (not paired with other elements), use default `size="md"`
- **Checkmark and chevron icons** automatically scale proportionally with dropdown size

**Example - Dropdown next to input:**
```tsx
<div className="flex gap-4">
  <input className="px-3 py-2 ..." /> {/* Standard input padding */}
  <Dropdown size="xs" ... />          {/* Matches input height */}
</div>
```

### Styling

**No default border:** `border-0`
**Border on hover/active:** `hover:border-aqua-bright`, `data-active:border-aqua-bright`

**Active state:** Both trigger border AND dropdown menu border use accent color (`aqua-bright`)

**Focus Ring:**
Dropdown triggers use input-like focus ring behavior:
- `focus:ring-1 focus:ring-aqua-bright focus:outline-none` — 1px aqua-bright ring on focus
- Menu container: `ring-1 ring-aqua-bright` when `isOpen=true`
- This matches input focus patterns for consistent UI feedback

**Checkmark Icon:**
Selected state uses Bootstrap Icons checkmark:
- Icon: `<i className="bi-check"></i>`
- Default color: `text-green` (#98971a - darker green)
- Hover/focused color: `text-green-bright` (#b8bb26 - lighter green)
- **Scales using icon utilities** (xs=icon-xs, sm=icon-sm, md=icon-md, lg=icon-lg)
- See Icon Sizing section for details on the icon utility system

### Implementation Notes

**Tailwind JIT Compatibility:**
All dropdown classes use **static class strings** for Tailwind JIT compatibility. Dynamic class construction (e.g., `` `hover:${dynamicClass}` ``) does not work because Tailwind cannot evaluate code at build time.

Instead, use **mapping objects** with complete class strings:
```tsx
// ✅ Correct - static mappings
const hoverClasses = {
  bg0: 'hover:bg-bg1',
  bg1: 'hover:bg-bg2',
  bg2: 'hover:bg-bg3',
  bg3: 'hover:bg-bg4',
  bg4: 'hover:bg-bg-h',
} as const;

// ❌ Incorrect - dynamic class won't be compiled
className={`hover:${getLayerClass(container, 3)}`}
```

This pattern ensures all classes are generated by Tailwind's JIT compiler while maintaining flexibility for different container backgrounds.

### Icon

**Bootstrap Icons Sizing:**
Bootstrap Icons (`bi-*` classes) are font-based and rendered in the `::before` pseudo-element. Use the dedicated icon sizing utilities:

```tsx
// ❌ Incorrect - text utilities don't work with ::before pseudo-element
<i className="bi-check text-sm"></i>

// ❌ Incorrect - explicit width/height is inconsistent
<i className="bi-check w-[14px] h-[14px]"></i>

// ✅ Correct - use icon sizing utilities
<i className="bi-check icon-sm"></i>    // 14px
<i className="bi-check icon-md"></i>    // 16px
<i className="bi-check icon-xl"></i>    // 20px
```

**How it works:** The `.bi::before { font-size: inherit !important; }` override in index.css ensures the ::before pseudo-element inherits font-size from the parent, enabling the icon utilities to work correctly.

**Dropdown icon sizing:** Uses icon utilities (xs=icon-xs, sm=icon-sm, md=icon-md, lg=icon-lg)

See Icon Sizing section above for the complete utility table and use cases.

- **Chevron icon** rotates 180deg when open
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

## Separators

### 5-Layer Contrast Rule

Separators follow a contrast-based 5-layer rule that varies based on container background.

**Separator mapping table:**

| Container Background | Separator Color | CSS Class    | Hex Value   |
|---------------------|-----------------|--------------|-------------|
| bg-bg0 (#282828)    | Subtle          | border-tertiary / border-fg4 | #a89984 |
| bg-bg1 (#3c3836)    | Subtle          | border-tertiary / border-fg4 | #a89984 |
| bg-bg2 (#504945)    | Medium          | border-fg3   | #bdae93     |
| bg-bg3 (#665c54)    | Visible         | border-fg2   | #d5c4a1     |
| bg-bg4 (#7c6f64)    | Prominent       | border-fg1   | #ebdba2     |

**Key principle:** Separator color should provide sufficient contrast against the container background while remaining subtle.

**Separator pattern:** Use `border-t`, `border-b`, `border-r` utilities (NOT divide-y/divide-x). Border utilities are appropriate for individual element borders.

**Examples:**
- Table rows: `border-b border-tertiary` (with conditional "no border on last row")
- Form sections: `border-t border-tertiary` for section dividers
- Navigation: `border-b border-tertiary` or `border-r border-tertiary` as appropriate
- Cards: No borders on base containers, use internal `border-tertiary` for separation

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

### Interview Rounds

Interview round cards (RoundCard component) follow the 5-layer rule based on nesting context.

**Nesting context:**
- Page background: `bg-bg0`
- Parent container (ApplicationDetail): `bg-bg1`
- RoundCard base container: `bg-bg2` (next darker from parent)
- Interior elements (media items, transcript items): `bg-bg3` (next darker from RoundCard)

**Separators:**
- Internal section separators use `border-tertiary`
- No borders on RoundCard base container (color-only separation per 5-layer rule)

**Example:**
```tsx
// RoundCard base (nested in bg-bg1 container)
<div className="bg-bg2 rounded-lg p-4">
  {/* Interior elements use bg-bg3 */}
  <div className="bg-bg3 rounded px-3 py-2">
    {/* Content */}
  </div>
  {/* Separators use border-tertiary */}
  <div className="border-t border-tertiary pt-3">
    {/* Content */}
  </div>
</div>
```

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
- **Icons:** Bootstrap Icons only — `<i className="bi-*" />` — NO other icon libraries
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
- **Separators:** 5-layer contrast rule based on container background (see Separators section)
- **Dropdown focus ring:** `focus:ring-1 focus:ring-aqua-bright` on trigger, menu ring when open
- **Dropdown checkmark:** Bootstrap Icons `bi-check` with `text-green` (default) / `text-green-bright` (hover)
- **RoundCard:** `bg-bg2` base, `bg-bg3` interior, `border-tertiary` separators
