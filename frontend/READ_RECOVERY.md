# Read recovery

## Policy

`src/lib/readRecovery.ts` is the shared read policy. `queryClient.ts` applies it to React Query and `observeRead` applies it to local-state loaders without changing their forms or mutation handlers.

- Network failures, timeouts, and HTTP 408/429/502/503/504 get three retries after 1, 2, and 4 seconds. `Retry-After` takes priority (1–60 seconds).
- Failed transient reads recover on window focus, tab visibility, or reconnect, even with cached data. Successful reads refetch only when stale.
- After retries are used, an active visible error retries after 10 seconds (or the longer `Retry-After`). This also covers a server restart while the tab stays open. Hidden/offline queries pause through React Query.
- Other errors do not retry or poll. In particular, 4xx responses do not make a refetch loop. HTTP 401 goes through the single-flight session refresh first.
- Data GET/HEAD requests have a 10-second timeout. File downloads and writes keep their existing timeout behaviour. React Query mutations never retry. There is no transport-level retry of POST, PUT, PATCH, DELETE, uploads, or AI requests.
- Existing manual retry controls stay available. A successful read clears its load error.
- Editable profile, round, transcript, document-text, and first-run drafts use infinite stale time. Failed reads recover, but focus does not replace a successfully loaded draft. Explicit reload/revision changes still work.

## Data-load inventory

Paths below are under `frontend/src`. Static rendering and effects that only update local state are not server data loads.

### Existing React Query reads

| Owner                                      | Reads                                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/useAnalyticsData.ts`                | Analytics KPIs, weekly activity, Sankey pipeline, activity heatmap, interview rounds (funnel, outcomes, timeline)                         |
| `hooks/useDashboardData.ts`                | Dashboard KPIs and needs-attention list                                                                                                   |
| `hooks/useUserPreferences.ts`              | User preferences, including feature toggles and time zone used in settings and round/history forms                                        |
| `hooks/useFeedback.ts`                     | Saved pipeline, application, and interview feedback; status polling for a running job. Only the separate explicit POST starts processing. |
| `components/application/HistoryViewer.tsx` | Application status history                                                                                                                |
| `components/dashboard/FlameEmblem.tsx`     | Streak and static flame animation JSON                                                                                                    |

### Local-state reads now observed with the same policy

These still use their existing state and effect cleanup. `observeRead` registers a React Query observer for the GET-only loader and removes it on unmount or dependency change. Request-generation and draft guards remain in place.

| Owner                                        | Reads                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `contexts/AuthContext.tsx`                   | Setup status and current user; transient failures keep tokens and do not sign out |
| `pages/Login.tsx`, `pages/Register.tsx`      | Setup-status GET only; password and submit logic unchanged                        |
| `pages/Dashboard.tsx`                        | Application count and empty-state check                                           |
| `pages/Applications.tsx`                     | Application list, status filter choices, source filter choices                    |
| `pages/JobLeads.tsx`                         | Job lead list and source filter choices                                           |
| `pages/ApplicationDetail.tsx`                | Application and its rounds/documents                                              |
| `pages/JobLeadDetail.tsx`                    | Saved job lead                                                                    |
| `pages/Admin.tsx`                            | User list, admin totals, AI configuration (not processing)                        |
| `components/settings/SettingsProfile.tsx`    | Profile form                                                                      |
| `components/settings/SettingsAPIKey.tsx`     | Saved API key list                                                                |
| `components/settings/SettingsStatuses.tsx`   | Status definitions                                                                |
| `components/settings/SettingsRoundTypes.tsx` | Round type definitions                                                            |
| `components/ApplicationModal.tsx`            | Status choices                                                                    |
| `components/RoundForm.tsx`                   | Round type choices                                                                |
| `components/MediaPlayer.tsx`                 | Signed playback URL                                                               |
| `components/DocumentTextFallback.tsx`        | Saved CV/cover-letter text                                                        |
| `components/TranscriptEditor.tsx`            | Saved transcript                                                                  |
| `components/TranscriptionPanel.tsx`          | Speech capability and existing transcription jobs; active-job GET polling only    |

### Explicit actions, not mount/focus loaders

These are not registered for automatic focus replay. A focus event must not open another file, discard a draft, repeat a download, or restart a job.

| Owner                                                                                           | Read/action boundary                                                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `components/DocumentSection.tsx`, `components/RoundCard.tsx`, `components/TranscriptEditor.tsx` | Signed document/media/transcript downloads after a click                                                      |
| `components/application/HistoryEvidenceDetails.tsx`                                             | Explicit reload of application/history after confirmation to discard a draft                                  |
| `pages/ApplicationDetail.tsx`, `pages/JobLeadDetail.tsx`                                        | One-time authoritative reads after a user mutation; the page loader remains observed                          |
| `pages/Admin.tsx`                                                                               | Explicit local speech readiness check                                                                         |
| `components/settings/SettingsExport.tsx`, `lib/export.ts`                                       | Start ZIP export, check that job, and download ZIP/JSON/CSV                                                   |
| `components/ImportModal.tsx`, `lib/import.ts`                                                   | Explicit validation/upload, SSE progress, and manual status check after an uncertain import; no upload replay |
| `lib/themePreferences.ts`, `contexts/ThemeContext.tsx`                                          | Static `/tree.svg` used for the favicon after a theme change; no page data or error card                      |

All API reads use the same token refresh. File downloads are not cut short by the data-read timeout. The one-shot action flows above retain their existing manual error controls.

## Session boundary

`api.ts` shares an in-flight refresh across fetch and Axios. A late 401 for an old access token uses the token already refreshed by another request; it does not rotate the refresh token again. Refresh failures keep tokens except for a rejected/missing refresh credential. A transient refresh failure reaches the read retry policy.

`entrypoint.sh` already stores the signing key in `/app/data/.secret_key` and loads it on restart. No backend or signing-key change is needed.

## Checks

- `lib/readRecovery.test.ts`: retry/backoff, terminal 4xx, write exclusion, focus, reconnect, visible recovery interval, unmount cleanup, and draft protection.
- `components/analytics/AnalyticsRecovery.test.tsx`: real Analytics KPI hook/card goes from exhausted error to data on focus, with no click and no POST.
- `contexts/AuthContextRecovery.test.tsx`: startup outage keeps credentials and focus restores the user.
- `lib/api.test.ts`: concurrent and late 401s share one refresh; a temporary refresh failure keeps the session.
