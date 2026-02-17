# Extension Design Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all design guideline violations and bugs in the browser extension to match the web application's design system.

**Architecture:** Fix critical bugs first (key mismatch, service worker Image issue, manifest icons), then CSS fixes for 5-layer rule, button sizing, input styling, and link styling.

**Tech Stack:** Chrome Extension (Manifest V3), TypeScript, CSS, webextension-polyfill

---

## Task 1: Fix Settings Key Name Mismatch

**Files:**
- Modify: `extension/src/background/index.ts`

**Problem:** Settings are saved as `appUrl` but background reads `apiUrl`.

**Step 1: Read the current background script**

Read `extension/src/background/index.ts` to find the key name issue.

**Step 2: Fix the key name in fetchThemeSettings**

Find this code (around line 13):
```typescript
const { apiUrl, apiKey } = await browser.storage.local.get(['apiUrl', 'apiKey']);
```

Change to:
```typescript
const { appUrl, apiKey } = await browser.storage.local.get(['appUrl', 'apiKey']);
```

**Step 3: Update the fetch URL reference**

Find where `apiUrl` is used in the fetch call and change to `appUrl`:
```typescript
// Before
const response = await fetch(`${apiUrl}/users/settings`, {

// After
const response = await fetch(`${appUrl}/users/settings`, {
```

**Step 4: Verify TypeScript compiles**

Run: `cd extension && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add extension/src/background/index.ts
git commit -m "fix(extension): use correct storage key appUrl instead of apiUrl"
```

---

## Task 2: Fix Icon Service Worker Bug

**Files:**
- Modify: `extension/src/background/index.ts`

**Problem:** `new Image()` doesn't exist in service workers.

**Step 1: Read the current updateIconColor function**

Read `extension/src/background/index.ts` and find the `updateIconColor` function (around line 64-107).

**Step 2: Replace the entire function with createImageBitmap version**

Replace the function with:
```typescript
async function updateIconColor(accentHex: string): Promise<void> {
  try {
    // Fetch the tree SVG
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

**Step 3: Verify TypeScript compiles**

Run: `cd extension && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add extension/src/background/index.ts
git commit -m "fix(extension): use createImageBitmap for service worker icon coloring"
```

---

## Task 3: Fix Manifest Icon Declaration

**Files:**
- Modify: `extension/src/manifest.json`

**Problem:** Manifest declares PNG icons that override dynamic icon setting.

**Step 1: Read current manifest**

Read `extension/src/manifest.json`

**Step 2: Remove default_icon from action**

Find the `action` section and remove `default_icon`:
```json
// Before
"action": {
  "default_popup": "popup/popup.html",
  "default_icon": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "default_title": "Job Tracker"
}

// After
"action": {
  "default_popup": "popup/popup.html",
  "default_title": "Job Tracker"
}
```

**Step 3: Keep the icons section for extension management pages**

Leave the top-level `icons` section unchanged (this is for Chrome extension management page):
```json
"icons": {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

**Step 4: Add tree.svg to web_accessible_resources**

Find `web_accessible_resources` and add tree.svg:
```json
"web_accessible_resources": [
  {
    "resources": ["content/iframe-scanner.js", "icons/tree.svg"],
    "matches": ["<all_urls>"]
  }
]
```

**Step 5: Commit**

```bash
git add extension/src/manifest.json
git commit -m "fix(extension): remove default_icon to allow dynamic icon coloring"
```

---

## Task 4: Fix Popup 5-Layer Rule

**Files:**
- Modify: `extension/public/popup/popup.css`

**Problem:** Body uses `bg0` instead of `bg1`.

**Step 1: Read current popup CSS**

Read `extension/public/popup/popup.css`

**Step 2: Change body background from bg0 to bg1**

Find (around line 43-45):
```css
body {
  background-color: var(--bg0);
```

Change to:
```css
body {
  background-color: var(--bg1);
```

**Step 3: Update header background**

Find `.header` and change from `bg1` to `bg2`:
```css
// Before
.header {
  background: var(--bg1);

// After
.header {
  background: var(--bg2);
```

**Step 4: Update job-info card background**

Find `.job-info` and change from `bg1` to `bg2`:
```css
// Before
.job-info {
  background: var(--bg1);

// After
.job-info {
  background: var(--bg2);
```

**Step 5: Update message.info background**

Find `.message.info` and update:
```css
// Before
.message.info {
  background: var(--bg1);

// After
.message.info {
  background: var(--bg2);
```

**Step 6: Remove borders from containers**

Find and remove borders that violate the 5-layer rule:
```css
// Remove this border from .header
border-bottom: 1px solid var(--bg2);

// Remove this border from .job-info
border: 1px solid var(--bg2);
```

**Step 7: Commit**

```bash
git add extension/public/popup/popup.css
git commit -m "fix(extension): apply 5-layer rule to popup starting from bg1"
```

---

## Task 5: Fix Button Sizing

**Files:**
- Modify: `extension/public/popup/popup.css`

**Problem:** All buttons are full-width.

**Step 1: Remove width: 100% from .btn**

Find `.btn` class (around line 217-230):
```css
.btn {
  width: 100%;
  padding: 10px 16px;
  ...
}
```

Change to:
```css
.btn {
  width: auto;
  padding: 10px 16px;
  ...
}
```

**Step 2: Add .btn.full modifier for full-width buttons**

Add after the `.btn` rule:
```css
/* Full-width modifier for standalone primary actions */
.btn.full {
  width: 100%;
}
```

**Step 3: Keep .button-row .btn as flex: 1**

Verify `.button-row .btn` already has `flex: 1` - this makes side-by-side buttons split width correctly.

**Step 4: Commit**

```bash
git add extension/public/popup/popup.css
git commit -m "fix(extension): change buttons to auto-width with full modifier"
```

---

## Task 6: Update Popup HTML Button Classes

**Files:**
- Modify: `extension/public/popup/popup.html`

**Problem:** Some buttons need the `full` class to stay full-width.

**Step 1: Read popup HTML**

Read `extension/public/popup/popup.html`

**Step 2: Add full class to standalone primary buttons**

Find buttons that should be full-width (like "Open Settings") and add `full` class:
```html
<!-- Before -->
<button id="openSettingsBtn" class="btn neutral">Open Settings</button>

<!-- After (if it should be full-width) -->
<button id="openSettingsBtn" class="btn neutral full">Open Settings</button>
```

**Step 3: Verify neutral buttons are NOT full-width**

Buttons like "Autofill Form" and "View in App" should NOT have the `full` class - they should be auto-width.

**Step 4: Commit**

```bash
git add extension/public/popup/popup.html
git commit -m "style(extension): add full class to buttons that need full-width"
```

---

## Task 7: Fix Options Page Input Styling

**Files:**
- Modify: `extension/public/options/options.css`

**Problem:** Inputs have wrong background, borders, and focus style.

**Step 1: Read options CSS**

Read `extension/public/options/options.css`

**Step 2: Fix input background and remove border**

Find input styling:
```css
input[type="url"],
input[type="password"] {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg2);
  border: 1px solid var(--bg3);
  border-radius: 6px;
  color: var(--fg0);
  font-size: 14px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
```

Change to:
```css
input[type="url"],
input[type="password"] {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg3);
  border: none;
  border-radius: 6px;
  color: var(--fg0);
  font-size: 14px;
  transition: all 200ms ease-in-out;
}
```

**Step 3: Fix focus state**

The focus state should already use outline correctly. Verify:
```css
input[type="url"]:focus,
input[type="password"]:focus {
  outline: 2px solid var(--accent-bright);
  outline-offset: 2px;
}
```

**Step 4: Commit**

```bash
git add extension/public/options/options.css
git commit -m "fix(extension): correct input styling per design guidelines"
```

---

## Task 8: Fix Options Page Link Styling

**Files:**
- Modify: `extension/public/options/options.css`

**Problem:** Link uses wrong colors and has underline on hover.

**Step 1: Find link styling in options CSS**

Find:
```css
small a {
  color: var(--accent-bright);
  text-decoration: none;
}

small a:hover {
  text-decoration: underline;
}
```

**Step 2: Fix link styling**

Change to:
```css
small a {
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
  transition: all 200ms ease-in-out;
}

small a:hover {
  color: var(--accent-bright);
  text-decoration: none;
}
```

**Step 3: Commit**

```bash
git add extension/public/options/options.css
git commit -m "fix(extension): correct link styling per design guidelines"
```

---

## Task 9: Fix Save Button Class and Feedback

**Files:**
- Modify: `extension/public/options/options.html`
- Modify: `extension/public/options/options.css`

**Problem:** Save button missing primary class, feedback message too close to button.

**Step 1: Add primary class to save button**

In `options.html`, find:
```html
<button id="saveBtn">Save Settings</button>
```

Change to:
```html
<button id="saveBtn" class="primary">Save Settings</button>
```

**Step 2: Add spacing to status message**

In `options.css`, find or add `#status` styling:
```css
#status {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--bg2);
  border-radius: 4px;
  color: var(--green);
  font-size: 13px;
}
```

**Step 3: Commit**

```bash
git add extension/public/options/options.html extension/public/options/options.css
git commit -m "fix(extension): add primary class to save button and improve feedback spacing"
```

---

## Task 10: Build and Test

**Step 1: Build the extension**

Run: `cd extension && npm run build`

**Step 2: Verify build output**

Run: `ls -la extension/dist/`

**Step 3: Manual test checklist**

1. Load extension in Chrome from `extension/dist/`
2. Configure extension with API URL and API key
3. Click save - verify "Settings saved!" appears with proper spacing
4. Close and reopen popup - verify settings persisted (no "not configured" error)
5. Check icon - should be tree.svg colored with accent
6. In web app, change accent color to "Purple"
7. Reopen extension popup - should show purple accents
8. Check browser console for any errors

**Step 4: Fix any issues found**

If issues found, create fix commits.

**Step 5: Verify no TypeScript errors**

Run: `cd extension && npx tsc --noEmit`

---

## Task 11: Final Commit

**Step 1: Check git status**

Run: `git status`

**Step 2: Final commit if needed**

```bash
git add -A
git commit -m "fix: extension design guideline compliance and bug fixes"
```

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Bug | Fix key name mismatch (appUrl vs apiUrl) |
| 2 | Bug | Fix service worker Image issue |
| 3 | Bug | Remove manifest default_icon |
| 4 | CSS | Fix popup 5-layer rule |
| 5 | CSS | Fix button sizing |
| 6 | HTML | Update button classes |
| 7 | CSS | Fix options input styling |
| 8 | CSS | Fix options link styling |
| 9 | CSS/HTML | Fix save button and feedback |
| 10 | Test | Build and test |
| 11 | Cleanup | Final commit |
