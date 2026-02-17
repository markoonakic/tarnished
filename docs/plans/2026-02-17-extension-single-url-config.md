# Extension Single URL Configuration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Simplify extension configuration to use a single "App URL" that handles all API calls and navigation, removing the confusing separate backend/frontend URL fields.

**Architecture:** The extension currently has separate `serverUrl` (backend API) and `frontendUrl` (web app) fields. This is confusing and unnecessary since the production deployment serves both from the same origin. We'll consolidate to a single `appUrl` field.

**Tech Stack:** TypeScript, webextension-polyfill, Vite

---

## Problem Statement

1. Users must configure two URLs (Server URL + Frontend URL) which is confusing
2. The "Get your API key" link uses the backend URL (`/settings/api-key` doesn't exist on backend)
3. In production, both frontend and backend are served from the same origin
4. Hardcoded localhost fallbacks are brittle and not production-ready

## Solution

### Single URL Configuration

Replace `serverUrl` + `frontendUrl` with a single `appUrl` field:

```
User enters: https://tarnished.sarma.love

All endpoints use this URL:
- API:           https://tarnished.sarma.love/api/job-leads
- View in App:   https://tarnished.sarma.love/applications/123
- API key link:  https://tarnished.sarma.love/settings/api-key
```

### Changes Required

#### 1. Storage Interface (`extension/src/lib/storage.ts`)
- Rename `serverUrl` → `appUrl`
- Remove `frontendUrl`
- Update `getSettings()` and `setSettings()`

#### 2. Options Page (`extension/public/options/options.html`)
- Rename "Server URL" label → "App URL"
- Remove Frontend URL field entirely
- Update placeholder to show `https://jobs.example.com`
- Update help text for API key link

#### 3. Options Script (`extension/src/options/index.ts`)
- Rename variable `serverUrlInput` → `appUrlInput`
- Remove `frontendUrlInput` handling
- Update API key link to use `appUrl` (this already works since frontend serves `/settings/api-key`)
- Update validation messages

#### 4. Popup Script (`extension/src/popup/index.ts`)
- Update `getSettings()` calls to use `appUrl`
- Remove `getFrontendUrl()` helper function
- Use `settings.appUrl` directly for all API calls and navigation
- Update `openApplications()` and `openJobLeads()` to use `appUrl`

#### 5. API Client (`extension/src/lib/api.ts`)
- Update all API calls to use `appUrl` instead of `serverUrl`
- No fallbacks - if not configured, show error

### Migration

Users with existing `serverUrl` configuration will need to re-configure. This is acceptable because:
1. Extension settings are simple to update
2. Breaking change is worth the simplification
3. We can add a migration that copies `serverUrl` → `appUrl` on first load if desired

### No Fallbacks

- Remove all `|| 'http://localhost:8000'` fallbacks
- If `appUrl` is not configured, show "Configure extension first" message
- Clean, predictable behavior

---

## Success Criteria

1. Extension has one URL field: "App URL"
2. All API calls use `{appUrl}/api/*`
3. "View in App" opens `{appUrl}/applications/*` or `{appUrl}/job-leads/*`
4. "Get your API key" opens `{appUrl}/settings/api-key`
5. No hardcoded localhost URLs anywhere
6. Works correctly with production deployment at `tarnished.sarma.love`
