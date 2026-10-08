import type { InterviewInput, JobFields } from './apiV030';
export const statusMeanings = [
  'unknown',
  'preparing',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
  'no_reply',
] as const;
export type StatusMeaning = (typeof statusMeanings)[number];
type EvidenceProvenance = 'recorded' | 'legacy_unknown';
interface ResponseEvidenceInput {
  occurred_on?: string | null;
  reference?: string | null;
}
export interface HistoryCorrection {
  expected_revision: number;
  from_meaning?: StatusMeaning;
  to_meaning?: StatusMeaning;
  changed_at?: string;
  correction_note?: string | null;
}

export interface User {
  display_name?: string | null;
  id: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface Status {
  builtin_key?: string | null;
  meaning: StatusMeaning;
  id: string;
  name: string;
  color: string;
  is_default?: boolean;
  order?: number;
}

export interface RoundType {
  builtin_key?: string | null;
  id: string;
  name: string;
  is_default?: boolean;
}

export interface RoundMedia {
  id: string;
  original_filename?: string | null;
  sha256?: string | null;
  byte_count?: number | null;
  probed_duration_seconds?: number | null;
  validation?: 'audio_decode_check' | 'imported_unverified' | null;
  file_path: string;
  media_type: string;
  uploaded_at: string;
}

export interface Round extends Omit<InterviewInput, 'round_type_id'> {
  application_id?: string;
  revision?: number;
  updated_at?: string;
  id: string;
  round_type: RoundType;
  scheduled_at: string | null;
  completed_at: string | null;
  outcome: string | null;
  notes_summary: string | null;
  media_generation?: number;
  transcript_generation?: number;
  has_current_transcript?: boolean;
  transcript_path: string | null;
  transcript_original_filename: string | null;
  transcript_summary: string | null;
  media: RoundMedia[];
  created_at: string;
}

export interface Application extends JobFields {
  archived_at?: string | null;
  outcome_reason?: string | null;
  source_text?: string | null;
  source_revision?: number;
  status_meaning: StatusMeaning;
  status_meaning_provenance: EvidenceProvenance;
  evidence_revision: number;
  response_state: 'recorded' | 'not_recorded' | 'legacy_unknown';
  response_occurred_on: string | null;
  response_recorded_at: string | null;
  response_reference: string | null;
  id: string;
  company: string;
  job_title: string;
  job_description: string | null;
  job_url: string | null;
  status: Status;
  cv_path: string | null;
  cover_letter_path: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  rounds?: Round[];
  job_lead_id: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  recruiter_name: string | null;
  recruiter_title: string | null;
  recruiter_linkedin_url: string | null;
  requirements_must_have: string[];
  requirements_nice_to_have: string[];
  skills: string[];
  years_experience_min: number | null;
  years_experience_max: number | null;
  source: string | null;
}

export interface ApplicationSummary extends Omit<Application, 'rounds'> {
  round_count: number;
}

export interface ApplicationListResponse {
  items: ApplicationSummary[];
  total: number;
  page: number;
  per_page: number;
}

export interface ApplicationCreate extends JobFields {
  response_evidence?: ResponseEvidenceInput | null;
  company: string;
  job_title: string;
  job_description?: string;
  job_url?: string;
  status_id: string;
  applied_at?: string | null;
  location?: string | null;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  recruiter_name?: string;
  recruiter_title?: string;
  recruiter_linkedin_url?: string;
  requirements_must_have?: string[];
  requirements_nice_to_have?: string[];
  skills?: string[];
  years_experience_min?: number | null;
  years_experience_max?: number | null;
  source?: string;
}

export interface ApplicationUpdate extends JobFields {
  archived?: boolean;
  status_changed_at?: string;
  status_comment?: string | null;
  status_reason?: string | null;
  expected_revision?: number;
  response_evidence?: ResponseEvidenceInput | null;
  company?: string;
  job_title?: string;
  job_description?: string | null;
  job_url?: string | null;
  status_id?: string;
  applied_at?: string | null;
  location?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  recruiter_name?: string | null;
  recruiter_title?: string | null;
  recruiter_linkedin_url?: string | null;
  requirements_must_have?: string[] | null;
  requirements_nice_to_have?: string[] | null;
  skills?: string[] | null;
  years_experience_min?: number | null;
  years_experience_max?: number | null;
  source?: string | null;
}

export interface RoundCreate {
  round_type_id: string;
  scheduled_at?: string;
  notes_summary?: string;
  transcript_summary?: string;
}

export interface RoundUpdate {
  round_type_id?: string;
  scheduled_at?: string | null;
  completed_at?: string | null;
  outcome?: string | null;
  notes_summary?: string | null;
  transcript_summary?: string | null;
}

export interface ApplicationStatusHistory {
  from_meaning: StatusMeaning | null;
  to_meaning: StatusMeaning | null;
  from_meaning_provenance: EvidenceProvenance;
  to_meaning_provenance: EvidenceProvenance;
  time_provenance: EvidenceProvenance;
  corrected_at: string | null;
  correction_note: string | null;
  id: string;
  from_status: Status | null;
  to_status: Status | null;
  is_gap: boolean;
  changed_at: string;
  note: string | null;
  reason?: string | null;
}

type JobLeadStatus =
  'pending' | 'processing' | 'extracted' | 'failed' | 'converted';

export interface JobLead extends JobFields {
  decision?: 'interesting' | 'rejected' | 'archived' | null;
  updated_at?: string;
  content_warning_code?: string | null;
  error_code?: string | null;
  id: string;
  source_text: string | null;
  source_truncated: boolean;
  content_warning: string | null;
  revision: number;
  processing_started_at: string | null;
  manual_fields: string[];
  title: string | null;
  company: string | null;
  url: string | null;
  status: JobLeadStatus;
  description: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  recruiter_name: string | null;
  recruiter_title: string | null;
  recruiter_linkedin_url: string | null;
  requirements_must_have: string[];
  requirements_nice_to_have: string[];
  skills: string[];
  years_experience_min: number | null;
  years_experience_max: number | null;
  source: string | null;
  posted_date: string | null;
  scraped_at: string;
  converted_to_application_id: string | null;
  error_message: string | null;
}

export interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  city: string | null;
  country: string | null;
  authorized_to_work: string | null;
  requires_sponsorship: boolean | null;
}

export interface APIKey {
  id: string;
  label: string;
  preset: string;
  scopes: string[];
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface APIKeyCreateResponse extends APIKey {
  api_key: string;
}
