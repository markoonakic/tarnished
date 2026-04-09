import { describe, expect, it } from 'vitest';

import {
  mergeApplicationRoundMedia,
  preserveApplicationRounds,
  removeApplicationRound,
  upsertApplicationRound,
} from './applicationDetailState';
import type { Application, Round, Status } from './types';

function createStatus(): Status {
  return { id: 'status-1', name: 'Applied', color: 'aqua' };
}

function createRound(id: string, mediaCount = 0): Round {
  return {
    id,
    round_type: { id: `type-${id}`, name: 'Screen' },
    scheduled_at: null,
    completed_at: null,
    outcome: null,
    notes_summary: null,
    transcript_path: null,
    transcript_original_filename: null,
    transcript_summary: null,
    media: Array.from({ length: mediaCount }, (_, index) => ({
      id: `${id}-media-${index}`,
      file_path: `/tmp/${id}-${index}`,
      media_type: 'audio',
      uploaded_at: '2026-03-25T00:00:00Z',
    })),
    created_at: '2026-03-25T00:00:00Z',
  };
}

function createApplication(rounds: Round[] = []): Application {
  return {
    id: 'app-1',
    company: 'Acme',
    job_title: 'Engineer',
    job_description: null,
    job_url: null,
    status: createStatus(),
    cv_path: null,
    cover_letter_path: null,
    applied_at: '2026-03-25',
    created_at: '2026-03-25T00:00:00Z',
    updated_at: '2026-03-25T00:00:00Z',
    rounds,
    job_lead_id: null,
    location: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    recruiter_name: null,
    recruiter_title: null,
    recruiter_linkedin_url: null,
    requirements_must_have: [],
    requirements_nice_to_have: [],
    skills: [],
    years_experience_min: null,
    years_experience_max: null,
    source: null,
  };
}

describe('application detail state helpers', () => {
  it('preserves existing rounds when document updates omit them', () => {
    const previous = createApplication([createRound('round-1')]);
    const updated = createApplication([]);

    expect(preserveApplicationRounds(previous, updated).rounds).toEqual(
      previous.rounds
    );
  });

  it('replaces an existing round when saving edits', () => {
    const rounds = [createRound('round-1'), createRound('round-2')];
    const savedRound = createRound('round-2', 2);

    expect(upsertApplicationRound(rounds, savedRound)).toEqual([
      createRound('round-1'),
      savedRound,
    ]);
  });

  it('removes a deleted round from the application state', () => {
    const application = createApplication([
      createRound('round-1'),
      createRound('round-2'),
    ]);

    expect(removeApplicationRound(application, 'round-1')?.rounds).toEqual([
      createRound('round-2'),
    ]);
  });

  it('refreshes only the requested round media after an upload', () => {
    const current = createApplication([
      createRound('round-1'),
      createRound('round-2'),
    ]);
    const refreshed = createApplication([
      createRound('round-1', 1),
      createRound('round-2'),
    ]);

    expect(
      mergeApplicationRoundMedia(current, refreshed, 'round-1')?.rounds?.[0]
        .media
    ).toEqual(createRound('round-1', 1).media);
    expect(
      mergeApplicationRoundMedia(current, refreshed, 'round-1')?.rounds?.[1]
        .media
    ).toEqual(createRound('round-2').media);
  });
});
