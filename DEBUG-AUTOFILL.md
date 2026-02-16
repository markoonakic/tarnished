# Debug Session: Fix Extension Detection and Autofill

## Problem Summary

The browser extension's job detection and autofill features are broken after recent changes:

1. **LinkedIn job detection**: Works briefly during page load, then stops detecting
2. **iCIMS form autofill**: Form fields are not detected or filled

## Root Cause

The `all_frames: true` change in manifest.json combined with `isTopFrame()` checks is causing conflicts:

- **LinkedIn**: Has iframes, and the main frame detection is being overwritten
- **iCIMS**: The application form is INSIDE an iframe, but `isTopFrame()` skips iframes

## Current State

### Manifest (extension/src/manifest.json)
```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["content/index.js"],
    "run_at": "document_idle",
    "all_frames": true  // <-- THIS IS THE PROBLEM
  }
]
```

### Content Script (extension/src/content/index.ts)
- Has `isTopFrame()` checks that skip detection in iframes
- This breaks iCIMS because the form is in an iframe

## Solution Options

### Option A: Remove all_frames, use postMessage for iframes
1. Remove `all_frames: true` from manifest
2. Main frame listens for form detection from iframes via `window.postMessage`
3. Only main frame communicates with background script

### Option B: Smart frame detection
1. Keep `all_frames: true`
2. For job detection: Only run in top frame
3. For form scanning: Run in all frames BUT:
   - Iframes send results to top frame via postMessage
   - Top frame aggregates and sends to background

### Option C: Separate content scripts
1. One script for top frame (job detection)
2. One script for all frames (form scanning)
3. Use different match patterns or programmatic injection

## Recommended Approach

**Option A** is simplest and most reliable:

1. Remove `all_frames: true` from manifest
2. Main content script:
   - Runs job detection (LinkedIn, etc.)
   - Scans for forms in main frame AND injects a script into iframes to scan them
   - Listens for results from iframe scripts

## Files to Modify

1. `extension/src/manifest.json` - Remove `all_frames: true`
2. `extension/src/content/index.ts` - Remove `isTopFrame()` checks, add iframe scanning
3. Possibly create `extension/src/content/iframe-scanner.ts` - Script to inject into iframes

## Debug Commands

```bash
# Build extension
cd /workspaces/job-tracker/.worktrees/job-leads-phase1/extension && npm run build

# Check manifest
cat extension/dist/manifest.json | grep -A5 content_scripts

# Check content script for isTopFrame usage
grep -n "isTopFrame" extension/src/content/index.ts
```

## Test Cases

1. **LinkedIn job posting page**: Should show "Job Detected" in popup
2. **iCIMS application form**: Should detect fillable fields and show autofill button
3. **Local test form** (`extension/test-form.html`): Should work as baseline

## Recent Commits to Potentially Revert

- `5b6e577` - "fix(extension): only run job detection in top frame"
- `0e9a2ec` - "fix(extension): improve form detection for iframe-based ATS platforms" (added all_frames: true)

## Key Logs to Look For

```
[Job Tracker] Field scan result: {totalInputsOnPage: X, ...}
[Job Tracker] Form detection update: {hasApplicationForm: true, fillableFieldCount: Y}
```

If `totalInputsOnPage: 0` but you can see form fields on the page, the issue is that the script is running in the wrong frame.
