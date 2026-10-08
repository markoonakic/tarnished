# Frontend 0.3 slot map

Paths are relative to `frontend/src`. Replace the assigned file, not another worker's slot. All slots currently return null. Pages are temporary shells; disabled create buttons cannot save data. Keep legacy features until the replacement is ready.

## Feature pages

| File                      | Worker                   | Route                                           |
| ------------------------- | ------------------------ | ----------------------------------------------- |
| pages/Profile.tsx         | Accounts and profile     | /profile (old /settings/profile redirects here) |
| pages/Companies.tsx       | Companies and contacts   | /companies and /contacts (one tabbed page)      |
| pages/CompanyDetail.tsx   | Companies and contacts   | /companies/:id                                  |
| pages/ContactDetail.tsx   | Companies and contacts   | /contacts/:id                                   |
| pages/Tasks.tsx           | Interviews and reminders | /tasks (view=interviews selects calendar)       |
| pages/InterviewDetail.tsx | Interviews and reminders | /interviews/:id                                 |

## Application detail

Each slot receives `{application, onUpdated?}`. The callback reloads the current record after a saved change. Order: existing header → extraction review → profile match → existing feedback when opened → rounds → contacts → reminders → notes → documents (other files inside) → status history.

| File (components/slots/)        | Worker                                |
| ------------------------------- | ------------------------------------- |
| ApplicationExtractionReview.tsx | Grounded extraction and profile match |
| ApplicationProfileMatch.tsx     | Grounded extraction and profile match |
| ApplicationContacts.tsx         | Companies and contacts                |
| ApplicationReminders.tsx        | Interviews and reminders              |
| ApplicationNotes.tsx            | Companies, contacts and shared notes  |
| ApplicationOtherFiles.tsx       | Leads, applications and attachments   |

DocumentSection accepts optional children for Other files; CV and cover letter stay unchanged.

## Lead detail

Each slot receives `{lead, onUpdated?}`. Order: decision inside header → details → saved posting → extraction review → profile match → contacts → reminders → notes. Existing description and requirements remain visible in the header until the leads worker updates that layout.

| File (components/slots/) | Worker                                |
| ------------------------ | ------------------------------------- |
| LeadDecision.tsx         | Leads, applications and attachments   |
| LeadDetails.tsx          | Leads, applications and attachments   |
| LeadExtractionReview.tsx | Grounded extraction and profile match |
| LeadProfileMatch.tsx     | Grounded extraction and profile match |
| LeadContacts.tsx         | Companies and contacts                |
| LeadReminders.tsx        | Interviews and reminders              |
| LeadNotes.tsx            | Companies, contacts and shared notes  |

## Dashboard, analytics and applications

| File (components/slots/)   | Placement                                                        | Worker                                   |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| DashboardPipelineStrip.tsx | After KPI cards; also present with no applications               | Interviews, reminders and dashboard      |
| DashboardUpcomingRow.tsx   | Before existing attention row; also present with no applications | Interviews, reminders and dashboard      |
| DashboardBoard.tsx         | Before activity heatmap; also present with no applications       | Leads, applications and board            |
| AnalyticsNewKpis.tsx       | After existing KPIs, before pipeline chart                       | Deterministic analytics                  |
| AnalyticsBreakdowns.tsx    | After pipeline, before interview charts                          | Deterministic analytics                  |
| AnalyticsActivity.tsx      | After existing activity charts                                   | Deterministic analytics                  |
| AnalyticsAiInsights.tsx    | After activity                                                   | Grounded extraction and process insights |
| ApplicationsViewSwitch.tsx | Left of New Application                                          | Leads, applications and board            |

Dashboard slots take no props. Analytics slots receive `{period, asOf?}`. ApplicationsViewSwitch receives `{view, onChange}`; view is list or board and changes the URL without dropping filters. The board worker controls list/board content in Applications.tsx.

## Shared component contracts

- Area translations: add flat-key JSON files in locales/areas/<feature>.en.json and <feature>.sr-Latn.json. import.meta.glob loads and merges them automatically. Do not edit the shared dictionaries or kit files for feature strings. Use unique feature-prefixed keys.
- SegmentedControl: options, value, onChange, label; native grouped radios handle keyboard selection.
- Card/CardHeader: title, icon (Bootstrap class), count, actions, children. CollapsibleCard adds defaultOpen or controlled open/onOpenChange.
- TagInput: value:string[], onChange, label, optional id/disabled/placeholder.
- AiToggle/AiCheckbox: checked, onChange, optional disabled/label.
- KindPill uses all seven API kind identifiers from lib/uiPills.ts. ResultPill uses confirmed/partial/no_evidence/unknown.
- NotesPanel: notes with id/body/created_at/updated_at; onAdd(body), onEdit(id,body), onDelete(id). Async saves keep the draft on errors. Callbacks absent means read-only. Feature callbacks handle owner scope, revision and delete confirmation.
- RemindersCard: reminders with id/kind/title/due_at/state; onAdd(), onEdit(item), onToggle(item), onDismiss(item), onDelete(item); optional timeZone/now. Optional dueText and relatedLabel support caller formatting. Callbacks absent means read-only.
- ReminderModal: isOpen, initial {kind,title,due_date,due_time,note}, editing, relatedLabel or relatedPicker, onSave(draft), onClose. Time defaults to 09:00; the feature supplies the user's zone to the API. No zone field.
- StatusChangeDialog: isOpen, options {value,label,meaning}, statusId, timeZone, initial, onSave, onClose. Saves {status_id,changed_at,comment,reason}; changed_at is an offset-bearing UTC instant. Only rejected/withdrawn meanings display a reason. Existing time helpers reject nonexistent and ambiguous local times.
- SearchableCombobox: existing props plus onCreate(name). Create is last, appears only for a non-empty new name, and calls onCreate instead of onChange. Caller creates and selects the returned record.
- ContactRow: name/href/subtitle/role/roleColor/email/phone/lastContact/onUnlink. EntryRow: title/subtitle/aiAllowed/aiDisabled/onAiChange/onEdit/onDelete. Callers translate built-in roles, never user content.
- MonthGrid: month:Date, events {id,date:YYYY-MM-DD,label,href?,outcome?}, reminderDates:string[], onMonthChange, onDayClick, optional onEventClick/headerActions/today/maxEvents. Monday first with real calendar dates; limit chips with a more link. Hide it on mobile and use a week list.
- TasksBadge: optional count/overdue props; defaults to hooks/useTasksBadge.ts. The reminders worker replaces that no-request hook with the live count. Zero is hidden.

All shared components are prop-driven and make no API calls. There are no new persisted fields, tables, migrations, or archive changes in this foundation package.
