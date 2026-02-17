# Extension Design Fixes Design

**Date:** 2026-02-17
**Status:** Approved
**Scope:** Fix all design guideline violations and bugs in browser extension

## Overview

The browser extension has multiple issues preventing it from matching the web application's design guidelines and functioning correctly. This design addresses all identified issues systematically.

## Issues Summary

| # | Issue | Category | Impact |
|---|-------|----------|--------|
| 1 | 5-Layer Rule | CSS | Wrong visual hierarchy |
| 2 | Button Sizing | CSS | Buttons too wide for content |
| 3 | Settings Inputs | CSS | Wrong colors, borders |
| 4 | Settings Link | CSS | Wrong colors, underline |
| 5 | Save Feedback | UX | Confusing message display |
| 6 | Foreground Color | CSS | Wrong contrast (same as #1) |
| 7 | Icon Service Worker | Bug | Icon coloring crashes |
| 8 | Accent Color | Bug | Falls back to defaults |
| 9 | Settings Not Persisting | Bug | Key name mismatch |
| 10 | Icon Declaration | Bug | Manifest/code mismatch |

---

## Section 1: CSS Fixes (Issues 1-6)

### 1.1 5-Layer Rule (Issues 1 & 6)

**Problem:** The popup body uses `var(--bg0)` but should use `var(--bg1)` per the Modal Reset Rule. The popup IS the container - there's no page behind it.

**Current (wrong):**
```css
body {
  background-color: var(--bg0);  /* #1d2021 - too dark */
}
```

**Fix:**
```css
body {
  background-color: var(--bg1);  /* #282828 - correct base */
}
```

**Layering from there:**
- Body: `bg1`
- Header: `bg2` (one layer up)
- Content cards: `bg2`
- Nested elements: `bg3`
- Inputs: `bg3` (on bg2 container)

### 1.2 Button Sizing (Issue 2)

**Problem:** All buttons are full-width (`width: 100%`) which looks wrong for short text like "Autofill Form".

**Current (wrong):**
```css
.btn {
  width: 100%;
  padding: 10px 16px;
}
```

**Fix:**
```css
.btn {
  width: auto;  /* Fit to content */
  padding: 10px 16px;
}

/* Full-width modifier for primary actions */
.btn.full {
  width: 100%;
}

/* Button rows still work */
.button-row .btn {
  flex: 1;
}
```

**Button width rules:**
- "Add as Lead/Application" (in `.button-row`): Split width (flex: 1)
- "Autofill Form": Auto-width (fit to text)
- "View in App": Auto-width (fit to text)
- "Open Settings" (primary, standalone): Full-width

### 1.3 Settings Page Inputs (Issue 3)

**Problem:** Inputs use wrong background, have borders, use outline instead of ring.

**Current (wrong):**
```css
input[type="url"],
input[type="password"] {
  background: var(--bg2);           /* Wrong - should be bg3 */
  border: 1px solid var(--bg3);      /* Wrong - should have no border */
}

input:focus {
  outline: 2px solid var(--accent-bright);  /* Wrong - should use ring approach */
}
```

**Fix:**
```css
input[type="url"],
input[type="password"] {
  background: var(--bg3);           /* Next layer from container */
  border: none;                      /* No default border */
  color: var(--fg0);
  padding: 10px 12px;
  border-radius: 6px;
  transition: all 200ms ease-in-out;
}

input:focus {
  outline: 2px solid var(--accent-bright);
  outline-offset: 2px;
}
```

### 1.4 Settings Link (Issue 4)

**Problem:** Link uses accent-bright as base, has underline on hover.

**Current (wrong):**
```css
small a {
  color: var(--accent-bright);
  text-decoration: none;
}

small a:hover {
  text-decoration: underline;
}
```

**Fix:**
```css
small a {
  color: var(--accent);              /* Base accent color */
  text-decoration: none;
  cursor: pointer;
  transition: all 200ms ease-in-out;
}

small a:hover {
  color: var(--accent-bright);       /* Brighter on hover */
  text-decoration: none;             /* NO underline */
}
```

### 1.5 Save Feedback (Issue 5)

**Problem:** "Save Settings" button + "Settings saved!" message reads redundantly as "Save Settings Settings saved!".

**Current behavior:**
- Button text: "Save Settings"
- Status text: "Settings saved!"
- They appear adjacent without visual separation

**Fix:** Add visual separation and simplify message:
```css
#status {
  margin-top: 12px;          /* Add space from button */
  padding: 8px 12px;
  background: var(--bg2);
  border-radius: 4px;
  display: none;             /* Hidden by default */
}

#status.show {
  display: block;
}
```

**Alternative:** Simplify status message to just "Saved!" or use a toast-like approach.

---

## Section 2: Bug Fixes (Issues 7-10)

### 2.1 Icon Service Worker Bug (Issue 7)

**Problem:** The `updateIconColor()` function uses `new Image()` which doesn't exist in service workers.

**Error:**
```
Failed to update icon color: ReferenceError: Image is not defined
```

**Current (broken):**
```typescript
const img = new Image();  // Doesn't work in service worker!
img.src = url;
```

**Fix:** Use `createImageBitmap()` which works in service workers:
```typescript
async function updateIconColor(accentHex: string): Promise<void> {
  try {
    const svgUrl = browser.runtime.getURL('icons/tree.svg');
    const response = await fetch(svgUrl);
    let svg = await response.text();

    // Replace fill color
    svg = svg.replace(/fill="[^"]*"/g, `fill="${accentHex}"`);

    // Create blob and bitmap (works in service worker)
    const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
    const bitmap = await createImageBitmap(svgBlob);

    // Generate ImageData for multiple sizes
    const sizes = [16, 32, 48, 128] as const;
    const imageData: Record<string, ImageData> = {};

    for (const size of sizes) {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, size, size);
        imageData[size.toString()] = ctx.getImageData(0, 0, size, size);
      }
    }

    await browser.action.setIcon({ imageData });
    console.log('[Icon] Updated with accent color:', accentHex);
  } catch (error) {
    console.error('[Icon] Failed to update:', error);
  }
}
```

### 2.2 Settings Not Persisting (Issue 9)

**Problem:** Key name mismatch between save and read operations.

**Saved as:** `appUrl`
**Read as:** `apiUrl`

**Current (broken) in `background/index.ts`:**
```typescript
const { apiUrl, apiKey } = await browser.storage.local.get(['apiUrl', 'apiKey']);
```

**Fix - Option A (change background to match storage):**
```typescript
const { appUrl, apiKey } = await browser.storage.local.get(['appUrl', 'apiKey']);

// Then update the fetch call:
const response = await fetch(`${appUrl}/users/settings`, ...);
```

**Fix - Option B (change storage to use clearer name):**
Update `lib/storage.ts` interface and all references to use `apiUrl` consistently.

**Recommendation:** Option A is simpler - just fix the background script to read the correct key.

### 2.3 Icon Declaration Mismatch (Issue 10)

**Problem:** Manifest declares static PNG icons, but code tries to set dynamic SVG icons. They don't connect.

**Current manifest:**
```json
"action": {
  "default_icon": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Fix:** Remove default_icon from manifest, let the code set icons dynamically:
```json
"action": {
  "default_popup": "popup/popup.html",
  "default_title": "Job Tracker"
}
```

The `initializeTheme()` function will set the icon on extension load.

### 2.4 Accent Color (Issue 8)

**Problem:** Extension falls back to DEFAULT_COLORS because settings aren't being read (Issue 9).

**Resolution:** Fix Issue 9 (key name mismatch) and Issue 7 (icon coloring bug), and the accent color will work correctly.

---

## Section 3: Options Page Button Classes

**Problem:** The "Save Settings" button in options.html doesn't have the `primary` class.

**Current:**
```html
<button id="saveBtn">Save Settings</button>
```

**Fix:**
```html
<button id="saveBtn" class="primary">Save Settings</button>
```

Also ensure the options.css has the `.primary` button styles defined.

---

## Implementation Order

1. **Bug Fixes First** (unblocks everything)
   - Fix key name mismatch (Issue 9)
   - Fix icon service worker bug (Issue 7)
   - Fix manifest icon declaration (Issue 10)

2. **Popup CSS** (most visible)
   - Fix 5-layer rule (Issues 1 & 6)
   - Fix button sizing (Issue 2)

3. **Options Page CSS**
   - Fix input styling (Issue 3)
   - Fix link styling (Issue 4)
   - Fix button classes
   - Fix save feedback (Issue 5)

4. **Testing**
   - Verify theme sync works
   - Verify icon colors correctly
   - Verify all styling matches guidelines

---

## Files to Modify

### Extension Core
- `extension/src/background/index.ts` — Fix key name, fix Image to createImageBitmap

### Extension Manifest
- `extension/src/manifest.json` — Remove default_icon

### Popup CSS
- `extension/public/popup/popup.css` — Fix 5-layer, button sizing

### Options Page
- `extension/public/options/options.css` — Fix inputs, links, buttons
- `extension/public/options/options.html` — Add primary class to save button

---

## Success Criteria

1. Extension popup uses `bg1` as base background
2. Buttons are sized appropriately (auto-width for neutral, full-width only when needed)
3. Settings page inputs have no borders, correct background, ring focus
4. Settings link uses accent (base) → accent-bright (hover), no underline
5. Save feedback is visually separate and clear
6. Icon shows the tree.svg with user's accent color
7. Settings persist across browser restarts
8. Theme sync works (user changes accent in web app → extension updates)
