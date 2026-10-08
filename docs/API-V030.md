# API 0.3 contract

All paths start with `/api`. Authentication, pagination and error envelopes follow the existing API. A foreign-owner identifier returns 404, also for administrators. New workspace routes require a session JWT. Existing scoped API-key routes remain available. New editable records have `revision` (starts at 0); PATCH and relation PUT require `expected_revision`. Stale writes return 409. Existing application writes use `evidence_revision` as their revision. Responses contain ISO dates and UTC ISO timestamps. Lists return `{items, total, page, per_page}`; default page 1, per_page 25, maximum 100. DELETE takes `expected_revision` as a query parameter for new records. Errors: 401 authentication, 403 authority, 404 missing record, 409 stale/conflict, 422 invalid input, 429 rate limit.

Shared TypeScript contracts and fetch helpers: `frontend/src/lib/apiV030.ts`. Existing endpoints retain existing fields. Optional fields in PATCH are unchanged when absent; null clears nullable fields.

## Accounts

- POST `/auth/register`: `{email,password}` → 202 `{message:"Request sent"}`. Same response for an existing email. No tokens. Before setup: 409. Registration is rate limited.
- POST `/auth/login`: existing token shape. Correct password for pending account → 403 `account_pending`; deactivated → 403 `account_deactivated`. Successful password login records `last_login_at`.
- GET `/auth/me`: existing user plus `approval_pending:boolean`, `last_login_at:string|null`, `can_delete_account:boolean`.
- DELETE `/auth/me`: `{current_password:string,confirm:boolean}` → 204. JWT only. Wrong password/unchecked confirmation: 400. Last active administrator: 409.
- GET `/admin/users`: adds `state=all|pending|active|inactive`; rows add `approval_pending,last_login_at`.
- PATCH `/admin/users/{id}`: existing fields plus `approval_pending:false`; `{is_active:true,approval_pending:false}` approves. DELETE existing endpoint rejects pending requests.
- GET `/admin/stats`: adds `pending_users:number`.

## Profile

GET/PUT `/profile` retain personal and compatibility fields. PUT adds optional `expected_revision`, `ai_permissions:Record<string,boolean>` and the following fields. Responses include `revision,permission_revision`.

`display_name:string|null`, `desired_positions:string[]`, `fields_of_work:string[]`, `seniority:string|null`, `work_modes:string[]`, `employment_types:string[]`, `years_experience:number|null`, `location_restrictions:string|null`, `skill_items:ProfileItem[]`, `technologies:ProfileItem[]`, `projects:ProfileItem[]`, `certificates:ProfileItem[]`, `languages:ProfileItem[]`. Existing `work_history` and `education` hold stable-ID objects. `skills:string[]` is the compatibility projection of `skill_items`.

`ProfileItem = {id:UUID,...entry fields}`. New entries may omit id; the server assigns it. Work: title, company, start_date, end_date, current, description. Project: name, kind, description, technologies, link. Education: institution, degree, field, start_date, end_date. Certificate: name, issuer, date, link. Language: name, level. Skill/technology: name. Unknown legacy keys are retained. New items and sections are allowed by default. Map keys are section names or item UUIDs. Personal fields never reach AI. Sections: `job_preferences,work_authorization,skills,work_history,projects,education,certificates,languages`. Content edits retain permission. Import disables permissions.

## Companies and contacts

`Company = {id,user_id,name,website,industry,location,size,description,culture_notes,revision,created_at,updated_at}`; text fields except name are nullable. Size: `1-10|11-50|51-200|201-1000|1000+`.

`Contact = {id,user_id,name,function,email,phone,profile_url,role,last_contact_on,communication_note,company_id,revision,created_at,updated_at}`. All except name/identity/revision/timestamps nullable.

- GET/POST `/companies`; GET/PATCH/DELETE `/companies/{id}`. Create requires name. List params: query,industry,sort=name|activity|applications,page,per_page. List rows add `lead_count,application_count,contact_count`. Detail adds `contacts,leads,applications` as bounded relation lists (use list filters for further pages).
- GET/POST `/contacts`; GET/PATCH/DELETE `/contacts/{id}`. Create requires name. List params: query,company_id,role,page,per_page. Detail adds `applications,rounds` as bounded relation lists.
- PUT `/applications/{id}/contacts`, PUT `/rounds/{id}/contacts`: `{contact_ids:string[],expected_revision:number}` → `{contact_ids,revision}`. GET same paths → same shape.
- Lead PATCH accepts `recruiter_contact_id`; application PATCH accepts `recruiter_contact_id`. Both accept `company_id`. Existing text snapshots remain.

## Notes and reminders

Target fields: `lead_id,application_id,company_id,contact_id,round_id`, each UUID|null. Notes require exactly one; reminders allow at most one. Target ownership is checked on create and edit.

`Note = {id,user_id,body,...targets,revision,created_at,updated_at}`.
- GET `/notes?target_type=lead|application|company|contact|round&target_id=UUID&page&per_page`; POST `/notes` body `{body,...one target}`; PATCH `/notes/{id}` body `{body,expected_revision}`; DELETE `/notes/{id}?expected_revision`.

Reminder kinds: `application_deadline|reply_to_company|interview|interview_preparation|task_submission|recruiter_follow_up|expected_feedback`.
`Reminder = {id,user_id,kind,title,note,due_at,time_zone,state,completed_at,intent_id,...targets,revision,created_at,updated_at}`. State: `open|done|dismissed`.
- GET `/reminders`: target_type,target_id,kind,state,due_from,due_to,overdue,page,per_page.
- POST `/reminders`: `{kind,title,note?,due_at:ISO-with-offset,time_zone?:IANA,intent_id:UUID,...target?}`. User zone is used if absent. Alternative date/time input: `{due_date:YYYY-MM-DD,due_time:HH:mm,...}`. Nonexistent local time → 422; ambiguous time requires an offset-bearing due_at. Identical intent retry returns existing reminder; differing payload → 409.
- PATCH `/reminders/{id}`: editable fields, state, expected_revision. DELETE same path.
- GET `/tasks`: state,kind,page,per_page → `{items:Reminder[],total,page,per_page,deadlines:Deadline[],badge:{due_today,overdue,total}}`. Deadline: `{id,target_type,title,due_at}`.

Notes and reminder private text are not AI inputs.

## Leads and applications

Shared new fields: `company_id,recruiter_contact_id,work_mode,employment_type,seniority,deadline,pay_period,priority,tags`. Work mode `office|hybrid|remote|other`; employment `full_time|part_time|contract|internship|temporary|other`; pay period `hour|day|week|month|year|other`; priority `low|normal|high` (normal default); tags string[]. Others nullable. Confirmed requirement storage: `confirmed_requirements:object[]`, `requirements_revision:number`; review publication is owned by the analysis API.

Lead create accepts nullable URL and manual fields `title,company,company_id,location,work_mode` plus existing text/html. Without URL/text, title is required. Lead response/list adds shared fields, `decision:null|interesting|rejected|archived`, `updated_at`. Existing PATCH remains revision guarded and also accepts nullable `url`. Conversion copies metadata and contact links. URL uniqueness is owner-scoped only when URL is set.

Application responses add shared fields, `archived_at:string|null,outcome_reason:string|null`. PATCH accepts `archived:boolean`, `status_changed_at:ISO`, `status_comment:string|null`, `status_reason:string|null`, and expected_revision. The status/history/comment/reason change is atomic. Current reason clears on a non-terminal move. Preparing is a built-in status before Applied. Applied remains the default choice; nullable applied_at is allowed for Preparing only.

Both GET list endpoints add: company_id,location,work_mode,employment_type,seniority,priority,tags (repeatable),date_field,date_from,date_to,show_archived. Existing query/status_id/source/sort/page/per_page remain. Lead adds decision; hides rejected/archived by default. Application hides archived by default. Date fields: leads added|posted|deadline|updated; applications applied|created|updated|deadline.

- PUT `/job-leads/{id}/source`, PUT `/applications/{id}/source`: `{text:string,expected_revision:number}` → record. Maximum 100000 characters; no truncation.
- POST corresponding `/fetch-source`: no body → `{text,url,truncated,warning}`. Preview only; does not change saved source or run AI.
- GET `/applications/board`: same application filters, page/per_page → `{columns:[{status_id,count,items:ApplicationSummary[],page,per_page}]}`. Use existing application PATCH for moves.

## Other documents

`Attachment = {id,user_id,application_id,kind,original_filename,media_type,byte_count,uploaded_at}`. Kind `portfolio|task|solution|other`.
- GET `/applications/{id}/attachments` → Attachment[].
- POST same path multipart `file,kind` → Attachment, 201.
- GET `/attachments/{id}` → attachment download (authenticated).
- DELETE `/attachments/{id}` → 204. The reference is removed immediately. Existing offline CAS maintenance reclaims unreferenced bytes; shared bytes are never unlinked by a record delete. Archives carry metadata and bytes. These documents are not AI inputs.

## Interviews and dashboard

Round create/update/response adds `revision,updated_at,time_zone,duration_minutes,mode,location,meeting_url,preparation,questions_answers,impressions,task_description,task_deadline,next_steps,expected_reply_on,contact_ids`. Mode `onsite|video|phone|other`. Preparation object keys: `review_topics,technical_topics,practice_questions,company_questions,examples,profile_gaps,plan`, each string[]. Q&A: `{question,answer}[]`. Duration 1–1440. Existing transcript/media endpoints unchanged. Round PATCH accepts expected_revision.

- GET `/rounds/{id}` → existing RoundResponse plus application_id,company,job_title and new fields.
- GET `/rounds?from=ISO&to=ISO&state=upcoming|completed|all&page&per_page` → paged rounds with application context.
- GET `/dashboard/overview` → `{pipeline:[{status_id,name,color,count}],upcoming_interviews:Round[],tasks:Reminder[],deadlines:Deadline[],recent_applications:Application[],badge:{due_today,overdue,total}}`. Upcoming limited to 5, recent to 5, tasks overdue/next 7 days (bounded).

## Analytics

Existing period,as_of,Time-Zone contract is retained. New data is deterministic and works without AI.
- GET `/analytics/breakdowns?period=7d|30d|3m|all&as_of=ISO` → `{first_response:{mean_days:number|null,n:number,unknown_count:number},rejected_count:number,current_phases:[{meaning,count}],outcomes_by_source:[{source,sent,interview,offer,rejected,withdrawn}],top_positions:[{label,count}],top_technologies:[{label,count}],stage_averages:[{meaning,mean_days,n}],as_of:string}`. Sent cohorts exclude Preparing. Current counts exclude archived. Frequencies trim/case-fold, one count per application. Reached outcomes count distinct applications by cutoff.
- GET `/analytics/history?period&as_of&page&per_page` → paged `{id,event,occurred_at,application_id,round_id,target_type,target_id}`. Status/round events plus new audited create/edit/note/reminder actions. No private text or IP addresses.

Breakdowns also return `repeated_requirements` and `missing_evidence`, each `{items:[{label,count}],denominator}`. Repeated requirements use confirmed requirement text, once per application. A missing matrix is unknown, never missing evidence. The analysis worker must pass current saved matrices to `app/services/requirement_insights.py::requirement_insights` when it adds analysis persistence; until then the missing-evidence denominator is zero.

Analysis integration: `app/services/profile_items.py::allowed_profile` is the shared item/section selector. Personal details are excluded. Use profile `revision` and `permission_revision`, target `confirmed_requirements` and `requirements_revision`, and the seven `Round.preparation` lists. Imported profile permissions are disabled. Old reports are verified locally against restored content, retained as stale data with empty fingerprints, and never reused as AI input while imported. The analysis worker owns analysis rows, saved-matrix lookup and publication.

All new entities and fields participate in personal archives, identifier remapping and deletion. Imported profile permissions are denied; imported analysis data is inert. Existing API routes remain available.
