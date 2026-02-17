# Extension Single URL Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify extension configuration to use a single "App URL" field instead of separate backend/frontend URLs.

**Architecture:** Consolidate `serverUrl` and `frontendUrl` into a single `appUrl` field. Update storage, options page, popup, and API client to use the single URL for all operations.

**Tech Stack:** TypeScript, webextension-polyfill, Vite

---

### Task 1: Update Storage Interface

**Files:**
- Modify: `extension/src/lib/storage.ts`

**Step 1: Update Settings interface**

Replace the current interface:

```typescript
export interface Settings {
  serverUrl: string;
  apiKey: string;
  frontendUrl: string;
}
```

With:

```typescript
export interface Settings {
  appUrl: string;
  apiKey: string;
}
```

**Step 2: Update getSettings function**

Replace:

```typescript
export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(['serverUrl', 'apiKey', 'frontendUrl']);
  return {
    serverUrl: result.serverUrl || '',
    apiKey: result.apiKey || '',
    frontendUrl: result.frontendUrl || '',
  };
}
```

With:

```typescript
export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(['appUrl', 'apiKey']);
  return {
    appUrl: result.appUrl || '',
    apiKey: result.apiKey || '',
  };
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd extension && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add extension/src/lib/storage.ts
git commit -m "refactor: consolidate serverUrl and frontendUrl into appUrl"
```

---

### Task 2: Update Options Page HTML

**Files:**
- Modify: `extension/public/options/options.html`

**Step 1: Update form fields**

Replace:

```html
<div class="form-group">
  <label for="serverUrl">Server URL</label>
  <input type="url" id="serverUrl" placeholder="http://localhost:8000">
</div>

<div class="form-group">
  <label for="frontendUrl">Frontend URL</label>
  <input type="url" id="frontendUrl" placeholder="http://localhost:5173">
  <small>URL for the Job Tracker web app (for "View in App" button)</small>
</div>
```

With:

```html
<div class="form-group">
  <label for="appUrl">App URL</label>
  <input type="url" id="appUrl" placeholder="https://jobs.example.com">
  <small>The URL where your Job Tracker is hosted</small>
</div>
```

**Step 2: Commit**

```bash
git add extension/public/options/options.html
git commit -m "refactor: update options page for single appUrl field"
```

---

### Task 3: Update Options Page Script

**Files:**
- Modify: `extension/src/options/index.ts`

**Step 1: Update DOM element references**

Replace:

```typescript
const serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement;
const frontendUrlInput = document.getElementById('frontendUrl') as HTMLInputElement;
```

With:

```typescript
const appUrlInput = document.getElementById('appUrl') as HTMLInputElement;
```

**Step 2: Update loadSettings function**

Replace:

```typescript
async function loadSettings(): Promise<void> {
  try {
    const settings = await getSettings();
    serverUrlInput.value = settings.serverUrl;
    frontendUrlInput.value = settings.frontendUrl;
    apiKeyInput.value = settings.apiKey;
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}
```

With:

```typescript
async function loadSettings(): Promise<void> {
  try {
    const settings = await getSettings();
    appUrlInput.value = settings.appUrl;
    apiKeyInput.value = settings.apiKey;
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}
```

**Step 3: Update setupEventListeners function**

Replace all references to `serverUrlInput` and `frontendUrlInput` with `appUrlInput`. Remove the frontendUrlInput event listener. The function should look like:

```typescript
function setupEventListeners(): void {
  // Save button click handler
  saveBtn.addEventListener('click', handleSave);

  // API key link click handler
  apiKeyLink.addEventListener('click', handleApiKeyLinkClick);

  // Enter key handler for inputs
  appUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  });
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  });
}
```

**Step 4: Update handleSave function**

Replace:

```typescript
async function handleSave(): Promise<void> {
  const newSettings: Settings = {
    serverUrl: serverUrlInput.value.trim(),
    frontendUrl: frontendUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
  };

  // Validate server URL
  if (!newSettings.serverUrl) {
    showStatus('Please enter a server URL', 'error');
    serverUrlInput.focus();
    return;
  }

  // Validate server URL format
  try {
    new URL(newSettings.serverUrl);
  } catch {
    showStatus('Please enter a valid server URL', 'error');
    serverUrlInput.focus();
    return;
  }

  // Validate frontend URL if provided
  if (newSettings.frontendUrl) {
    try {
      new URL(newSettings.frontendUrl);
    } catch {
      showStatus('Please enter a valid frontend URL', 'error');
      frontendUrlInput.focus();
      return;
    }
  }

  // Validate API key
  if (!newSettings.apiKey) {
    showStatus('Please enter an API key', 'error');
    apiKeyInput.focus();
    return;
  }
  // ... rest of function
}
```

With:

```typescript
async function handleSave(): Promise<void> {
  const newSettings: Settings = {
    appUrl: appUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
  };

  // Validate app URL
  if (!newSettings.appUrl) {
    showStatus('Please enter an App URL', 'error');
    appUrlInput.focus();
    return;
  }

  // Validate URL format
  try {
    new URL(newSettings.appUrl);
  } catch {
    showStatus('Please enter a valid URL', 'error');
    appUrlInput.focus();
    return;
  }

  // Validate API key
  if (!newSettings.apiKey) {
    showStatus('Please enter an API key', 'error');
    apiKeyInput.focus();
    return;
  }
  // ... rest of function stays the same
}
```

**Step 5: Update handleApiKeyLinkClick function**

Replace:

```typescript
function handleApiKeyLinkClick(e: Event): void {
  e.preventDefault();
  const serverUrl = serverUrlInput.value.trim() || 'http://localhost:8000';
  browser.tabs.create({ url: `${serverUrl}/settings/api-key` });
}
```

With:

```typescript
function handleApiKeyLinkClick(e: Event): void {
  e.preventDefault();
  const appUrl = appUrlInput.value.trim();
  if (appUrl) {
    browser.tabs.create({ url: `${appUrl}/settings/api-key` });
  }
}
```

**Step 6: Verify TypeScript compiles**

Run: `cd extension && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add extension/src/options/index.ts
git commit -m "refactor: update options script for single appUrl field"
```

---

### Task 4: Update Popup Script

**Files:**
- Modify: `extension/src/popup/index.ts`

**Step 1: Remove getFrontendUrl helper function**

Delete this entire function:

```typescript
/**
 * Gets the frontend URL from settings, with fallback logic.
 * If frontendUrl is set, use it.
 * If not, try to derive from serverUrl (replace port 8000 with 5173 for localhost).
 */
function getFrontendUrl(settings: Settings): string {
  if (settings.frontendUrl) {
    return settings.frontendUrl;
  }
  // Fallback: derive from serverUrl for local development
  const serverUrl = settings.serverUrl || 'http://localhost:8000';
  if (serverUrl.includes(':8000')) {
    return serverUrl.replace(':8000', ':5173');
  }
  // If we can't derive, return the serverUrl (won't work but better than nothing)
  return serverUrl;
}
```

**Step 2: Update openJobLeads function**

Replace:

```typescript
function openJobLeads(): void {
  getSettings()
    .then((settings: Settings) => {
      const frontendUrl = getFrontendUrl(settings);
      const url = existingLead
        ? `${frontendUrl}/job-leads/${existingLead.id}`
        : `${frontendUrl}/job-leads`;
      browser.tabs.create({ url }).catch((error) => {
        console.error('Failed to open job leads:', error);
      });
    })
    .catch((error) => {
      console.error('Failed to get settings for opening job leads:', error);
    });
}
```

With:

```typescript
function openJobLeads(): void {
  getSettings()
    .then((settings: Settings) => {
      const url = existingLead
        ? `${settings.appUrl}/job-leads/${existingLead.id}`
        : `${settings.appUrl}/job-leads`;
      browser.tabs.create({ url }).catch((error) => {
        console.error('Failed to open job leads:', error);
      });
    })
    .catch((error) => {
      console.error('Failed to get settings for opening job leads:', error);
    });
}
```

**Step 3: Update openApplications function**

Replace:

```typescript
function openApplications(applicationId?: string): void {
  getSettings()
    .then((settings: Settings) => {
      const frontendUrl = getFrontendUrl(settings);
      const url = applicationId
        ? `${frontendUrl}/applications/${applicationId}`
        : `${frontendUrl}/applications`;
      browser.tabs.create({ url }).catch((error) => {
        console.error('Failed to open applications:', error);
      });
    })
    .catch((error) => {
      console.error('Failed to get settings for opening applications:', error);
    });
}
```

With:

```typescript
function openApplications(applicationId?: string): void {
  getSettings()
    .then((settings: Settings) => {
      const url = applicationId
        ? `${settings.appUrl}/applications/${applicationId}`
        : `${settings.appUrl}/applications`;
      browser.tabs.create({ url }).catch((error) => {
        console.error('Failed to open applications:', error);
      });
    })
    .catch((error) => {
      console.error('Failed to get settings for opening applications:', error);
    });
}
```

**Step 4: Verify TypeScript compiles**

Run: `cd extension && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add extension/src/popup/index.ts
git commit -m "refactor: update popup to use single appUrl for navigation"
```

---

### Task 5: Update API Client

**Files:**
- Modify: `extension/src/lib/api.ts`

**Step 1: Update all functions that use settings.serverUrl**

Search for `settings.serverUrl` and replace with `settings.appUrl`. There should be multiple occurrences in:
- `saveJobLead()`
- `checkExistingLead()`
- `getProfile()`
- `testConnection()`
- `createApplicationFromJob()`
- `extractApplication()`
- `getStatuses()`

**Step 2: Update error messages**

Change any error messages that reference "Server URL" to "App URL":

```typescript
throw new AuthenticationError('Server URL or API key not configured. Please check your extension settings.');
```

Should become:

```typescript
throw new AuthenticationError('App URL or API key not configured. Please check your extension settings.');
```

**Step 3: Verify TypeScript compiles**

Run: `cd extension && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add extension/src/lib/api.ts
git commit -m "refactor: update API client to use appUrl instead of serverUrl"
```

---

### Task 6: Build and Test Extension

**Files:**
- None (testing only)

**Step 1: Build the extension**

Run: `cd extension && npm run build`
Expected: Build succeeds without errors

**Step 2: Manual testing checklist**

1. Load extension in browser
2. Open extension settings - verify single "App URL" field
3. Configure App URL (e.g., `https://tarnished.sarma.love`)
4. Verify API key link opens `{appUrl}/settings/api-key`
5. Save settings and verify no errors
6. Test saving a job lead
7. Test "View in App" button - should open `{appUrl}/job-leads/{id}` or `{appUrl}/applications/{id}`

**Step 3: Commit build artifacts (if tracked)**

```bash
git add extension/dist/
git commit -m "build: rebuild extension with single appUrl config"
```

---

### Task 7: Final Verification and Cleanup

**Files:**
- None (verification only)

**Step 1: Search for any remaining old references**

Run: `cd extension && grep -r "serverUrl\|frontendUrl" src/`
Expected: No matches (except possibly in comments)

**Step 2: Search for any localhost fallbacks**

Run: `cd extension && grep -r "localhost" src/`
Expected: No matches (all fallbacks removed)

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete extension single URL configuration refactor"
```
