import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useAuth } from '../contexts/AuthContext';
import api, { safeErrorMessage } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { recoverReadInterval } from '../lib/readRecovery';

export interface FeedbackSource {
  id: string;
  kind: string;
  text: string;
  segment_id?: string;
  role?: string;
  start?: number | null;
  end?: number | null;
}
export interface FeedbackCitation {
  source_id: string;
  quote: string;
}
interface CoachingBase {
  version: 1;
  title: string;
}
interface ConditionalStep {
  condition: string;
  action: string;
}
type FeedbackCoaching = CoachingBase &
  (
    | {
        kind: 'interview';
        question?: FeedbackCitation;
        answer_citation: number;
        better_answer: string;
      }
    | {
        kind: 'application';
        context_citations: number[];
        branches: ConditionalStep[];
        draft?: { condition: string; text: string };
      }
    | {
        kind: 'pipeline';
        records: (ConditionalStep & {
          record_citation: number;
          round_citations?: number[];
        })[];
      }
  );
export interface FeedbackFinding {
  topic?: 'pipeline' | 'interview' | 'activity';
  observation: string;
  interpretation: string;
  action: string;
  limitations: string;
  citations: FeedbackCitation[];
  coaching?: FeedbackCoaching;
  coaching_unavailable?: 'complete_record_unavailable';
}
export interface FeedbackState {
  generation?: number;
  period?: string;
  as_of?: string | null;
  stale_reason: string | null;
  capability: {
    available: boolean;
    provider: string | null;
    model: string | null;
    configuration_revision: string;
    input_disclosure: string;
    external_processing: string;
    message: string;
  };
  job: {
    id: string;
    intent_id?: string;
    period?: string;
    as_of?: string | null;
    time_zone?: string;
    prompt_revision?: string | null;
    state: string;
    uncertain: boolean;
    error: string | null;
    completed_sections: number;
    total_sections: number;
  } | null;
  report: {
    run_at: string;
    fingerprint?: string;
    prompt_revision?: string | null;
    provider: string;
    model: string;
    period?: string;
    as_of?: string | null;
    time_zone?: string;
    findings: FeedbackFinding[];
    sources: FeedbackSource[];
    limitations: string[];
    coverage: { sections: number; sources: number; characters: number };
  } | null;
}

interface Attempt {
  scope: string;
  id: string;
  body: Record<string, unknown>;
  phase: 'starting' | 'unknown' | 'rejected';
  checked?: boolean;
  error?: string;
}
const isRunning = (state?: FeedbackState | null) =>
  !!state?.job && ['queued', 'analyzing'].includes(state.job.state);

/** GETs follow the owner and target; only the explicit action can start AI work. */
export function useFeedback<T extends FeedbackState = FeedbackState>(
  endpoint: string,
  requestBody: (state: T) => Record<string, unknown>
) {
  const { user } = useAuth();
  const owner = user?.id ?? user?.email ?? null;
  const identity = JSON.stringify([owner, endpoint]);
  const scopeKey = ['feedback', owner, endpoint.split('?')[0]];
  const queryKey = [...scopeKey, endpoint];
  const scopeIdentity = JSON.stringify(scopeKey);
  const pending = useRef(new Map<string, Attempt>());
  const epoch = useRef(0);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});

  function updateAttempt(key: string, value?: Attempt) {
    if (value) pending.current.set(key, value);
    else pending.current.delete(key);
    setAttempts((current) => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  useEffect(() => {
    epoch.current += 1;
    pending.current.clear();
    setAttempts({});
    return () => {
      epoch.current += 1;
    };
  }, [owner]);

  const query = useQuery(
    {
      queryKey,
      enabled: !!owner,
      queryFn: async ({ signal }) => {
        const response = await api.get<T>(endpoint, { signal });
        if (!response.data?.capability)
          throw new Error('Invalid feedback status');
        return response.data;
      },
      staleTime: 0,
      gcTime: 0,
      // Queued work can finish while another round or browser tab has focus.
      refetchIntervalInBackground: true,
      refetchInterval: (current) =>
        current.state.status === 'error'
          ? recoverReadInterval(current)
          : isRunning(current.state.data)
            ? 1000
            : false,
    },
    queryClient
  );

  useEffect(() => {
    const attempt = pending.current.get(identity);
    if (attempt && query.data?.job?.intent_id === attempt.id)
      updateAttempt(identity);
  }, [identity, query.data]);

  // A failed authoritative read must not display cached, possibly removed evidence.
  const state = query.isError ? null : (query.data ?? null);
  const attempt = attempts[identity];
  const pendingForScope = (value: Attempt) =>
    value.scope === scopeIdentity && value.phase === 'starting';
  const starting = Object.values(attempts).some(pendingForScope);
  const running = isRunning(state);
  const unknown = attempt?.phase === 'unknown';
  const terminalUncertain =
    !!state?.job &&
    !running &&
    (state.job.uncertain || state.job.state === 'interrupted');

  async function refresh() {
    const currentEpoch = epoch.current;
    const result = await query.refetch();
    if (currentEpoch !== epoch.current) return;
    const unresolved = pending.current.get(identity);
    if (result.isSuccess && unresolved?.phase === 'unknown') {
      if (result.data.job?.intent_id === unresolved.id) updateAttempt(identity);
      else updateAttempt(identity, { ...unresolved, checked: true });
    }
  }

  async function request() {
    const old = pending.current.get(identity);
    if (old?.phase === 'unknown' && !old.checked) {
      await refresh();
      return;
    }
    if (
      [...pending.current.values()].some(pendingForScope) ||
      starting ||
      running ||
      !state ||
      query.isFetching ||
      !state.capability.available
    )
      return;
    if (
      (old?.phase === 'unknown' || terminalUncertain) &&
      !confirm(
        'Try again? The service may already have processed this request. Another attempt can repeat work or charges.'
      )
    )
      return;
    const currentEpoch = epoch.current;
    const next: Attempt =
      old?.phase === 'unknown'
        ? { ...old, phase: 'starting', error: undefined }
        : {
            scope: scopeIdentity,
            id: crypto.randomUUID(),
            body: requestBody(state),
            phase: 'starting',
          };
    updateAttempt(identity, next);
    try {
      await queryClient.cancelQueries({ queryKey });
      if (currentEpoch !== epoch.current) return;
      const response = await api.post<NonNullable<T['job']>>(endpoint, {
        ...next.body,
        intent_id: next.id,
      });
      if (currentEpoch !== epoch.current) return;
      if (!response.data?.id || !response.data?.state)
        throw new Error('Unconfirmed feedback request');
      queryClient.setQueryData<T>(queryKey, (current) =>
        current ? { ...current, job: response.data } : current
      );
      updateAttempt(identity);
      await queryClient.invalidateQueries({ queryKey: scopeKey });
    } catch (error) {
      if (currentEpoch !== epoch.current) return;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const rejected = status !== undefined && status >= 400 && status < 500;
      updateAttempt(identity, {
        ...next,
        phase: rejected ? 'rejected' : 'unknown',
        checked: false,
        error: safeErrorMessage(
          isAxiosError(error) ? error.response?.data?.detail : null,
          rejected
            ? 'The request could not be started. Check the saved details and try again.'
            : 'The request may have started. Check its status before trying again.'
        ),
      });
      if (rejected) await queryClient.invalidateQueries({ queryKey: scopeKey });
    }
  }

  const failed =
    !!state?.job && ['failed', 'interrupted'].includes(state.job.state);
  const actionLabel = starting
    ? 'Starting…'
    : running
      ? state?.job?.state === 'queued'
        ? 'Waiting…'
        : 'Preparing…'
      : query.isError
        ? 'Try loading again'
        : unknown
          ? attempt.checked
            ? 'Retry request'
            : 'Check status'
          : failed || attempt?.phase === 'rejected'
            ? 'Try again'
            : state?.report
              ? 'Update feedback'
              : 'Get feedback';
  return {
    state,
    starting,
    running,
    requestedPeriod: starting
      ? (Object.values(attempts).find(pendingForScope)?.body.period as
          string | undefined)
      : running
        ? state?.job?.period
        : undefined,
    unknown,
    terminalUncertain,
    failed,
    loading: query.isPending && !query.isError,
    readError: query.isError,
    requestError: running ? undefined : attempt?.error,
    actionLabel,
    disabled:
      starting ||
      running ||
      query.isFetching ||
      (!query.isError &&
        !(unknown && !attempt.checked) &&
        !state?.capability.available),
    refresh,
    request: query.isError ? refresh : request,
  };
}

export type FeedbackController = ReturnType<typeof useFeedback>;
