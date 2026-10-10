import Button from '@/components/ui/Button';
import { isAxiosError } from 'axios';
import { errorMessage } from '@/lib/errorMessage';
import TextLink from '@/components/ui/TextLink';
import { formatDateTime, formatDate as displayDate } from '@/lib/displayDate';
import { useState } from 'react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import HelpTip from '@/components/HelpTip';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import Card from '@/components/Card';
import CollapsibleCard from '@/components/CollapsibleCard';
import NotesPanel from '@/components/NotesPanel';
import TargetReminders from '@/components/TargetReminders';
import RoundForm from '@/components/RoundForm';
import InterviewRecording from '@/components/InterviewRecording';
import InterviewParticipants from '@/components/InterviewParticipants';
import InterviewPreparationDraft from '@/components/InterviewPreparationDraft';
import {
  apiV030,
  type Interview,
  type InterviewUpdate,
  type PreparationKey,
  type QuestionAnswer,
} from '@/lib/apiV030';
import type { Round } from '@/lib/types';

import { roundTypeLabel } from '@/lib/referenceLabels';
import { historyInstant, historyLocalTime } from '@/lib/historyDateTime';
import { getEffectiveTimeZone } from '@/lib/roundDateTime';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useToast } from '@/hooks/useToast';
import { invalidateEvidenceQueries } from '@/lib/queryClient';

const preparationKeys: PreparationKey[] = [
  'review_topics',
  'technical_topics',
  'practice_questions',
  'company_questions',
  'examples',
  'profile_gaps',
  'plan',
];
const input =
  'bg-bg2 text-primary focus:ring-accent w-full rounded px-3 py-2 text-sm focus:ring-2 focus:outline-none';
export default function InterviewDetail() {
  const { id } = useParams<{ id: string }>();
  return <InterviewPage key={id} id={id} />;
}
function InterviewPage({ id }: { id?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const preferences = useUserPreferences();
  const zone = preferences.data ? getEffectiveTimeZone(preferences.data) : null;
  const query = useQuery({
    queryKey: ['interview', id],
    queryFn: () => apiV030.interview(id!),
    enabled: Boolean(id),
  });
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<QuestionAnswer[]>([]);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useUnsavedChanges(busy || section !== null);
  const interview = query.data;
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['interview', id] });
    await client.invalidateQueries({ queryKey: ['interview-calendar'] });
    await client.invalidateQueries({ queryKey: ['dashboard-overview'] });
    invalidateEvidenceQueries();
  }
  async function update(data: Omit<InterviewUpdate, 'expected_revision'>) {
    if (!interview) return;
    const saved = await apiV030.updateInterview(interview.id, {
      ...data,
      expected_revision: section ? draftRevision : interview.revision,
    });
    client.setQueryData(['interview', id], { ...interview, ...saved });
    await refresh();
  }
  function edit(which: string) {
    if (!interview || busy || section !== null) return;
    setSection(which);
    setDraftRevision(interview.revision);
    setError('');
    setDraft(
      which === 'preparation'
        ? Object.fromEntries(
            preparationKeys.map((key) => [
              key,
              interview.preparation?.[key]?.join('\n') ?? '',
            ])
          )
        : {
            impressions: interview.impressions ?? '',
            task_description: interview.task_description ?? '',
            task_deadline:
              interview.task_deadline && zone
                ? historyLocalTime(interview.task_deadline, zone).slice(0, 16)
                : '',
            next_steps: interview.next_steps ?? '',
            expected_reply_on: interview.expected_reply_on ?? '',
            notes_summary: interview.notes_summary ?? '',
          }
    );
    setQuestions(
      interview.questions_answers?.length
        ? interview.questions_answers
        : [{ question: '', answer: '' }]
    );
  }
  async function saveSection() {
    if (!interview || busy) return;
    setBusy(true);
    setError('');
    try {
      if (section === 'preparation')
        await update({
          preparation: Object.fromEntries(
            preparationKeys.map((key) => [
              key,
              (draft[key] ?? '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            ])
          ),
        });
      else if (section === 'questions')
        await update({
          questions_answers: questions
            .filter((q) => q.question.trim())
            .map((q) => ({
              question: q.question.trim(),
              answer: q.answer.trim(),
            })),
          impressions: draft.impressions || null,
        });
      else if (section === 'task')
        await update({
          task_description: draft.task_description || null,
          task_deadline: draft.task_deadline
            ? interview.task_deadline &&
              zone &&
              historyLocalTime(interview.task_deadline, zone).slice(0, 16) ===
                draft.task_deadline
              ? interview.task_deadline
              : historyInstant(draft.task_deadline, zone!)
            : null,
        });
      else if (section === 'next')
        await update({
          next_steps: draft.next_steps || null,
          expected_reply_on: draft.expected_reply_on || null,
        });
      else if (section === 'summary')
        await update({ notes_summary: draft.notes_summary || null });
      setSection(null);
    } catch {
      setError(t('tasks.saveFailed'));
    } finally {
      setBusy(false);
    }
  }
  const controls = (
    <div className="mt-4 flex justify-end gap-2">
      <Button
        disabled={busy}

        onClick={() => setSection(null)}
      >
        <i className="bi-x-lg icon-sm" aria-hidden="true" />
        {t('Cancel')}
      </Button>
      <Button
        variant="primary"
        disabled={busy}
        className="flex items-center gap-1.5"
        onClick={() => void saveSection()}
      >
        <i className="bi-check2 icon-sm" aria-hidden="true" />
        {t('Save')}
      </Button>
    </div>
  );
  function field(key: string, type = 'textarea') {
    return (
      <div key={key}>
        <label
          htmlFor={'interview-' + key}
          className="text-muted mb-1 block text-xs"
        >
          {t('tasks.field.' + key)}
        </label>
        {type === 'textarea' ? (
          <textarea
            id={'interview-' + key}
            disabled={busy}
            className={input}
            rows={key === 'notes_summary' ? 4 : 3}
            value={draft[key] ?? ''}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        ) : (
          <input
            id={'interview-' + key}
            disabled={busy}
            className={input}
            type={type}
            value={draft[key] ?? ''}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        )}
      </div>
    );
  }
  const formatDate = (value: string, timeZone: string) =>
    formatDateTime(value, timeZone);
  const reminders = interview
    ? [
        ...(interview.scheduled_at
          ? [
              {
                kind: 'interview' as const,
                date: interview.scheduled_at,
                title: roundTypeLabel(interview.round_type),
              },
            ]
          : []),
        ...(interview.task_deadline
          ? [
              {
                kind: 'task_submission' as const,
                date: interview.task_deadline,
                title: t('tasks.submitTask'),
              },
            ]
          : []),
        ...(interview.expected_reply_on
          ? [
              {
                kind: 'expected_feedback' as const,
                date: interview.expected_reply_on,
                title: t('tasks.expectedDecision'),
              },
            ]
          : []),
      ]
    : [];
  const shortcut = (kind: string, iconOnly = false) => (
    <TargetReminders
      targetType="round"
      targetId={interview!.id}
      label={`${interview!.company} — ${roundTypeLabel(interview!.round_type)}`}
      shortcuts={reminders.filter((r) => r.kind === kind)}
      shortcutsOnly
      iconOnly={iconOnly}
    />
  );
  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        {query.isPending ? (
          <p role="status">{t('tasks.loading')}</p>
        ) : query.isError || !interview ? (
          <p role="alert">
            {t('tasks.loadFailed')}{' '}
            <Button
              className="flex items-center gap-1.5"
              onClick={() => void query.refetch()}
            >
              <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
              {t('Retry')}
            </Button>
          </p>
        ) : (
          <>
            <nav
              aria-label={t('tasks.breadcrumb')}
              className="text-muted mb-6 flex flex-wrap items-center gap-2 text-sm"
            >
              <TextLink to="/applications">{t('Applications')}</TextLink>
              <span>›</span>
              <TextLink to={`/applications/${interview.application_id}`}>
                {interview.company} — {interview.job_title}
              </TextLink>
              <span>›</span>
              <span>{roundTypeLabel(interview.round_type)}</span>
            </nav>
            {editing ? (
              <div className="mb-6">
                <RoundForm
                  applicationId={interview.application_id}
                  round={interview as Round}
                  onSave={() => {
                    setEditing(false);
                    void refresh();
                  }}
                  onPersist={() => void refresh()}
                  onCancel={() => setEditing(false)}
                />
              </div>
            ) : (
              <section className="bg-secondary mb-6 rounded-lg p-6">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h1 className="text-primary text-2xl font-bold">
                    {roundTypeLabel(interview.round_type)}
                  </h1>
                  <span
                    className={`rounded px-2 py-1 text-xs ${interview.outcome === 'passed' ? 'bg-green-bright/10 text-green-bright' : interview.outcome === 'failed' ? 'bg-red-bright/10 text-red-bright' : 'bg-orange-bright/10 text-orange-bright'}`}
                  >
                    ● {t('tasks.outcome.' + (interview.outcome || 'pending'))}
                  </span>
                </div>
                <TextLink
                  to={
                    interview.company_id
                      ? `/companies/${interview.company_id}`
                      : `/applications/${interview.application_id}`
                  }
                >
                  {interview.company}
                </TextLink>
                <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-muted text-xs">{t('tasks.when')}</dt>
                    <dd className="text-primary mt-1 text-sm">
                      {interview.scheduled_at && zone
                        ? formatDate(
                            interview.scheduled_at,
                            interview.time_zone || zone
                          )
                        : '—'}{' '}
                      {interview.time_zone && `(${interview.time_zone})`}
                      {interview.scheduled_at && shortcut('interview', true)}
                    </dd>
                    {interview.time_zone &&
                      zone &&
                      interview.time_zone !== zone &&
                      interview.scheduled_at && (
                        <p className="text-muted mt-1 text-xs">
                          {t('tasks.yourTime', {
                            time: formatDate(interview.scheduled_at, zone),
                          })}
                        </p>
                      )}
                  </div>
                  <div>
                    <dt className="text-muted text-xs">
                      {t('tasks.duration')}
                    </dt>
                    <dd className="text-primary mt-1 text-sm">
                      {interview.duration_minutes
                        ? t('tasks.minutes', {
                            count: interview.duration_minutes,
                          })
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs">{t('tasks.mode')}</dt>
                    <dd className="text-primary mt-1 text-sm">
                      <i
                        className={`bi ${interview.mode === 'video' ? 'bi-camera-video' : interview.mode === 'phone' ? 'bi-telephone' : 'bi-geo-alt'} mr-2`}
                      />
                      {t('tasks.mode.' + (interview.mode || 'other'))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs">{t('tasks.where')}</dt>
                    <dd className="text-primary mt-1 text-sm">
                      {interview.meeting_url &&
                      /^https?:\/\//i.test(interview.meeting_url) ? (
                        <TextLink
                          href={interview.meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2"
                        >
                          <i className="bi bi-box-arrow-up-right" />
                          {t('tasks.joinMeeting')}
                        </TextLink>
                      ) : (
                        interview.location || '—'
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted mb-2 text-xs">
                      {t('tasks.participants')}
                    </dt>
                    <dd>
                      <InterviewParticipants
                        value={interview.contact_ids ?? []}
                        companyId={interview.company_id}
                        readOnly
                        onChange={async (contact_ids) => {
                          try {
                            await update({ contact_ids });
                          } catch {
                            toast.error(t('tasks.saveFailed'));
                          }
                        }}
                      />
                    </dd>
                  </div>
                </dl>
                <div className="border-tertiary mt-6 flex justify-end gap-2 border-t pt-4">
                  {interview.scheduled_at && shortcut('interview')}
                  <Button
                    disabled={busy || section !== null}
                    onClick={() => setEditing(true)}
                  >
                    <i className="bi bi-pencil mr-2" />
                    {t('Edit')}
                  </Button>
                  <Button
                    variant="danger"
                    className="flex items-center gap-1.5"
                    onClick={async () => {
                      if (!confirm(t('tasks.deleteInterview'))) return;
                      try {
                        await apiV030.deleteInterview(interview.id, interview);
                        await refresh();
                        navigate(`/applications/${interview.application_id}`);
                      } catch (error) {
                        toast.error(
                          isAxiosError(error) && error.response
                            ? errorMessage(
                                error.response.data,
                                error.response.status
                              )
                            : t('tasks.saveFailed')
                        );
                      }
                    }}
                  >
                    <i className="bi bi-trash mr-2" />
                    {t('Delete')}
                  </Button>
                </div>
              </section>
            )}
            {error && (
              <p role="alert" className="text-red-bright mb-4">
                {error}
              </p>
            )}
            <InterviewPreparationDraft
              interview={interview}
              onSaved={refresh}
              actions={
                <Button
                  disabled={busy || section !== null}
                  onClick={() => edit('preparation')}
                >
                  <i className="bi bi-pencil mr-2" aria-hidden="true" />
                  {t('Edit')}
                </Button>
              }
            >
              {section === 'preparation' ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {preparationKeys.map((key) => field(key))}
                  </div>
                  {controls}
                </>
              ) : (
                <div className="space-y-4">
                  {preparationKeys
                    .filter((key) => interview.preparation?.[key]?.length)
                    .map((key) => (
                      <div key={key}>
                        <h4 className="text-muted mb-2 text-xs font-semibold uppercase">
                          {t('tasks.field.' + key)}
                        </h4>
                        <ul className="text-primary list-disc space-y-1 pl-5 text-sm">
                          {interview.preparation?.[key]?.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  {!preparationKeys.some(
                    (key) => interview.preparation?.[key]?.length
                  ) && (
                    <p className="text-muted text-sm">
                      {t('tasks.emptyPreparation')}
                    </p>
                  )}
                </div>
              )}
            </InterviewPreparationDraft>
            <CollapsibleCard
              title={t('tasks.questionsAnswers')}
              icon="bi-chat-left-text"
              open={questionsOpen}
              onOpenChange={setQuestionsOpen}
              actions={
                <Button
                  disabled={busy || section !== null}
                  onClick={() => {
                    setQuestionsOpen(true);
                    edit('questions');
                  }}
                >
                  <i className="bi-plus-lg icon-sm" aria-hidden="true" />
                  {t('tasks.add')}
                </Button>
              }
            >
              {section === 'questions' ? (
                <>
                  <div className="space-y-4">
                    {questions.map((pair, i) => (
                      <div key={i} className="bg-bg2 space-y-2 rounded p-3">
                        <label
                          className="text-muted block text-xs"
                          htmlFor={`question-${i}`}
                        >
                          {t('tasks.question')}
                        </label>
                        <input
                          id={`question-${i}`}
                          disabled={busy}
                          value={pair.question}
                          className={input}
                          onChange={(e) =>
                            setQuestions(
                              questions.map((p, index) =>
                                index === i
                                  ? { ...p, question: e.target.value }
                                  : p
                              )
                            )
                          }
                        />
                        <label
                          className="text-muted block text-xs"
                          htmlFor={`answer-${i}`}
                        >
                          {t('tasks.myAnswer')}
                        </label>
                        <textarea
                          id={`answer-${i}`}
                          disabled={busy}
                          value={pair.answer}
                          className={input}
                          onChange={(e) =>
                            setQuestions(
                              questions.map((p, index) =>
                                index === i
                                  ? { ...p, answer: e.target.value }
                                  : p
                              )
                            )
                          }
                        />
                        <Button
                          variant="danger"
                          disabled={busy}
                          className="flex items-center gap-1.5"
                          onClick={() =>
                            setQuestions(
                              questions.filter((_, index) => index !== i)
                            )
                          }
                        >
                          <i className="bi-trash icon-sm" aria-hidden="true" />
                          {t('Delete')}
                        </Button>
                      </div>
                    ))}
                    <Button
                      disabled={busy}
                      onClick={() =>
                        setQuestions([
                          ...questions,
                          { question: '', answer: '' },
                        ])
                      }
                    >
                      <i className="bi-plus-lg icon-sm" aria-hidden="true" />
                      {t('tasks.add')}
                    </Button>
                    {field('impressions')}
                  </div>
                  {controls}
                </>
              ) : (
                <div className="space-y-4">
                  {interview.questions_answers?.map((pair, i) => (
                    <div key={i}>
                      <h4 className="text-primary text-sm font-semibold">
                        {pair.question}
                      </h4>
                      <p className="text-muted mt-1 text-sm whitespace-pre-wrap">
                        {pair.answer}
                      </p>
                    </div>
                  ))}
                  {interview.impressions && (
                    <p className="text-primary text-sm whitespace-pre-wrap">
                      {interview.impressions}
                    </p>
                  )}
                  {interview.has_current_transcript && (
                    <TextLink href="#interview-recording">
                      {t('tasks.openTranscript')} ↓
                    </TextLink>
                  )}
                </div>
              )}
            </CollapsibleCard>
            {(interview.round_type.builtin_key === 'take_home' ||
              interview.task_description ||
              interview.task_deadline) && (
              <CollapsibleCard
                title={t('tasks.takeHome')}
                help={
                  <HelpTip label={t('tasks.takeHome')}>
                    {t('tasks.taskFilesHint')}
                  </HelpTip>
                }
                icon="bi-file-code"
                actions={
                  <Button
                    disabled={busy || section !== null}
                    onClick={() => edit('task')}
                  >
                    <i className="bi bi-pencil mr-2" aria-hidden="true" />
                    {t('Edit')}
                  </Button>
                }
              >
                {section === 'task' ? (
                  <>
                    <div className="space-y-4">
                      {field('task_description')}
                      {field('task_deadline', 'datetime-local')}
                    </div>
                    {controls}
                  </>
                ) : (
                  <>
                    <p className="text-primary text-sm whitespace-pre-wrap">
                      {interview.task_description}
                    </p>
                    {interview.task_deadline && zone && (
                      <p className="text-muted mt-3 text-sm">
                        {t('tasks.field.task_deadline')}:{' '}
                        {formatDate(interview.task_deadline, zone)}
                        {shortcut('task_submission', true)}
                      </p>
                    )}
                  </>
                )}
              </CollapsibleCard>
            )}
            <CollapsibleCard
              title={t('tasks.nextSteps')}
              icon="bi-signpost"
              actions={
                <Button
                  disabled={busy || section !== null}
                  onClick={() => edit('next')}
                >
                  <i className="bi bi-pencil mr-2" aria-hidden="true" />
                  {t('Edit')}
                </Button>
              }
            >
              {section === 'next' ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {field('next_steps')}
                    {field('expected_reply_on', 'date')}
                  </div>
                  {controls}
                </>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-muted text-xs">{t('tasks.nextSteps')}</p>
                    <p className="text-primary mt-1 text-sm whitespace-pre-wrap">
                      {interview.next_steps || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">
                      {t('tasks.field.expected_reply_on')}
                    </p>
                    <p className="text-primary mt-1 text-sm">
                      {interview.expected_reply_on
                        ? displayDate(interview.expected_reply_on)
                        : '—'}
                      {interview.expected_reply_on &&
                        shortcut('expected_feedback', true)}
                    </p>
                  </div>
                </div>
              )}
            </CollapsibleCard>
            <div id="interview-recording">
              <Card title={t('tasks.recordingTranscript')} icon="bi-mic">
                <InterviewRecording
                  round={interview as Round}
                  onEdit={() => {
                    if (!busy && section === null) setEditing(true);
                  }}
                  onDelete={() => {}}
                  onMediaChange={() => void refresh()}
                />
              </Card>
            </div>
            <Card
              title={t('tasks.summary')}
              icon="bi-card-text"
              actions={
                <Button
                  disabled={busy || section !== null}
                  onClick={() => edit('summary')}
                >
                  <i className="bi bi-pencil mr-2" aria-hidden="true" />
                  {t('Edit')}
                </Button>
              }
            >
              {section === 'summary' ? (
                <>
                  {field('notes_summary')}
                  {controls}
                </>
              ) : (
                <p className="text-muted text-sm whitespace-pre-wrap">
                  {interview.notes_summary || '—'}
                </p>
              )}
            </Card>
            <div id="interview-reminders">
              <TargetReminders
                targetType="round"
                targetId={interview.id}
                label={`${interview.company} — ${roundTypeLabel(interview.round_type)}`}
              />
            </div>
            <InterviewNotes interview={interview} />
          </>
        )}
      </div>
    </Layout>
  );
}
function InterviewNotes({ interview }: { interview: Interview }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['notes', 'round', interview.id],
    queryFn: () =>
      apiV030.notes({
        target_type: 'round',
        target_id: interview.id,
        per_page: 100,
      }),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['notes', 'round', interview.id] });
  return (
    <>
      {query.isError && <p role="alert">{t('tasks.loadFailed')}</p>}
      <NotesPanel
        notes={query.data?.items ?? []}
        onAdd={async (body, requestKey) => {
          await apiV030.createNote(
            { round_id: interview.id, body },
            requestKey
          );
          await refresh();
        }}
        onEdit={async (id, body) => {
          const note = query.data!.items.find((n) => n.id === id)!;
          await apiV030.updateNote(id, {
            body,
            expected_revision: note.revision,
          });
          await refresh();
        }}
        onDelete={async (id) => {
          if (!confirm(t('tasks.deleteNote'))) return;
          const note = query.data!.items.find((n) => n.id === id)!;
          await apiV030.deleteNote(id, note.revision);
          await refresh();
        }}
      />
    </>
  );
}
