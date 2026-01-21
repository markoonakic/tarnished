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
  applied_at: string;
  created_at: string;
  updated_at: string;
  rounds?: Round[];
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
}

export interface ApplicationUpdate {
  company?: string;
  job_title?: string;
  job_description?: string;
  job_url?: string;
  status_id?: string;
  applied_at?: string;
}

export interface RoundCreate {
  round_type_id: string;
  scheduled_at?: string;
  notes_summary?: string;
}

export interface RoundUpdate {
  round_type_id?: string;
  scheduled_at?: string;
  completed_at?: string;
  outcome?: string;
  notes_summary?: string;
}
