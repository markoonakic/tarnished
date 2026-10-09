import api from './api';
import type { MatchResult } from '@/components/ResultPill';
export type AnalysisKind = 'EXTRACTION' | 'PROFILE_MATCH' | 'PREPARATION';
export interface AnalysisTarget {
  lead_id?: string;
  application_id?: string;
  round_id?: string;
}
export interface Proposal {
  id: string;
  field: string;
  value: string | number;
  quote: string;
}
export interface ReviewChoice {
  id: string;
  decision: 'accepted' | 'edited' | 'rejected';
  value?: string | number;
  company_id?: string;
}
export interface ProfileEvidence {
  profile_id: string;
  quote: string;
}
export interface MatchRow {
  requirement_id: string;
  state: MatchResult;
  evidence: ProfileEvidence[];
  why: string;
}
export interface DraftItem {
  id: string;
  text: string;
  requirement_ids: string[];
  evidence: ProfileEvidence[];
}
export const preparationCategories = [
  'review_topics',
  'technical_topics',
  'practice_questions',
  'company_questions',
  'examples',
  'profile_gaps',
  'plan',
] as const;
export type PreparationCategory = (typeof preparationCategories)[number];
export interface Analysis {
  id: string;
  kind: AnalysisKind;
  revision: number;
  target_revision: number;
  state: string;
  review_state: string;
  stale: boolean;
  error: string | null;
  updated_at: string;
  draft: { items?: Proposal[]; rows?: MatchRow[] } & Partial<
    Record<PreparationCategory, DraftItem[]>
  >;
  reviewed: (Proposal & ReviewChoice)[];
  requirements: { id: string; text: string }[];
  profile: { id: string; name: string; text: string }[];
}
export interface AnalysisRead {
  analysis: Analysis | null;
  requirements: Analysis['requirements'];
  profile: Analysis['profile'];
}
export const analysesApi = {
  confirmRequirements: async (
    target: AnalysisTarget,
    expectedRevision: number
  ) =>
    (
      await api.post('/api/job-analyses/confirm-requirements', {
        ...target,
        expected_revision: expectedRevision,
      })
    ).data,
  latest: async (kind: AnalysisKind, target: AnalysisTarget) =>
    (
      await api.get<AnalysisRead>('/api/job-analyses', {
        params: { kind, ...target },
      })
    ).data,
  create: async (
    kind: AnalysisKind,
    target: AnalysisTarget,
    language: string
  ) =>
    (
      await api.post<Analysis>('/api/job-analyses', {
        kind,
        ...target,
        language,
      })
    ).data,
  run: async (analysis: Analysis, intent: string) =>
    (
      await api.post<Analysis>(`/api/job-analyses/${analysis.id}/run`, {
        expected_revision: analysis.revision,
        intent_id: intent,
      })
    ).data,
  discard: async (analysis: Analysis) =>
    (
      await api.post<Analysis>(`/api/job-analyses/${analysis.id}/discard`, {
        expected_revision: analysis.revision,
      })
    ).data,
  read: async (id: string) =>
    (await api.get<Analysis>(`/api/job-analyses/${id}`)).data,
  review: async (analysis: Analysis, items: ReviewChoice[]) =>
    (
      await api.patch<Analysis>(`/api/job-analyses/${analysis.id}/review`, {
        expected_revision: analysis.revision,
        target_revision: analysis.target_revision,
        items,
      })
    ).data,
  apply: async (
    analysis: Analysis,
    targetRevision: number,
    selectedIds: string[]
  ) =>
    (
      await api.post<Analysis>(`/api/job-analyses/${analysis.id}/apply`, {
        expected_revision: analysis.revision,
        target_revision: targetRevision,
        selected_ids: selectedIds,
      })
    ).data,
};
