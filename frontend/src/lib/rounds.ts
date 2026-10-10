import { invalidateEvidenceQueries } from './queryClient';
import api, { withAxiosTimeZoneHeaders } from './api';
import type { Round, RoundCreate, RoundUpdate } from './types';

export async function createRound(
  applicationId: string,
  data: RoundCreate,
  expectedTimeZone?: string,
  requestKey?: string
): Promise<Round> {
  const response = await api.post(
    `/api/applications/${applicationId}/rounds`,
    data,
    {
      headers: withAxiosTimeZoneHeaders({
        'Idempotency-Key': requestKey,
        'Expected-Round-Time-Zone': expectedTimeZone,
      }),
    }
  );
  invalidateEvidenceQueries();
  return response.data;
}

export async function updateRound(
  roundId: string,
  data: RoundUpdate,
  expectedTimeZone?: string
): Promise<Round> {
  const response = await api.patch(`/api/rounds/${roundId}`, data, {
    headers: withAxiosTimeZoneHeaders({
      'Expected-Round-Time-Zone': expectedTimeZone,
    }),
  });
  invalidateEvidenceQueries();
  return response.data;
}

export async function deleteRound(
  roundId: string,
  round?: Round
): Promise<void> {
  await api.delete(`/api/rounds/${roundId}`, {
    params: { expected_revision: round?.revision },
    headers: {
      'Expected-Transcript-Generation':
        round?.transcript_generation ?? (round ? 0 : undefined),
      'Expected-Media-Generation':
        round?.media_generation ?? (round ? 0 : undefined),
    },
  });
  invalidateEvidenceQueries();
}

export async function uploadMedia(
  roundId: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  generation?: number,
  replaceMediaId?: string
): Promise<Round> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/api/rounds/${roundId}/media`, formData, {
    // Wire upload plus local validation can legitimately outlast ordinary API calls.
    timeout: 3_900_000,
    headers: withAxiosTimeZoneHeaders({
      'Content-Type': 'multipart/form-data',
      'Expected-Media-Generation': generation,
      'Replace-Media-Id': replaceMediaId,
    }),
    onUploadProgress: (event) => {
      if (event.total) {
        onProgress?.(event.loaded, event.total);
      }
    },
  });
  invalidateEvidenceQueries();
  return response.data;
}

export async function deleteMedia(
  mediaId: string,
  generation?: number
): Promise<void> {
  await api.delete(`/api/media/${mediaId}`, {
    headers: { 'Expected-Media-Generation': generation },
  });
  invalidateEvidenceQueries();
}

interface SignedUrlResponse {
  url: string;
  expires_in: number;
}

export async function getMediaSignedUrl(
  mediaId: string,
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<SignedUrlResponse> {
  const response = await api.get(`/api/files/media/${mediaId}/signed`, {
    params: { disposition },
  });
  return response.data;
}

export async function uploadRoundTranscript(
  roundId: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  generation?: number
): Promise<Round> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(
    `/api/rounds/${roundId}/transcript`,
    formData,
    {
      headers: withAxiosTimeZoneHeaders({
        'Content-Type': 'multipart/form-data',
        'Expected-Transcript-Generation': generation,
      }),
      onUploadProgress: (event) => {
        if (event.total) {
          onProgress?.(event.loaded, event.total);
        }
      },
    }
  );
  invalidateEvidenceQueries();
  return response.data;
}

export async function deleteRoundTranscript(
  roundId: string,
  generation?: number
): Promise<void> {
  await api.delete(`/api/rounds/${roundId}/transcript`, {
    headers: { 'Expected-Transcript-Generation': generation },
  });
  invalidateEvidenceQueries();
}

export async function getRoundTranscriptSignedUrl(
  roundId: string,
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<SignedUrlResponse> {
  const response = await api.get(
    `/api/files/rounds/${roundId}/transcript/signed`,
    {
      params: { disposition },
    }
  );
  return response.data;
}
