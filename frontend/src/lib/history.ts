import { invalidateEvidenceQueries } from './queryClient';
import api from './api';
import type {
  ApplicationStatusHistory,
  HistoryCorrection,
  StatusMeaning,
  Status,
} from './types';

export const historyStageLabels: Record<StatusMeaning, string> = {
  unknown: 'Not recorded',
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  no_reply: 'No reply',
};

export function historyStage(
  status: Status | null,
  meaning: StatusMeaning | null
) {
  return meaning && meaning !== 'unknown' && status?.meaning === meaning
    ? { name: status.name, color: status.color }
    : { name: historyStageLabels[meaning ?? 'unknown'], color: undefined };
}

export async function getApplicationHistory(
  applicationId: string
): Promise<ApplicationStatusHistory[]> {
  const response = await api.get(`/api/applications/${applicationId}/history`);
  return response.data;
}

export async function deleteHistoryEntry(
  applicationId: string,
  historyId: string,
  expectedRevision?: number
): Promise<void> {
  await api.delete(`/api/applications/${applicationId}/history/${historyId}`, {
    params: { expected_revision: expectedRevision },
  });
  invalidateEvidenceQueries();
}

export async function correctHistoryEntry(
  applicationId: string,
  historyId: string,
  data: HistoryCorrection
): Promise<void> {
  await api.patch(
    `/api/applications/${applicationId}/history/${historyId}`,
    data
  );
  invalidateEvidenceQueries();
}

export async function correctCurrentMeaning(
  applicationId: string,
  meaning: StatusMeaning,
  expectedRevision: number
): Promise<void> {
  await api.patch(`/api/applications/${applicationId}/meaning`, {
    meaning,
    expected_revision: expectedRevision,
  });
  invalidateEvidenceQueries();
}
