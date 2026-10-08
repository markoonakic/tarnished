import api, { withAxiosTimeZoneHeaders } from './api';
import { queryClient } from './queryClient';

export type ID = string;
export type ISODate = string;
export type ISODateTime = string;
export type Revision = { expected_revision: number };
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}
export interface PageQuery {
  page?: number;
  per_page?: number;
}
export interface OwnedRecord {
  id: ID;
  user_id: ID;
  revision: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
export type TargetType =
  'lead' | 'application' | 'company' | 'contact' | 'round';
export interface Target {
  lead_id?: ID | null;
  application_id?: ID | null;
  company_id?: ID | null;
  contact_id?: ID | null;
  round_id?: ID | null;
}
export interface TargetQuery extends PageQuery {
  target_type?: TargetType;
  target_id?: ID;
}

export interface CompanyInput {
  name: string;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  size?: '1-10' | '11-50' | '51-200' | '201-1000' | '1000+' | null;
  description?: string | null;
  culture_notes?: string | null;
}
export interface Company extends OwnedRecord, CompanyInput {
  lead_count?: number;
  application_count?: number;
  contact_count?: number;
}
export interface CompanyDetail extends Company {
  contacts: Contact[];
  leads: Lead[];
  applications: ApplicationRecord[];
}
export interface CompanyQuery extends PageQuery {
  query?: string;
  industry?: string;
  sort?: 'name' | 'activity' | 'applications';
}
export type CompanyUpdate = Partial<CompanyInput> & Revision;
export interface ContactInput {
  name: string;
  function?: string | null;
  email?: string | null;
  phone?: string | null;
  profile_url?: string | null;
  role?: string | null;
  last_contact_on?: ISODate | null;
  communication_note?: string | null;
  company_id?: ID | null;
}
export interface Contact extends OwnedRecord, ContactInput {}
export interface ContactDetail extends Contact {
  company: Company | null;
  applications: ApplicationRecord[];
  rounds: Interview[];
}
export interface ContactQuery extends PageQuery {
  query?: string;
  company_id?: ID;
  role?: string;
}
export type ContactUpdate = Partial<ContactInput> & Revision;
export interface ContactLinks {
  contact_ids: ID[];
  revision: number;
}
export type ContactLinksInput = Pick<ContactLinks, 'contact_ids'> & Revision;
export type NoteInput = Target & { body: string };
export interface Note extends OwnedRecord, Target {
  body: string;
}
export type NoteUpdate = { body: string } & Revision;

export type ReminderKind =
  | 'application_deadline'
  | 'reply_to_company'
  | 'interview'
  | 'interview_preparation'
  | 'task_submission'
  | 'recruiter_follow_up'
  | 'expected_feedback';
export type ReminderState = 'open' | 'done' | 'dismissed';
export interface ReminderFields extends Target {
  kind: ReminderKind;
  title: string;
  note?: string | null;
  due_at?: ISODateTime;
  due_date?: ISODate;
  due_time?: string;
  time_zone?: string;
}
export interface ReminderInput extends ReminderFields {
  intent_id: ID;
}
export interface Reminder extends OwnedRecord, Target {
  kind: ReminderKind;
  title: string;
  note: string | null;
  due_at: ISODateTime;
  time_zone: string;
  state: ReminderState;
  completed_at: ISODateTime | null;
  intent_id: ID;
}
export type ReminderUpdate = Partial<ReminderFields> & {
  state?: ReminderState;
} & Revision;
export interface ReminderQuery extends TargetQuery {
  kind?: ReminderKind;
  state?: ReminderState;
  due_from?: ISODateTime;
  due_to?: ISODateTime;
  overdue?: boolean;
}
export interface Badge {
  due_today: number;
  overdue: number;
  total: number;
}
export interface Deadline {
  id: ID;
  target_type: TargetType;
  title: string;
  due_at: ISODateTime;
  kind?: ReminderKind;
}
export interface Tasks extends Page<Reminder> {
  deadlines: Deadline[];
  badge: Badge;
}
export interface TasksQuery extends PageQuery {
  state?: 'open' | 'done' | 'all';
  kind?: ReminderKind;
}

export type WorkMode = 'office' | 'hybrid' | 'remote' | 'other';
export type EmploymentType =
  'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'other';
export type PayPeriod = 'hour' | 'day' | 'week' | 'month' | 'year' | 'other';
export type Priority = 'low' | 'normal' | 'high';
export type LeadDecision = 'interesting' | 'rejected' | 'archived';
export interface JobFields {
  company_id?: ID | null;
  recruiter_contact_id?: ID | null;
  work_mode?: WorkMode | null;
  employment_type?: EmploymentType | null;
  seniority?: string | null;
  deadline?: ISODate | null;
  pay_period?: PayPeriod | null;
  priority?: Priority;
  tags?: string[];
}
export interface ConfirmedRequirement {
  id: ID;
  text: string;
  type?: string;
  level?: string;
  quote?: string;
  [key: string]: unknown;
}
export interface LeadInput extends JobFields {
  url?: string | null;
  text?: string | null;
  html?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
}
export interface Lead extends JobFields {
  id: ID;
  user_id: ID;
  title: string | null;
  company: string | null;
  location: string | null;
  url: string | null;
  status: string;
  decision: LeadDecision | null;
  revision: number;
  scraped_at: ISODateTime;
  updated_at: ISODateTime;
  source_text: string | null;
  source_truncated: boolean;
  content_warning: string | null;
  source: string | null;
  confirmed_requirements: ConfirmedRequirement[];
  requirements_revision: number;
  converted_to_application_id: ID | null;
}
export type LeadUpdate = Partial<Omit<LeadInput, 'text' | 'html'>> & {
  decision?: LeadDecision | null;
  description?: string | null;
  source?: string | null;
  posted_date?: ISODate | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
} & Revision;
export interface JobQuery extends PageQuery {
  search?: string;
  source?: string;
  company_id?: ID;
  location?: string;
  work_mode?: WorkMode;
  employment_type?: EmploymentType;
  seniority?: string;
  priority?: Priority;
  tags?: string[];
  date_field?:
    'added' | 'posted' | 'deadline' | 'updated' | 'applied' | 'created';
  date_from?: ISODate;
  date_to?: ISODate;
  show_archived?: boolean;
  status_id?: ID;
  status?: string;
  decision?: LeadDecision | 'undecided';
}
export interface ExtractedJobFields {
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  recruiter_name?: string | null;
  recruiter_title?: string | null;
  recruiter_linkedin_url?: string | null;
  requirements_must_have?: string[];
  requirements_nice_to_have?: string[];
  skills?: string[];
  years_experience_min?: number | null;
  years_experience_max?: number | null;
}
export interface ApplicationRecord extends JobFields, ExtractedJobFields {
  id: ID;
  user_id?: ID;
  company: string;
  job_title: string;
  location: string | null;
  job_url: string | null;
  job_description?: string | null;
  applied_at: ISODate | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  status: {
    id: ID;
    name: string;
    color: string;
    meaning: string;
    builtin_key?: string | null;
  };
  evidence_revision: number;
  archived_at: ISODateTime | null;
  outcome_reason: string | null;
  source_text: string | null;
  source_revision: number;
  source?: string | null;
  confirmed_requirements: ConfirmedRequirement[];
  requirements_revision: number;
}
export interface ApplicationInput extends JobFields, ExtractedJobFields {
  company?: string;
  job_title?: string;
  status_id: ID;
  applied_at?: ISODate | null;
  location?: string | null;
  job_url?: string | null;
  job_description?: string | null;
  source?: string | null;
}
export type ApplicationUpdate = Partial<ApplicationInput> &
  Revision & {
    archived?: boolean;
    status_changed_at?: ISODateTime;
    status_comment?: string | null;
    status_reason?: string | null;
  };
export interface BoardCard extends ApplicationRecord {
  round_count: number;
  next_interview_at: ISODateTime | null;
  open_reminder_count: number;
}
export interface BoardColumn {
  status_id: ID;
  count: number;
  items: BoardCard[];
  page: number;
  per_page: number;
}
export interface Board {
  columns: BoardColumn[];
}
export interface SourcePreview {
  text: string;
  url: string;
  truncated: boolean;
  warning: string | null;
}
export type SourceInput = { text: string } & Revision;
export type AttachmentKind = 'portfolio' | 'task' | 'solution' | 'other';
export interface Attachment extends OwnedRecord {
  application_id: ID;
  kind: AttachmentKind;
  original_filename: string;
  media_type: string;
  byte_count: number;
  sha256: string;
  uploaded_at: ISODateTime;
}

export type PreparationKey =
  | 'review_topics'
  | 'technical_topics'
  | 'practice_questions'
  | 'company_questions'
  | 'examples'
  | 'profile_gaps'
  | 'plan';
export type Preparation = Partial<Record<PreparationKey, string[]>>;
export interface QuestionAnswer {
  question: string;
  answer: string;
}
export interface InterviewInput {
  round_type_id: ID;
  scheduled_at?: ISODateTime | null;
  completed_at?: ISODateTime | null;
  outcome?: string | null;
  notes_summary?: string | null;
  transcript_summary?: string | null;
  time_zone?: string | null;
  duration_minutes?: number | null;
  mode?: 'onsite' | 'video' | 'phone' | 'other' | null;
  location?: string | null;
  meeting_url?: string | null;
  preparation?: Preparation;
  questions_answers?: QuestionAnswer[];
  impressions?: string | null;
  task_description?: string | null;
  task_deadline?: ISODateTime | null;
  next_steps?: string | null;
  expected_reply_on?: ISODate | null;
  contact_ids?: ID[];
}
export interface Interview extends Omit<InterviewInput, 'round_type_id'> {
  id: ID;
  application_id: ID;
  revision: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  round_type: { id: ID; name: string; builtin_key?: string | null };
  company: string;
  company_id: ID | null;
  job_title: string;
  media: import('./types').RoundMedia[];
  scheduled_at: ISODateTime | null;
  completed_at: ISODateTime | null;
  outcome: string | null;
  notes_summary: string | null;
  transcript_summary: string | null;
  transcript_path: string | null;
  transcript_original_filename: string | null;
  has_current_transcript: boolean;
  media_generation: number;
  transcript_generation: number;
}
export type InterviewUpdate = Partial<InterviewInput> & Revision;
export interface InterviewQuery extends PageQuery {
  from?: ISODateTime;
  to?: ISODateTime;
  state?: 'upcoming' | 'completed' | 'all';
}
export interface Overview {
  pipeline: {
    status_id: ID;
    name: string;
    color: string;
    builtin_key: string | null;
    count: number;
  }[];
  upcoming_interviews: Interview[];
  tasks: Reminder[];
  deadlines: Deadline[];
  recent_applications: ApplicationRecord[];
  badge: Badge;
}

export interface ProfileItem {
  id: ID;
  name?: string;
  title?: string;
  company?: string;
  description?: string;
  needs_repair?: boolean;
  [key: string]: unknown;
}
export interface Profile {
  id: ID;
  user_id: ID;
  revision: number;
  permission_revision: number;
  ai_permissions: Record<string, boolean>;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
  desired_positions: string[];
  fields_of_work: string[];
  seniority: string | null;
  work_modes: string[];
  employment_types: string[];
  years_experience: number | null;
  authorized_to_work: string | null;
  requires_sponsorship: boolean | null;
  location_restrictions: string | null;
  work_history: ProfileItem[] | null;
  projects: ProfileItem[];
  education: ProfileItem[] | null;
  certificates: ProfileItem[];
  languages: ProfileItem[];
  technologies: ProfileItem[];
  skill_items: ProfileItem[];
  skills: string[] | null;
}
export type ProfileItemInput = Omit<ProfileItem, 'id'> & { id?: ID };
export type ProfileUpdate = Partial<
  Omit<
    Profile,
    | 'id'
    | 'user_id'
    | 'revision'
    | 'permission_revision'
    | 'work_history'
    | 'education'
    | 'projects'
    | 'certificates'
    | 'languages'
    | 'technologies'
    | 'skill_items'
  >
> &
  Revision & {
    work_history?: ProfileItemInput[] | null;
    education?: ProfileItemInput[] | null;
    projects?: ProfileItemInput[];
    certificates?: ProfileItemInput[];
    languages?: ProfileItemInput[];
    technologies?: ProfileItemInput[];
    skill_items?: ProfileItemInput[];
  };
export interface Account {
  can_delete_account: boolean;
  id: ID;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  approval_pending: boolean;
  last_login_at: ISODateTime | null;
}
export interface AdminUser extends Account {
  created_at: ISODateTime;
  application_count: number;
}
export interface AdminUsersQuery extends PageQuery {
  query?: string;
  state?: 'all' | 'pending' | 'active' | 'inactive';
}
export interface AdminStats {
  total_users: number;
  active_users: number;
  pending_users: number;
  total_applications: number;
  applications_this_month: number;
}
export interface AnalyticsQuery {
  period?: '7d' | '30d' | '3m' | 'all';
  as_of?: ISODateTime;
}
export interface Frequency {
  label: string;
  count: number;
}
export interface StageAverage {
  meaning: string;
  mean_days: number;
  mean_hours: number;
  n: number;
}
export interface Breakdown {
  repeated_requirements: { items: Frequency[]; denominator: number };
  missing_evidence: { items: Frequency[]; denominator: number };
  first_response: {
    mean_days: number | null;
    n: number;
    unknown_count: number;
  };
  rejected_count: number;
  current_phases: { meaning: string; count: number }[];
  outcomes_by_source: {
    source: string | null;
    sent: number;
    interview: number;
    offer: number;
    rejected: number;
    withdrawn: number;
  }[];
  top_positions: Frequency[];
  top_technologies: Frequency[];
  stage_averages: StageAverage[];
  as_of: ISODateTime;
}
export interface Activity {
  id: string;
  event: string;
  occurred_at: ISODateTime;
  application_id: ID | null;
  round_id: ID | null;
  target_type: string;
  target_id: ID | null;
}

// Repeated array keys are intentional: FastAPI receives tags=a&tags=b.
export function queryParams(values: object = {}): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    for (const item of Array.isArray(value) ? value : [value])
      query.append(key, String(item));
  }
  return query;
}
const get = async <T>(path: string, params?: object): Promise<T> =>
  (
    await api.get<T>(`/api${path}`, {
      params: queryParams(params),
      headers: withAxiosTimeZoneHeaders(),
    })
  ).data;
const post = async <T>(path: string, data?: unknown): Promise<T> =>
  (
    await api.post<T>(`/api${path}`, data, {
      headers: withAxiosTimeZoneHeaders(),
    })
  ).data;
const patch = async <T>(path: string, data: unknown): Promise<T> =>
  (
    await api.patch<T>(`/api${path}`, data, {
      headers: withAxiosTimeZoneHeaders(),
    })
  ).data;
const put = async <T>(path: string, data: unknown): Promise<T> =>
  (
    await api.put<T>(`/api${path}`, data, {
      headers: withAxiosTimeZoneHeaders(),
    })
  ).data;
const remove = async (path: string, revision?: number): Promise<void> => {
  await api.delete(`/api${path}`, {
    params: queryParams({ expected_revision: revision }),
  });
};
async function reminderWrite<T>(request: Promise<T>): Promise<T> {
  const saved = await request;
  await queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      [
        'reminders',
        'tasks',
        'tasks-badge',
        'dashboard-overview',
        'application-board',
      ].includes(String(queryKey[0])),
  });
  return saved;
}
export const apiV030 = {
  register: (email: string, password: string) =>
    post<{ message: string }>('/auth/register', { email, password }),
  deleteAccount: (current_password: string, confirm: boolean) =>
    api.delete('/api/auth/me', { data: { current_password, confirm } }),
  account: () => get<Account>('/auth/me'),
  adminUsers: (query?: AdminUsersQuery) =>
    get<Page<AdminUser>>('/admin/users', query),
  adminStats: () => get<AdminStats>('/admin/stats'),
  approveUser: (id: ID) =>
    patch<AdminUser>(`/admin/users/${id}`, {
      is_active: true,
      approval_pending: false,
    }),
  rejectUser: (id: ID) => remove(`/admin/users/${id}`),
  profile: () => get<Profile>('/profile'),
  updateProfile: (data: ProfileUpdate) => put<Profile>('/profile', data),
  companies: (query?: CompanyQuery) => get<Page<Company>>('/companies', query),
  company: (id: ID) => get<CompanyDetail>(`/companies/${id}`),
  createCompany: (data: CompanyInput) => post<Company>('/companies', data),
  updateCompany: (id: ID, data: CompanyUpdate) =>
    patch<Company>(`/companies/${id}`, data),
  deleteCompany: (id: ID, revision: number) =>
    remove(`/companies/${id}`, revision),
  contacts: (query?: ContactQuery) => get<Page<Contact>>('/contacts', query),
  contact: (id: ID) => get<ContactDetail>(`/contacts/${id}`),
  createContact: (data: ContactInput) => post<Contact>('/contacts', data),
  updateContact: (id: ID, data: ContactUpdate) =>
    patch<Contact>(`/contacts/${id}`, data),
  deleteContact: (id: ID, revision: number) =>
    remove(`/contacts/${id}`, revision),
  applicationContacts: (id: ID) =>
    get<ContactLinks>(`/applications/${id}/contacts`),
  setApplicationContacts: (id: ID, data: ContactLinksInput) =>
    put<ContactLinks>(`/applications/${id}/contacts`, data),
  roundContacts: (id: ID) => get<ContactLinks>(`/rounds/${id}/contacts`),
  setRoundContacts: (id: ID, data: ContactLinksInput) =>
    put<ContactLinks>(`/rounds/${id}/contacts`, data),
  notes: (query: TargetQuery) => get<Page<Note>>('/notes', query),
  createNote: (data: NoteInput) => post<Note>('/notes', data),
  updateNote: (id: ID, data: NoteUpdate) => patch<Note>(`/notes/${id}`, data),
  deleteNote: (id: ID, revision: number) => remove(`/notes/${id}`, revision),
  reminders: (query?: ReminderQuery) =>
    get<Page<Reminder>>('/reminders', query),
  createReminder: (data: ReminderInput) =>
    reminderWrite(post<Reminder>('/reminders', data)),
  updateReminder: (id: ID, data: ReminderUpdate) =>
    reminderWrite(patch<Reminder>(`/reminders/${id}`, data)),
  deleteReminder: (id: ID, revision: number) =>
    reminderWrite(remove(`/reminders/${id}`, revision)),
  tasks: (query?: TasksQuery) => get<Tasks>('/tasks', query),
  interviews: (query?: InterviewQuery) =>
    get<Page<Interview>>('/rounds', query),
  interview: (id: ID) => get<Interview>(`/rounds/${id}`),
  createInterview: (applicationId: ID, data: InterviewInput) =>
    post<Interview>(`/applications/${applicationId}/rounds`, data),
  updateInterview: (id: ID, data: InterviewUpdate) =>
    patch<Interview>(`/rounds/${id}`, data),
  deleteInterview: (id: ID) => remove(`/rounds/${id}`),
  overview: () => get<Overview>('/dashboard/overview'),
  board: (query?: JobQuery) => get<Board>('/applications/board', query),
  leads: (query?: JobQuery) => get<Page<Lead>>('/job-leads', query),
  createLead: (data: LeadInput) => post<Lead>('/job-leads', data),
  updateLead: (id: ID, data: LeadUpdate) =>
    patch<Lead>(`/job-leads/${id}`, data),
  applications: (query?: JobQuery) =>
    get<Page<ApplicationRecord>>('/applications', query),
  createApplication: (data: ApplicationInput) =>
    post<ApplicationRecord>('/applications', data),
  updateApplication: (id: ID, data: ApplicationUpdate) =>
    patch<ApplicationRecord>(`/applications/${id}`, data),
  replaceLeadSource: (id: ID, data: SourceInput) =>
    put<Lead>(`/job-leads/${id}/source`, data),
  fetchLeadSource: (id: ID) =>
    post<SourcePreview>(`/job-leads/${id}/fetch-source`),
  replaceApplicationSource: (id: ID, data: SourceInput) =>
    put<ApplicationRecord>(`/applications/${id}/source`, data),
  fetchApplicationSource: (id: ID) =>
    post<SourcePreview>(`/applications/${id}/fetch-source`),
  attachments: (id: ID) => get<Attachment[]>(`/applications/${id}/attachments`),
  uploadAttachment: (id: ID, kind: AttachmentKind, file: File) => {
    const data = new FormData();
    data.append('kind', kind);
    data.append('file', file);
    return post<Attachment>(`/applications/${id}/attachments`, data);
  },
  downloadAttachment: async (id: ID): Promise<Blob> =>
    (await api.get<Blob>(`/api/attachments/${id}`, { responseType: 'blob' }))
      .data,
  deleteAttachment: (id: ID) => remove(`/attachments/${id}`),
  breakdowns: (query?: AnalyticsQuery) =>
    get<Breakdown>('/analytics/breakdowns', query),
  activity: (query?: AnalyticsQuery & PageQuery) =>
    get<Page<Activity>>('/analytics/history', query),
};
