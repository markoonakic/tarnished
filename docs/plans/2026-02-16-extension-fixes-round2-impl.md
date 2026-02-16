# Extension Fixes Round 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix application LLM extraction, phone autofill verification, and redesign settings profile UI.

**Architecture:**
1. New backend endpoint `/api/applications/extract` reuses existing `extract_job_data()` from job leads
2. Phone autofill is likely a data issue - verify profile has phone set
3. Settings profile redesigned to match other settings sections (bg-secondary, accent colors, no Location, Country as text)

**Tech Stack:** FastAPI, SQLAlchemy, React, TypeScript, Tailwind CSS

---

## Task 1: Redesign Settings Profile UI Structure

**Files:**
- Modify: `frontend/src/components/settings/SettingsProfile.tsx`

**Step 1: Update imports and remove unused Dropdown**

Remove the Dropdown import and COUNTRY_OPTIONS constant since Country will be a text field.

Change:
```tsx
import Dropdown, { type DropdownOption } from '../Dropdown';
```

To:
```tsx
// (remove Dropdown import entirely)
```

Also remove the entire `COUNTRY_OPTIONS` array (lines 10-31).

**Step 2: Restructure component to match settings pattern**

Replace the entire return statement with the correct pattern:

```tsx
  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <form onSubmit={handleSave} className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-xl font-bold text-fg1 mb-4">Profile</h2>
        <p className="text-sm text-muted mb-4">
          Your personal information for autofill and communications.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* First Name */}
          <div>
            <label className="text-sm text-muted block mb-1.5">First Name</label>
            <input
              type="text"
              value={profile?.first_name || ''}
              onChange={(e) => handleInputChange('first_name', e.target.value)}
              placeholder="John"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="text-sm text-muted block mb-1.5">Last Name</label>
            <input
              type="text"
              value={profile?.last_name || ''}
              onChange={(e) => handleInputChange('last_name', e.target.value)}
              placeholder="Doe"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-sm text-muted block mb-1.5">Email</label>
            <input
              type="email"
              value={profile?.email || ''}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="john@example.com"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-sm text-muted block mb-1.5">Phone</label>
            <input
              type="tel"
              value={profile?.phone || ''}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* City */}
          <div>
            <label className="text-sm text-muted block mb-1.5">City</label>
            <input
              type="text"
              value={profile?.city || ''}
              onChange={(e) => handleInputChange('city', e.target.value)}
              placeholder="San Francisco"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Country */}
          <div>
            <label className="text-sm text-muted block mb-1.5">Country</label>
            <input
              type="text"
              value={profile?.country || ''}
              onChange={(e) => handleInputChange('country', e.target.value)}
              placeholder="United States"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* LinkedIn URL */}
          <div className="sm:col-span-2">
            <label className="text-sm text-muted block mb-1.5">LinkedIn URL</label>
            <input
              type="url"
              value={profile?.linkedin_url || ''}
              onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/in/johndoe"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <i className="bi-arrow-repeat icon-sm animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <i className="bi-check-lg icon-sm" />
                Save
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
```

**Step 3: Update handleSave to remove location field**

In the `handleSave` function, remove the `location` field from the update call:

```tsx
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    try {
      await updateProfile({
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
        linkedin_url: profile.linkedin_url,
        city: profile.city,
        country: profile.country,
      });
      toast.success('Profile saved successfully');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }
```

**Step 4: Update loading state to use bg-secondary**

```tsx
  if (loading) {
    return (
      <>
        <div className="md:hidden">
          <SettingsBackLink />
        </div>
        <div className="bg-secondary rounded-lg p-4 md:p-6">
          <Loading message="Loading profile..." />
        </div>
      </>
    );
  }
```

**Step 5: Verify frontend compiles**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/frontend && npx tsc --noEmit`

Expected: No type errors

**Step 6: Commit**

```bash
git add frontend/src/components/settings/SettingsProfile.tsx
git commit -m "fix(ui): redesign settings profile to match section pattern"
```

---

## Task 2: Add Application Extract Request Schema

**Files:**
- Modify: `backend/app/schemas/application.py`

**Step 1: Add ApplicationExtractRequest schema**

Add after the existing imports and before `ApplicationCreate`:

```python
class ApplicationExtractRequest(BaseModel):
    """Request to extract job data from URL and create an application."""
    url: str
    status_id: str
    applied_at: date | None = None
```

**Step 2: Verify schema imports are correct**

Ensure these imports exist at the top of the file:
```python
from datetime import date
from pydantic import BaseModel
```

**Step 3: Verify the schema**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/backend && uv run python -c "from app.schemas.application import ApplicationExtractRequest; print('OK')"`

Expected: `OK`

**Step 4: Commit**

```bash
git add backend/app/schemas/application.py
git commit -m "feat(schemas): add ApplicationExtractRequest for URL-based extraction"
```

---

## Task 3: Add Application Extract Endpoint

**Files:**
- Modify: `backend/app/api/applications.py`

**Step 1: Add required imports**

Add to the imports section:

```python
from app.schemas.application import ApplicationExtractRequest
from app.services.extraction import (
    extract_job_data,
    ExtractionError,
    ExtractionTimeoutError,
    ExtractionInvalidResponseError,
    NoJobFoundError,
)
from app.api.job_leads import _fetch_html, _get_ai_settings
```

**Step 2: Add the extract endpoint**

Add after the existing `create_application` endpoint:

```python
@router.post("/extract", response_model=ApplicationListItem, status_code=status.HTTP_201_CREATED)
async def create_application_from_url(
    data: ApplicationExtractRequest,
    user: User = Depends(get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """
    Extract job data from a URL using LLM and create an application.
    This provides the same extraction quality as job leads.
    """
    # 1. Validate status exists
    result = await db.execute(
        select(ApplicationStatus).where(
            ApplicationStatus.id == data.status_id,
            or_(ApplicationStatus.user_id == user.id, ApplicationStatus.user_id.is_(None)),
        )
    )
    if not result.scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")

    # 2. Fetch HTML from URL
    try:
        html_content = await _fetch_html(data.url)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to fetch URL: {str(e)}")

    # 3. Get AI settings and extract job data
    ai_model, ai_api_key, ai_api_base = await _get_ai_settings(db)

    try:
        extracted = await extract_job_data(
            html=html_content,
            text=None,
            url=data.url,
            model=ai_model,
            api_key=ai_api_key,
            api_base=ai_api_base,
        )
    except ExtractionTimeoutError as e:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=e.message)
    except ExtractionInvalidResponseError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.message)
    except NoJobFoundError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.message)
    except ExtractionError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=e.message)

    # 4. Create the application with extracted data
    application = Application(
        user_id=user.id,
        company=extracted.company or "Unknown Company",
        job_title=extracted.title or "Unknown Position",
        job_description=extracted.description,
        job_url=data.url,
        status_id=data.status_id,
        applied_at=data.applied_at or date.today(),
        salary_min=extracted.salary_min,
        salary_max=extracted.salary_max,
        salary_currency=extracted.salary_currency,
    )

    db.add(application)
    await db.commit()
    await db.refresh(application)
    await db.refresh(application, ["status"])

    # 5. Record streak activity
    await record_streak_activity(user.id, db)

    return application
```

**Step 3: Verify the endpoint**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/backend && uv run python -c "from app.api.applications import router; print('OK')"`

Expected: `OK`

**Step 4: Commit**

```bash
git add backend/app/api/applications.py
git commit -m "feat(api): add /applications/extract endpoint with LLM extraction"
```

---

## Task 4: Add Extension API Function for Extract

**Files:**
- Modify: `extension/src/lib/api.ts`

**Step 1: Add extractApplication function**

Add after the existing `createApplicationFromJob` function:

```typescript
/**
 * Request to extract job data from URL and create an application.
 */
export interface ApplicationExtractRequest {
  url: string;
  status_id: string;
  applied_at?: string;
}

/**
 * Extract job data from URL using LLM and create an application.
 */
export async function extractApplication(
  data: ApplicationExtractRequest
): Promise<JobLeadResponse> {
  const response = await fetch(`${API_BASE}/api/applications/extract`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || 'Failed to extract application');
  }

  return response.json();
}
```

**Step 2: Export the new function and type**

Ensure they're exported from the module (add to exports if needed).

**Step 3: Verify TypeScript compiles**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/extension && npx tsc --noEmit`

Expected: No type errors

**Step 4: Commit**

```bash
git add extension/src/lib/api.ts
git commit -m "feat(extension): add extractApplication API function"
```

---

## Task 5: Update Popup to Use Extract Endpoint

**Files:**
- Modify: `extension/src/popup/index.ts`

**Step 1: Update imports**

Change the import to include `extractApplication`:

```typescript
import {
  checkExistingLead,
  getProfile,
  extractApplication,
  getStatuses,
  type JobLeadResponse,
  type StatusResponse,
} from '../lib/api';
```

**Step 2: Update autofillFormHandler to use extractApplication**

Find the `autofillFormHandler` function and update the call. Replace:

```typescript
const result = await createApplicationFromJob({...});
```

With:

```typescript
const result = await extractApplication({
  url: currentTabUrl,
  status_id: statusId,
  applied_at: new Date().toISOString().split('T')[0],
});
```

**Step 3: Remove getTextFromContentScript call**

The extraction happens server-side now, so remove:

```typescript
// Remove this block:
let jobDescription: string | undefined;
try {
  jobDescription = await getTextFromContentScript();
} catch {
  // Continue without description
}
```

**Step 4: Verify TypeScript compiles**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/extension && npx tsc --noEmit`

Expected: No type errors

**Step 5: Commit**

```bash
git add extension/src/popup/index.ts
git commit -m "feat(extension): use extract endpoint for application creation"
```

---

## Task 6: Build and Test Extension

**Files:**
- None (testing)

**Step 1: Build the extension**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/extension && npm run build`

Expected: Build succeeds with no errors

**Step 2: Verify TypeScript**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/extension && npx tsc --noEmit`

Expected: No type errors

**Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: extension build fixes"
```

---

## Task 7: Verify Backend Tests Pass

**Files:**
- None (testing)

**Step 1: Run profile-related tests**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/backend && uv run pytest tests/test_api_endpoints.py -k "profile or Profile" -v`

Expected: All profile tests pass

**Step 2: Run application tests**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/backend && uv run pytest tests/test_api_endpoints.py -k "application or Application" -v`

Expected: Tests pass (some may fail if unrelated to our changes)

---

## Task 8: Final Integration Verification

**Step 1: Verify backend imports**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/backend && uv run python -c "from app.main import app; print('Backend OK')"`

Expected: `Backend OK`

**Step 2: Verify frontend builds**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/frontend && npx tsc --noEmit`

Expected: No errors

**Step 3: Verify extension builds**

Run: `cd /workspaces/job-tracker/.worktrees/job-leads-phase1/extension && npm run build`

Expected: Build succeeds

---

## Manual Testing Checklist

After implementation, manually verify:

1. **Settings Profile UI:**
   - [ ] Open Settings → Profile
   - [ ] Verify section matches other settings (bg-secondary, accent colors)
   - [ ] Verify Location field is gone
   - [ ] Verify Country is a text field (not dropdown)
   - [ ] Save profile and verify changes persist

2. **Application Extraction:**
   - [ ] Go to a LinkedIn job posting
   - [ ] Click "Add as Application"
   - [ ] Verify job title is extracted (not "Job Title")
   - [ ] Verify company is extracted (not "Unknown Company")
   - [ ] Verify description is clean (not raw page dump)

3. **Phone Autofill:**
   - [ ] Verify phone number is set in Settings → Profile
   - [ ] Go to iCIMS form
   - [ ] Click Autofill
   - [ ] Verify phone field fills
