export interface User {
  id: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface Status {
  id: string;
  name: string;
  color: string;
  is_default?: boolean;
  order?: number;
}

export interface RoundType {
  id: string;
  name: string;
  is_default?: boolean;
}

export interface RoundMedia {
  id: string;
  file_path: string;
  media_type: string;
  uploaded_at: string;
}

export interface Round {
  id: string;
  round_type: RoundType;
  scheduled_at: string | null;
  completed_at: string | null;
  outcome: string | null;
  notes_summary: string | null;
  transcript_path: string | null;
  transcript_summary: string | null;
  media: RoundMedia[];
  created_at: string;
}

export interface Application {
  id: string;
  company: string;
  job_title: string;
  job_description: string | null;
  job_url: string | null;
  status: Status;
  cv_path: string | null;
  cover_letter_path: string | null;
  applied_at: string;
  created_at: string;
  updated_at: string;
  rounds?: Round[];
  // New fields from job lead conversion
  job_lead_id: string | null;
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
}

export interface ApplicationListResponse {
  items: Application[];
  total: number;
  page: number;
  per_page: number;
}

export interface ApplicationCreate {
  company: string;
  job_title: string;
  job_description?: string;
  job_url?: string;
  status_id: string;
  applied_at?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  recruiter_name?: string;
  recruiter_title?: string;
  recruiter_linkedin_url?: string;
  requirements_must_have?: string[];
  requirements_nice_to_have?: string[];
  source?: string;
}

export interface ApplicationUpdate {
  company?: string;
  job_title?: string;
  job_description?: string | null;
  job_url?: string | null;
  status_id?: string;
  applied_at?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  recruiter_name?: string | null;
  recruiter_title?: string | null;
  recruiter_linkedin_url?: string | null;
  requirements_must_have?: string[] | null;
  requirements_nice_to_have?: string[] | null;
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
  scheduled_at?: string;
  completed_at?: string;
  outcome?: string;
  notes_summary?: string;
  transcript_summary?: string;
}

export interface ApplicationStatusHistory {
  id: string;
  from_status: Status | null;
  to_status: Status;
  changed_at: string;
  note: string | null;
}

export type JobLeadStatus = "pending" | "extracted" | "failed";

export interface JobLead {
  id: string;
  title: string | null;
  company: string | null;
  url: string;
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

export interface APIKeyResponse {
  has_api_key: boolean;
  api_key_masked: string | null;
  api_key_full?: string | null;
}
