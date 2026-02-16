# Extension Fixes Round 2 - Design Document

> **Date:** 2026-02-16
> **Status:** Draft for Approval

## Overview

This document outlines the design for fixing three issues identified after the initial extension fixes:

1. **Application LLM Extraction** - "Add as Application" dumps raw text instead of using AI extraction
2. **Phone Autofill** - Phone field not filling on some forms (iCIMS)
3. **Settings Profile UI** - Design doesn't match other settings sections

---

## Issue 1: Application LLM Extraction

### Problem

When users click "Add as Application" in the extension:
- Job title shows "Job Title" (placeholder)
- Company shows "Unknown Company"
- Job description is a raw dump of all page text

Meanwhile, "Add as Job Lead" correctly uses LLM extraction to parse clean structured data.

### Root Cause

The application creation flow in `extension/src/popup/index.ts`:
1. Gets basic title/company from page detection (unreliable)
2. Dumps all page text via `getTextFromContentScript()` as job description
3. Posts directly to `/api/applications` without any AI processing

The job lead flow in `backend/app/api/job_leads.py`:
1. Fetches HTML from URL
2. Calls `extract_job_data()` with LLM to parse structured data
3. Returns clean: title, company, description, salary, etc.

### Solution: Unified Extraction Endpoint

Create a new backend endpoint that combines extraction + application creation.

#### Backend Changes

**New Endpoint: `POST /api/applications/extract`**

Location: `backend/app/api/applications.py`

```python
@router.post("/extract", response_model=ApplicationListItem)
async def create_application_from_url(
    data: ApplicationExtractRequest,
    user: User = Depends(get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """
    Extract job data from URL using LLM and create an application.
    """
    # 1. Fetch HTML from URL (reuse job_leads._fetch_html)
    # 2. Get AI settings
    # 3. Call extract_job_data() (reuse from job_leads)
    # 4. Create application with extracted data
    # 5. Return created application
```

**New Schema: `ApplicationExtractRequest`**

Location: `backend/app/schemas/application.py`

```python
class ApplicationExtractRequest(BaseModel):
    url: str
    status_id: str
    applied_at: date | None = None
```

#### Extension Changes

**Update popup to use new endpoint**

Location: `extension/src/popup/index.ts`

- Replace `createApplicationFromJob()` call with new `extractAndCreateApplication()`
- Remove `getTextFromContentScript()` call (no longer needed)
- Pass URL and status_id to new endpoint

### Trade-offs

| Aspect | Approach A (New Endpoint) | Approach B (Two Calls) |
|--------|---------------------------|------------------------|
| API calls | 1 | 2 |
| Code reuse | High (shares extraction) | Medium |
| Maintenance | New endpoint | Uses existing |
| Error handling | Single point | Split |

**Recommendation:** Approach A - cleaner architecture, single responsibility.

---

## Issue 2: Phone Autofill

### Problem

Phone field doesn't fill on iCIMS forms despite patterns matching.

### Analysis

The iCIMS phone field:
```html
<input type="text"
  id="-1_PersonProfileFields.PhoneNumber"
  name="-1_PersonProfileFields.PhoneNumber"
  autocomplete="tel-national">
```

Our patterns SHOULD match:
- `autocomplete: ['tel', 'tel-national', 'phone', 'mobile']` ✓
- `namePatterns: [/phone/i, ...]` matches "PhoneNumber" ✓
- `idPatterns: [/phone/i, ...]` matches "PhoneNumber" ✓

### Root Cause Investigation

In `extension/src/lib/autofill/engine.ts` line 78:
```typescript
if (!value || value.trim() === '') {
  result.skippedCount++;
  continue;  // SKIPS if profile value is empty
}
```

**Most likely cause:** User's profile doesn't have a phone number set.

### Solution

1. **Verify profile has phone set** - User should check Settings → Profile
2. **If still failing after phone is set** - Investigate:
   - Whether iCIMS form is in an iframe (content script might not reach it)
   - Whether field has special event handlers preventing programmatic fill

### No Code Changes Needed (Yet)

This is likely a data issue, not a code bug. Verify profile data first.

---

## Issue 3: Settings Profile UI

### Problem

The Profile settings page doesn't follow the design patterns used in other settings sections.

### Current vs Correct Pattern

| Aspect | Current (Wrong) | Correct Pattern |
|--------|-----------------|-----------------|
| Header location | OUTSIDE container | INSIDE container |
| Container class | `bg-bg1` | `bg-secondary` |
| Focus ring | `focus:ring-aqua-bright` | `focus:ring-accent-bright` |
| Primary button | `bg-aqua` | `bg-accent` |
| Location field | Present (redundant) | Remove |
| Country field | Dropdown | Text input |

### Correct Pattern (from SettingsTheme.tsx)

```tsx
<>
  <div className="md:hidden">
    <SettingsBackLink />
  </div>

  <div className="bg-secondary rounded-lg p-4 md:p-6">
    <h2 className="text-xl font-bold text-fg1 mb-4">Section Title</h2>
    <p className="text-sm text-muted mb-4">Description text...</p>

    {/* Content here */}

    <button className="bg-accent text-bg0 hover:bg-accent-bright ...">
      Save
    </button>
  </div>
</>
```

### Solution: Redesign SettingsProfile.tsx

1. **Move header inside form container**
2. **Change container class** from `bg-bg1` to `bg-secondary`
3. **Fix input focus rings** from `focus:ring-aqua-bright` to `focus:ring-accent-bright`
4. **Fix save button** from `bg-aqua` to `bg-accent`
5. **Remove Location field** (city + country replace it)
6. **Change Country from dropdown to text input**
7. **Remove unused Dropdown import**

### Updated Form Fields

| Field | Type | Placeholder |
|-------|------|-------------|
| First Name | text | "John" |
| Last Name | text | "Doe" |
| Email | email | "john@example.com" |
| Phone | tel | "+1 (555) 123-4567" |
| City | text | "San Francisco" |
| Country | text | "United States" |
| LinkedIn URL | url | "https://linkedin.com/in/johndoe" |

---

## Implementation Order

1. **Issue 3: Settings Profile UI** - Quick fix, improves user experience
2. **Issue 2: Phone Autofill** - Verify data first, may need no code changes
3. **Issue 1: Application LLM Extraction** - Larger change, new endpoint

---

## Files to Modify

### Issue 1: Application Extraction
- `backend/app/api/applications.py` - Add `/extract` endpoint
- `backend/app/schemas/application.py` - Add `ApplicationExtractRequest`
- `extension/src/lib/api.ts` - Add `extractAndCreateApplication()` function
- `extension/src/popup/index.ts` - Update `handleAddApplication()`

### Issue 2: Phone Autofill
- No code changes expected (data issue)

### Issue 3: Settings Profile UI
- `frontend/src/components/settings/SettingsProfile.tsx` - Complete redesign

---

## Success Criteria

1. **Application Extraction:** "Add as Application" produces clean, AI-extracted data matching job leads quality
2. **Phone Autofill:** Phone field fills correctly when profile has phone number set
3. **Settings Profile UI:** Matches design of other settings sections exactly
