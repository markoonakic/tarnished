import api from './api';
import { invalidateEvidenceQueries } from './queryClient';

export interface TranscriptSegment {
  id: string;
  text: string;
  start: number | null;
  end: number | null;
  speaker: string | null;
  role: 'unknown' | 'candidate' | 'interviewer' | 'other';
  audio_channel?: string | null;
}

interface CurrentTranscript {
  id: string;
  revision: number;
  provenance: 'paste' | 'upload' | 'media';
  format: 'txt' | 'srt' | 'vtt' | 'json';
  language: 'en';
  coverage: 'provided_text' | 'complete_audio' | 'imported_audio';
  structure?: 'none' | 'automatic';
  structure_model?: string | null;
  structure_status?: 'Automatic sections unavailable' | null;
  segments: TranscriptSegment[];
}

export interface TranscriptState {
  generation: number;
  transcript: CurrentTranscript | null;
  attachment_only: boolean;
}

export async function getTranscript(roundId: string): Promise<TranscriptState> {
  return (await api.get(`/api/rounds/${roundId}/transcript`)).data;
}

export async function pasteTranscript(
  roundId: string,
  generation: number,
  text: string,
  format: 'txt' | 'srt' | 'vtt'
): Promise<TranscriptState> {
  const { data } = await api.put(
    `/api/rounds/${roundId}/transcript`,
    { text, format },
    { headers: { 'Expected-Transcript-Generation': generation } }
  );
  invalidateEvidenceQueries();
  return data;
}

export async function editTranscript(
  roundId: string,
  generation: number,
  segments: TranscriptSegment[]
): Promise<TranscriptState> {
  const { data } = await api.patch(
    `/api/rounds/${roundId}/transcript`,
    { segments },
    { headers: { 'Expected-Transcript-Generation': generation } }
  );
  invalidateEvidenceQueries();
  return data;
}
