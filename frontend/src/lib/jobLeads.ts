import api from './api';
import type { Application, JobLead } from './types';

interface JobLeadsParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: 'pending' | 'extracted' | 'failed';
  source?: string;
  sort?: 'newest' | 'oldest';
}

interface JobLeadsListResponse {
  items: JobLead[];
  total: number;
  page: number;
  per_page: number;
}

interface JobLeadSourcesResponse {
  sources: string[];
}

/**
 * List job leads for the authenticated user with pagination and filtering.
 */
export async function getJobLeads(
  params: JobLeadsParams = {}
): Promise<JobLeadsListResponse> {
  const response = await api.get('/api/job-leads', { params });
  return response.data;
}

/**
 * Get a single job lead by ID.
 */
export async function getJobLead(id: string): Promise<JobLead> {
  const response = await api.get(`/api/job-leads/${id}`);
  return response.data;
}

export async function getJobLeadSources(): Promise<string[]> {
  const response = await api.get<JobLeadSourcesResponse>(
    '/api/job-leads/sources'
  );
  return response.data.sources;
}

/**
 * Delete a job lead by ID.
 */
export async function deleteJobLead(id: string): Promise<void> {
  await api.delete(`/api/job-leads/${id}`);
}

/**
 * Retry extraction for a failed job lead.
 */
export async function retryJobLead(id: string): Promise<JobLead> {
  const response = await api.post(`/api/job-leads/${id}/retry`);
  return response.data;
}

/**
 * Convert a job lead to an application.
 */
export async function convertToApplication(id: string): Promise<Application> {
  const response = await api.post<Application>(`/api/job-leads/${id}/convert`);
  return response.data;
}
