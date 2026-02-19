# Frontend Design Guidelines

**Project:** Tarnished
**Stack:** React 19, TypeScript 5.7, Tailwind CSS 4.1, Vite 7
**Last Updated:** 2026-02-17

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
│ bg-bg0 │ Darkest │ Page background │
├───────┼──────────┼───────────────────────────────────────┤
│ bg-bg1 │ Dark │ Base containers (cards, content) │
├───────┼──────────┼───────────────────────────────────────┤
│ bg-bg2 │ Medium │ nested containers
├───────┼──────────┼───────────────────────────────────────┤
│ bg-bg3 │ Light │ nested containers
├───────┼──────────┼───────────────────────────────────────┤
│ bg-bg4 │ Lightest │ nested containers │
└───────┴──────────┴───────────────────────────────────────┘

**Layering rule:** Always step one layer lighter for nested/hover states.

**Modal Reset Rule:**
Modals reset to `bg-bg1` and then follow the 5-layer strategy from there.
This ensures modals stand out from the page while maintaining proper layering.

**Wrap-Around Rule:**
If 5 layers are exceeded in nested contexts, start over from base `bg-bg0`.
Example: `bg-bg0` → `bg-bg1` → `bg-bg2` → `bg-bg3` → `bg-bg4` → `bg-bg0` → `bg-bg1` ...
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
- `--accent`, `--accent-bright` — Primary accent color
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

| Variant       | Base State                | Hover State                                                                    | Default Size | Usage                              |
| ------------- | ------------------------- | ------------------------------------------------------------------------------ | ------------ | ---------------------------------- |
| **Primary**   | `bg-accent text-bg0`      | `hover:bg-accent-bright`                                                       | `px-4 py-2`  | Save, Add, Create, Sign In, Submit |
| **Neutral**   | `bg-transparent text-fg1` | Follows 5-layer hover rule                                                     | `px-4 py-2`  | Cancel, Edit, Skip |
| **Danger**    | `bg-transparent text-red` | Follows 5-layer hover rule + `hover:text-red-bright`                           | `px-4 py-2`  | Delete buttons (ALL variants) |
| **Icon-only** | `p-2` transparent         | Follows 5-layer hover rule                                                     | `p-2`        | Edit, Delete icon buttons (text color depends on type) |

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
- Icon-only: `p-2` (equal padding creates ~32x32px square touch target for consistent hover feedback)

### Icon-Only Buttons

All icon-only buttons (X close, pencil edit, trashcan delete without text) MUST use `p-2` for a square 32x32px hover area. This ensures consistent touch targets and visible hover feedback. While icons aren't perfectly square, equal padding creates a consistent experience.

### Delete Button Centering

When a delete button sits alongside variable-height content (e.g., badges + timestamp + note), use `self-center` to vertically center the button. This creates better visual balance than `flex-shrink-0` alone.

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

## Navigation Links

Navigation links use the standard `transition-all duration-200 ease-in-out` for consistency with all other interactive elements.

## Form Inputs

### Input Background Layering (5-Color Palette)

Inputs must use the **next color in line** from their container's background. This creates proper visual hierarchy and ensures inputs are visible.

**Gruvbox background palette:**

- `bg0` (282828) → `bg1` (3c3836) → `bg2` (504945) → `bg3` (665c54) → `bg4` (7c6f64)

**Layering rule:** Always use the next darker background color for inputs (same as with button hover bg)

**Why:** Inputs with the same background as their container are invisible. The next-color rule ensures inputs stand out while maintaining the theme's layered aesthetic.

**Input focus state:** Inputs have NO default border. A ring appears on focus using ring utilities (not border). This ensures no visible indicator when not focused, and a clean focus ring when active.

**Key elements:**

- `focus:ring-1 focus:ring-accent-bright focus:outline-none` — accent-bright ring appears on focus only
- `transition-all duration-200 ease-in-out` — Smooth transition
- NO base `border` or `ring` class — ring only on focus
- Ring utilities (box-shadow) are used instead of border to avoid layout shifts

## Badge Colors

### Status Badge Colors

```tsx
const statusColors = {
  applied: "bg-[var(--color-green)]/20 text-[var(--color-green)]",
  interview: "bg-[var(--color-blue)]/20 text-[var(--color-blue)]",
  offer: "bg-[var(--color-accent)]/20 text-[var(--color-accent)]",
  rejected: "bg-[var(--color-red)]/20 text-[var(--color-red)]",
  withdrew: "bg-[var(--color-yellow)]/20 text-[var(--color-yellow)]",
  pending: "bg-[var(--color-orange)]/20 text-[var(--color-orange)]",
};
```

**Use CSS custom properties** so badges update with theme switching.

---

## Spacing & Typography

**All sizes use rem units.** Exception: 1px borders (sub-pixel borders look broken).

### Spacing Scale (CSS Variables)

- `--spacing-xs: 0.25rem`
- `--spacing-sm: 0.5rem`
- `--spacing-md: 0.75rem`
- `--spacing-lg: 1rem`
- `--spacing-xl: 1.5rem`
- `--spacing-2xl: 2rem`

### Typography Scale (CSS Variables)

- `--font-h1: 2rem`
- `--font-h2: 1.5rem`
- `--font-h3: 1.25rem`
- `--font-base: 0.875rem`
- `--font-small: 0.75rem`
- `--font-tiny: 0.6875rem`

### Icon-Only Button Proportions

Icon-only buttons use equal padding (`p-2`) for square touch targets. For buttons with both icon and text, use asymmetric padding (`px-3 py-1.5`).

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
| `icon-xs` | 0.75rem | Table action buttons, compact inline icons | `<i className="bi-pencil icon-xs" />` |
| `icon-sm` | 0.875rem | Standard action buttons, inline icons | `<i className="bi-eye icon-sm" />` |
| `icon-md` | 1rem | Media type indicators, primary actions | `<i className="bi-file-text icon-md" />` |
| `icon-lg` | 1.125rem | Larger icons, dropdown lg size | `<i className="bi-chevron-down icon-lg" />` |
| `icon-xl` | 1.25rem | Modal close buttons, dashboard icons | `<i className="bi-x-lg icon-xl" />` |
| `icon-2xl` | 3rem | Empty state decorative icons | `<i className="bi-search icon-2xl" />` |

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
<i className="bi-star text-accent-bright" />    // Accent color
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

**Main background:** `bg-bg0`
**First-level containers:** `bg-bg1` — **NO border**
**Nested containers:** Next color in line — **NO border**

### Table Borders

Tables have **no outer border** on the table container. Internal row separators use `border-b border-tertiary` on each row except the last.

**Table header separator:** Add a separator between the page/section header and the table content using `border-b border-tertiary` on the header element.

**When to use borders:**

- Input fields (for focus states)
- Dividers/separators (using `border-t` or `border-b`) - follow the 5-layer separator rule based on container background
- Table row separators (`border-b border-tertiary`)
- Table header separators (`border-b border-tertiary` on header)

**Separation principle:** Use color layering (`bg-bg0` → `bg-bg1` → `bg-bg2` → `bg-bg3`) to create visual hierarchy for containers, not borders.

---

## Tables

All data tables follow a consistent pattern for display, filtering, and pagination.

### Filter Bar

All table pages include a standardized filter bar above the table:

**Container:**
```tsx
<div className="bg-bg1 rounded-lg p-4 mb-6">
  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
    {/* Search */}
    {/* Filters */}
  </div>
</div>
```

**Search Input:**
- Left-aligned with `bi-search` icon
- Clear button (`bi-x`) appears when search has content
- Full-width on mobile, flexible width on desktop

```tsx
<div className="flex-1 min-w-0 relative">
  <i className="bi-search absolute left-3 top-1/2 -translate-y-1/2 icon-sm text-muted" />
  <input
    type="text"
    placeholder="Search..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="w-full pl-9 pr-9 py-2 bg-bg2 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
  />
  {search && (
    <button
      onClick={() => setSearch('')}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg1 transition-all duration-200 ease-in-out cursor-pointer"
      aria-label="Clear search"
    >
      <i className="bi-x icon-sm" />
    </button>
  )}
</div>
```

**Filters:**
- Use Dropdown component (NOT native select)
- Size: `xs` to match input height
- `containerBackground="bg1"` (filter bar is bg-bg1)
- No labels - placeholder text provides sufficient context

**Per-Page Selector:**
- Always visible (even with few items)
- Positioned at end of filter row
- Options: 10, 25, 50, 100 per page

```tsx
<Dropdown
  options={[
    { value: '10', label: '10 / page' },
    { value: '25', label: '25 / page' },
    { value: '50', label: '50 / page' },
    { value: '100', label: '100 / page' },
  ]}
  value={String(perPage)}
  onChange={(value) => setPerPage(Number(value))}
  placeholder="25 / page"
  size="xs"
  containerBackground="bg1"
/>
```

### Pagination Pattern

**All tables use traditional pagination** (not infinite scroll or "load more"):

- **Format:** `« Prev 1 2 3 ... 10 Next »`
- **Position:** Bottom of table
- **URL state:** `?page=2` (shareable, bookmarkable)
- **Page numbers:** Show all when < 7 pages, else truncate: `1 2 3 ... 10`
- **Per-page:** Set via filter bar dropdown (not in pagination component)

### Pagination Styling

Pagination buttons follow the borderless pattern consistent with other UI elements:

**No borders or rings** - Uses background color for visual feedback:

```tsx
// Active page
className="bg-accent text-bg1"

// Inactive pages and prev/next buttons
className="bg-bg2 text-fg1 hover:bg-bg3 focus:bg-bg3"

// Disabled (first page prev / last page next)
className="bg-bg2 text-muted opacity-50 cursor-not-allowed"
```

**Key styling:**
- Button size: `w-8 h-8` (32px square)
- Border radius: `rounded-lg`
- Transition: `transition-all duration-200 ease-in-out`
- Focus visible via background change (`focus:bg-bg3`)

### Info Text

Always show item count: `"Showing 1-25 of 234 items"`
- Position: Left side of pagination row
- Only shows when pagination controls are visible (multi-page results)

### Table Header Separator

Add `border-b border-tertiary` to the `<tr>` inside `<thead>` to separate column headers from data:

```tsx
<thead>
  <tr className="border-b border-tertiary">
    <th className="text-left py-3 px-4 text-xs font-bold text-muted uppercase tracking-wide">Column</th>
    ...
  </tr>
</thead>
```

### Row Separators

Add `border-b border-tertiary` to each data row except the last:

```tsx
<tr className={`transition-colors duration-200 ${index < items.length - 1 ? 'border-b border-tertiary' : ''}`}>
  ...
</tr>
```

### Pagination Component

Use the reusable `Pagination` component for all tables:

**Import:**
```tsx
import Pagination from '@/components/Pagination';
```

**Props:**
```tsx
interface PaginationProps {
  currentPage: number;      // Current page (1-indexed)
  totalPages: number;       // Total number of pages
  perPage: number;          // Items per page (for display calculation)
  totalItems: number;       // Total number of items
  onPageChange: (page: number) => void;
}
```

**Usage:**
```tsx
<Pagination
  currentPage={page}
  totalPages={totalPages}
  perPage={perPage}
  totalItems={total}
  onPageChange={(newPage) => updateParams({ page: String(newPage) })}
/>
```

**Note:** Per-page selection is handled in the filter bar, not the Pagination component.

### Responsive Behavior

Tables use dual layout:
- **Desktop (md+):** Full table with all columns
- **Mobile:** Card layout (hidden table, visible cards)

```tsx
{/* Desktop table */}
<div className="hidden md:block bg-secondary rounded-lg overflow-hidden">
  <table>...</table>
</div>

{/* Mobile cards */}
<div className="md:hidden space-y-3">
  {items.map(item => (
    <div className="bg-secondary rounded-lg p-4">...</div>
  ))}
</div>
```

### Tables Summary

| Table | Endpoint | Default Sort | Notes |
|-------|----------|--------------|-------|
| Applications | `/api/applications` | Newest first | Filter by status |
| Job Leads | `/api/job-leads` | Newest first | Filter by status, source |
| Admin/Users | `/api/admin/users` | Email (A-Z) | Admin only, CRUD operations |

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
**Border on hover/active:** `hover:border-accent-bright`, `data-active:border-accent-bright`

**Active state:** Both trigger border AND dropdown menu border use accent color (`accent-bright`)

**Focus Ring:**
Dropdown triggers use input-like focus ring behavior:
- `focus:ring-1 focus:ring-accent-bright focus:outline-none` — accent-bright ring on focus
- Menu container: `ring-1 ring-accent-bright` when `isOpen=true`
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

### Expanding Panels/Menus Animation

For hamburger menus, accordion panels, and other expanding content, use CSS grid animation:

```tsx
<div
  style={{
    display: 'grid',
    gridTemplateRows: isOpen ? '1fr' : '0fr',
    opacity: isOpen ? 1 : 0,
  }}
  className="transition-all duration-200 ease-in-out"
>
  <div style={{ overflow: 'hidden' }}>
    {content}
  </div>
</div>
```

This provides smooth slide-down animation with fade, consistent across all expandable UI elements.

### Mobile Touch States

Touch devices don't trigger `:hover`. Add `active:` states for touch feedback. Follows 5-layer rule: container bg → hover +1 layer → active +2 layers.

**Mobile Touch State Mapping:**

| Container | Hover | Active |
|-----------|-------|--------|
| `bg-bg0` | `hover:bg-bg1` | `active:bg-bg2` |
| `bg-bg1` | `hover:bg-bg2` | `active:bg-bg3` |
| `bg-bg2` | `hover:bg-bg3` | `active:bg-bg4` |
| `bg-bg3` | `hover:bg-bg4` | `active:bg-bg0` |
| `bg-bg4` | `hover:bg-bg0` | `active:bg-bg1` |

```tsx
// Example: Section card in bg-bg1 container
className="... hover:bg-bg2 active:bg-bg3 ..."
```

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

### Toast Notifications

Toast notifications provide non-blocking feedback for user actions. They appear in the top-right corner and auto-dismiss after 4 seconds.

**Components:**
- `ToastProvider` — Context provider (wrap app with this)
- `ToastContainer` — Renders active toasts (place in app root)
- `useToast()` — Hook to trigger toasts from any component

**Import:**
```tsx
import { useToast } from '@/hooks/useToast';
```

**Usage:**
```tsx
function MyComponent() {
  const toast = useToast();

  async function handleSave() {
    try {
      await saveData();
      toast.success('Saved successfully!');
    } catch {
      toast.error('Failed to save');
    }
  }
}
```

**Toast Types:**

| Type | Icon | Color | Use Case |
|------|------|-------|----------|
| `success` | `bi-check-circle-fill` | `text-green-bright` | Successful actions |
| `error` | `bi-x-circle-fill` | `text-red-bright` | Failed operations |
| `warning` | `bi-exclamation-triangle-fill` | `text-orange-bright` | Caution needed |
| `info` | `bi-info-circle-fill` | `text-blue-bright` | Informational updates |

**Styling:**
- Background: `bg-bg3` (stands out from page)
- Position: Fixed, top-right corner (`fixed top-4 right-4 z-50`)
- Width: `w-80` with `max-w-[calc(100vw-2rem)]` for mobile
- Stack: `flex flex-col gap-2`
- Transition: `transition-all duration-200 ease-in-out`
- No borders: Color-only separation

**App Integration:**
```tsx
// App.tsx
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/ToastContainer';

function App() {
  return (
    <ToastProvider>
      <AppRoutes />
      <ToastContainer />
    </ToastProvider>
  );
}
```

**Critical Rules:**
- Never use browser `alert()` — use `toast.error()` instead
- Toasts should be short, actionable messages (1-2 sentences max)
- Auto-dismiss after 4 seconds (configurable in ToastContext)
- User can manually dismiss with X button

---

### Modals

Modal content containers use `bg-bg1` onwards (modal reset rule) — this ensures modals stand out from the page background:

**Key pattern:**

- Modal overlay: `bg-bg0/80` (80% opacity for dimming)
- Modal content: `bg-bg1` (modal reset rule)
- NO borders on modal containers (color-only separation)

### Form Modals

#### When to Use Modals vs Pages

- **Modals:** Create/edit forms with ≤6 fields, forms that benefit from staying in context
- **Full pages:** Very complex forms, wizards with multiple steps, forms requiring URL sharing

#### Modal Width Guidelines

- `max-w-md`: Forms with ≤3 fields (e.g., CreateUserModal)
- `max-w-2xl`: Forms with 4+ fields, large textareas, or read-only content displays (e.g., ApplicationModal)
- `max-w-4xl`: Media content (video/audio players, e.g., MediaPlayer)

#### Modal Structure (Responsive)

Follow this pattern for all form modals:

1. **Overlay:** `fixed inset-0 bg-bg0/80 flex items-center justify-center z-50`
2. **Content:** `bg-bg1 rounded-lg max-w-{size} w-full mx-4 max-h-[90vh] flex flex-col`
3. **Header:** `flex-shrink-0 flex justify-between items-center p-4 border-b border-tertiary`
4. **Form body:** `overflow-y-auto flex-1 p-6 space-y-4`
5. **Close button:** `p-2` for proper touch target
6. **Footer:**
   - Simple: `flex justify-end gap-3 pt-4 border-t border-tertiary`
   - With delete: `flex flex-col-reverse sm:flex-row justify-between sm:items-center gap-3 pt-4 border-t border-tertiary`

#### Create/Edit Unified Modal Pattern

For forms where create and edit share the same fields:
- Single component with optional `application` prop
- `undefined` = create mode (set defaults)
- `defined` = edit mode (populate fields)

#### Form Field Layout

For wider modals (`max-w-2xl`), use responsive 2-column grid:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <input placeholder="Field 1" />
  <input placeholder="Field 2" />
  <input placeholder="Full Width" className="sm:col-span-2" />
</div>
```

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

## File Inputs

**NEVER use raw `<input type="file">` elements.** They render with browser-default styling.

**Standard pattern:** Use a styled `<label>` wrapping a hidden input:

```tsx
<label className="bg-transparent text-fg1 hover:bg-bg3 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm cursor-pointer w-fit">
  <i className="bi-upload icon-sm"></i>
  Choose file...
  <input type="file" accept=".pdf" onChange={handleFile} className="hidden" />
</label>
```

**Button variant follows container context** — use the 5-layer rule for hover background just like any other button. For primary-styled upload buttons (Add Media, Upload), use the Primary variant.

---

## Date Inputs

Date inputs use browser-native calendar pickers. The picker icon is styled globally in `index.css` with:
- `filter: invert(0.7)` for dark themes (brightens the icon)
- Hover transition: `filter: invert(0.9)` for visual feedback
- Light themes use `filter: none` (native dark icon works)
- `cursor: pointer` on the picker indicator
- `transition: filter 0.2s ease` for smooth hover

---

## Card Hover Lift Animation

For cards with hover lift effects (`hover:-translate-y-0.5`):
- Use `will-change-transform` for GPU acceleration
- Use `transition-[translate,background-color] duration-200 ease-in-out` (NOT `transition-all`) to avoid animating unrelated properties that can cause visual jank
- Always include a background hover per 5-layer rule
- Always include `cursor-pointer`

**Critical: `translate` not `transform`** — Tailwind v4 uses the modern CSS `translate` property (not `transform`) for translate utilities. The transition must target `translate` to animate correctly.

### Grid + Flex Animation Bug (FIREFOX/GECKO)

**Problem:** In Firefox/Gecko browsers, when an animated element is a **direct CSS Grid child** AND contains **flexbox content** inside, the hover translate animation will have a "worm" effect (card stretches then retracts). This is a browser rendering bug where flex layout recalculates asynchronously during translate.

**Solution:** Never use flex inside a direct grid child that has translate animation. Use `inline-block + align-middle` instead:

```tsx
// ❌ WRONG - Flex inside direct grid child causes worm effect in Firefox
<div className="grid grid-cols-3 gap-6">
  <button className="hover:-translate-y-0.5 ...">
    <div className="flex items-center gap-3">
      <i className="bi bi-icon"></i>
      <span>Label</span>
    </div>
  </button>
</div>

// ✅ CORRECT - Use inline-block instead of flex
<div className="grid grid-cols-3 gap-6">
  <button className="bg-bg1 rounded-lg p-4 hover:-translate-y-0.5 hover:bg-bg2 will-change-transform transition-[translate,background-color] duration-200 ease-in-out cursor-pointer text-left">
    <i className="bi bi-icon text-accent icon-xl align-middle"></i>
    <span className="text-fg1 font-medium align-middle ml-3">Label</span>
  </button>
</div>
```

**Why inline-block works:** Inline elements don't trigger the same layout recalculation that flexbox does during translate animations, avoiding the asynchronous repaint that causes the "worm" effect.

---

## Responsive Design

### Mobile-First Breakpoints

All responsive layouts use mobile-first approach with Tailwind breakpoints:

| Token | Width | Target |
|-------|-------|--------|
| (default) | < 40rem | Mobile phones |
| `sm:` | 40rem+ | Large phones / small tablets |
| `md:` | 48rem+ | Tablets |
| `lg:` | 64rem+ | Desktop |

**Rule:** Always write mobile layout first, then add `sm:`, `md:`, `lg:` overrides.

### Standard Patterns

#### Responsive Grids

```tsx
// 3-column on desktop, 2 on tablet, 1 on mobile
grid-cols-1 sm:grid-cols-2 md:grid-cols-3
```

#### Flex Stacking (Header Rows)

For title + actions side-by-side on desktop, stacked on mobile:

```tsx
flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4
```

#### Touch Targets

Minimum 44x44px touch targets on mobile for accessibility:

- **Buttons:** minimum `py-2 px-3`
- **Modal close buttons:** `p-2`
- **Nav links:** `py-3` minimum vertical padding

#### Table-to-Card Pattern

Tables become card layouts on mobile:

```tsx
// Desktop table (hidden on mobile)
<div className="hidden md:block">
  <table>...</table>
</div>

// Mobile cards (hidden on desktop)
<div className="md:hidden space-y-3">
  <div className="bg-bg2 rounded-lg p-4">...</div>
</div>
```

Card style: `bg-bg2 rounded-lg p-4` (follows 5-layer rule)

#### Modal Scroll Pattern

Modals must scroll within viewport on mobile:

```tsx
// Container
<div className="max-h-[90vh] flex flex-col">
  // Header (fixed, doesn't scroll)
  <div className="flex-shrink-0 ...">...</div>
  // Content (scrolls)
  <form className="overflow-y-auto flex-1 ...">...</form>
</div>
```

#### Navigation Pattern

```tsx
// Desktop nav links
<nav className="hidden md:flex ...">...</nav>

// Mobile hamburger button
<button className="md:hidden p-2 ...">
  <i className={`bi-${menuOpen ? 'x-lg' : 'list'}`} />
</button>

// Mobile menu panel
<div className="md:hidden ...">...</div>
```

#### No Fixed Pixel Widths

Never use fixed pixel widths that can exceed mobile viewport:

```tsx
// ❌ Wrong - can overflow on small screens
<div className="min-w-[12.5rem]">

// ✅ Correct - responsive max-width
<div className="min-w-0 sm:min-w-[12.5rem]">
<div className="max-w-[50vw] sm:max-w-[12.5rem]">
```

---

## Settings Page Navigation

The Settings page uses a sidebar + nested routes pattern (GitHub/Linear style) with responsive mobile behavior.

### Desktop Sidebar

Left sidebar with category groups and section links:

```tsx
// Sidebar container - no border, uses background contrast
<aside className="hidden md:block w-72 bg-bg1 py-8 px-3 flex-shrink-0">

// Category nav wrapper - space-y-6 for uniform gaps
<nav className="space-y-6">

// Category heading (truncate prevents overflow, no tracking-wide to keep text narrow)
<h2 className="text-xs font-bold text-muted uppercase px-3 mb-2 truncate">

// Section link wrapper (group enables hover states on children)
<NavLink className="group flex items-center gap-3 px-3 py-2 rounded text-sm ...">

// Section icon - inactive state
<i className="bi-* icon-sm text-muted group-hover:text-accent transition-colors duration-200 ease-in-out" />

// Section icon - active state
<i className="bi-* icon-sm text-accent-bright" />
```

### Mobile Section List

Full-width list of section cards on mobile (no sidebar):

```tsx
// Section card - uses bg-bg1 (Tailwind utility) for proper hover states
<NavLink className="group bg-bg1 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-bg2 active:bg-bg3 transition-all duration-200 ease-in-out">
  <div className="flex items-center gap-3">
    <i className="bi-* icon-md text-muted group-hover:text-accent transition-colors duration-200 ease-in-out" />
    <span className="text-fg1 font-medium">{section.label}</span>
  </div>
  <i className="bi-chevron-right icon-sm text-muted group-hover:text-fg1 transition-colors duration-200 ease-in-out" />
</NavLink>
```

### Mobile Back Link

Section pages on mobile show a back link to return to the section list:

```tsx
<Link
  to="/settings"
  className="text-accent hover:text-accent-bright text-sm flex items-center gap-2 transition-all duration-200 ease-in-out cursor-pointer mb-6"
>
  <i className="bi-chevron-left icon-sm" />
  Back to Settings
</Link>
```

### Routing Architecture

Settings uses nested routes for deep linking:

```tsx
<Route path="/settings" element={<SettingsLayout />}>
  <Route index element={<Navigate to="theme" replace />} />
  <Route path="theme" element={<SettingsTheme />} />
  <Route path="features" element={<SettingsFeatures />} />
  <Route path="statuses" element={<SettingsStatuses />} />
  <Route path="round-types" element={<SettingsRoundTypes />} />
  <Route path="export" element={<SettingsExport />} />
  <Route path="import" element={<SettingsImport />} />
</Route>
```

### Key Design Rules

1. **No borders on sidebar** - Uses background contrast (`bg-bg1`) for visual separation
2. **Navigation transitions** - `transition-all duration-200 ease-in-out` (standard timing)
3. **Breakpoint** - `md:` (48rem) switches between mobile list and desktop sidebar
4. **Section content** - `bg-bg1 rounded-lg p-4 md:p-6` for consistent card styling
5. **Desktop redirect** - `/settings` redirects to `/settings/theme` on desktop
6. **Icon hover states** - Use `group` on parent with `group-hover:text-accent` on icons
7. **Mobile touch states** - `hover:bg-bg2 active:bg-bg3` on section cards

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
bg-bg0 → Page background
bg-bg1 → Base containers (cards, content), modal content (reset rule)
bg-bg2 → Hover states, nested containers
bg-bg3 → Input backgrounds (on bg-bg2 containers)
bg-bg4 → Nested elements
```

**Special Rules:**

- Modal Reset: Modals use `bg-bg1` then follow 5-layer from there
- Wrap-Around: If 5 layers exceeded, start over from `bg-bg0`

### All Patterns

- **Colors:** Always use `--color-*` CSS variables
- **Icons:** Bootstrap Icons only — `<i className="bi-*" />` — NO other icon libraries
  - **Sizing:** Use icon utilities (.icon-xs through .icon-2xl) — NEVER use text-* utilities
  - .bi::before override enables icon sizing utilities to work correctly
- **Buttons:** 4 variants (Primary, Neutral, Danger, Icon-only)
  - Icon-only: `p-2` (~32x32px square hover area)
  - Danger: ALL variants use `bg-transparent text-red` with 5-layer hover rule
  - Delete button centering: `self-center` when alongside variable-height content
- **Transitions:** `transition-all duration-200 ease-in-out`
- **Inputs:** Use 5-color layering (next color in line from container)
  - `bg-bg1` container → `bg-bg2` input
  - `bg-bg2` container → `bg-bg3` input
  - Focus: `focus:ring-1 focus:ring-accent-bright focus:outline-none`
- **Containers:** NO borders on base containers (color-only separation)
- **Modals:** Use `bg-bg1` for modal content (modal reset rule - 2nd layer)
- **Badges:** Use `bg-[var(--color-*)]/20 text-[var(--color-*)]`
- **Actions:** "Delete" not "Remove"
- **Theme dropdown:** Container `bg-bg1 border border-tertiary`, selected `bg-bg2`, hover `bg-bg3`
- **Separators:** 5-layer contrast rule based on container background (see Separators section)
- **Dropdown focus ring:** `focus:ring-1 focus:ring-accent-bright` on trigger, menu ring when open
- **Dropdown checkmark:** Bootstrap Icons `bi-check` with `text-green` (default) / `text-green-bright` (hover)
- **RoundCard:** `bg-bg2` base, `bg-bg3` interior, `border-tertiary` separators
- **Settings:** Sidebar + nested routes pattern
  - Desktop: Left sidebar `w-64 bg-bg1`, section links with `group` for icon hover states
  - Mobile: Section cards `bg-bg1 rounded-lg p-4`, icons use `text-muted group-hover:text-accent`
  - Mobile touch states: `hover:bg-bg2 active:bg-bg3`
  - No borders on sidebar - background contrast only
  - Section content: `bg-bg1 rounded-lg p-4 md:p-6`
- **Expanding panels/menus:** CSS grid animation pattern
  - `display: grid`, `gridTemplateRows: isOpen ? '1fr' : '0fr'`, `opacity` transition
  - Inner wrapper with `overflow: hidden`
- **Tables:** Traditional pagination with filter bar
  - Filter bar: `bg-bg1 rounded-lg p-4 mb-6`, search with icon + clear, Dropdown filters size `xs`
  - Per-page: Always visible in filter bar (not pagination component)
  - Pagination buttons: `bg-bg2`, `hover:bg-bg3 focus:bg-bg3`, `rounded-lg`, NO borders
  - Active page: `bg-accent text-bg1`
  - Default: 25 items/page, options: 10, 25, 50, 100
  - Header separator: `border-b border-tertiary` on `<thead> <tr>`
  - Row separators: `border-b border-tertiary` on all rows except last
  - Responsive: Table on desktop, cards on mobile
  - URL state: `?page=2`
- **Mobile touch states:** `hover:bg-bg2 active:bg-bg3` (follows 5-layer: container → hover +1 → active +2)
- **Responsive:** Mobile-first (default → sm:40rem → md:48rem → lg:64rem)
  - Grids: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`
  - Headers: `flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4`
  - Touch targets: minimum 2.75rem × 2.75rem (`py-2 px-3` buttons, `p-2` close buttons)
  - Modals: `max-h-[90vh] flex flex-col` + `overflow-y-auto flex-1` content
