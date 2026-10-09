import Button from '@/components/ui/Button';
import TextLink from '@/components/ui/TextLink';
import { formatDate } from '@/lib/displayDate';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import SegmentedControl from '@/components/SegmentedControl';
import MonthGrid from '@/components/MonthGrid';
import EmptyState from '@/components/EmptyState';
import Dropdown from '@/components/Dropdown';
import ReminderModal, { type ReminderDraft } from '@/components/ReminderModal';
import ReminderRecordPicker from '@/components/ReminderRecordPicker';
import TaskRow from '@/components/TaskRow';
import Pagination from '@/components/Pagination';
import {
  apiV030,
  type Reminder,
  type ReminderKind,
  type TargetType,
  type TasksQuery,
  type Deadline,
} from '@/lib/apiV030';
import {
  taskGroups,
  taskGroup,
  dayKey,
  reminderDraft,
  reminderTargetFields,
} from '@/lib/taskDates';
import { reminderKinds } from '@/lib/uiPills';
import { locale } from '@/lib/i18n';
import { roundTypeLabel } from '@/lib/referenceLabels';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { getEffectiveTimeZone } from '@/lib/roundDateTime';
import { useReminderActions } from '@/hooks/useReminderActions';

export default function Tasks() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [selectedMonth, setMonth] = useState<Date | null>(null);
  const interviews = params.get('view') === 'interviews';
  const week = params.get('calendar') === 'week';
  const filter = ['open', 'done', 'all'].includes(params.get('state') ?? '')
    ? (params.get('state')! as TasksQuery['state'])
    : 'open';
  const kind = params.get('kind') as ReminderKind | null;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const preferences = useUserPreferences();
  const zone = preferences.data ? getEffectiveTimeZone(preferences.data) : null;
  const actions = useReminderActions();
  const today = new Date(`${dayKey(new Date(), zone || 'UTC')}T12:00:00`);
  const month = selectedMonth || today;
  const [modal, setModal] = useState<{
    item?: Reminder;
    draft?: Partial<ReminderDraft>;
    target?: { type: TargetType; id: string };
    intent: string;
  } | null>(null);
  const [related, setRelated] = useState('');
  const tasks = useQuery({
    queryKey: ['tasks', filter, kind, page],
    queryFn: () =>
      apiV030.tasks({
        state: filter,
        kind: kind || undefined,
        page,
        per_page: 100,
      }),
    enabled: !interviews,
  });
  const dateParam = params.get('date') || '';
  const parsedDate = new Date(`${dateParam}T12:00:00Z`);
  const chosenDate =
    /^\d{4}-\d{2}-\d{2}$/.test(dateParam) &&
    Number.isFinite(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === dateParam
      ? dateParam
      : dayKey(new Date(), zone || 'UTC');
  const weekStart = new Date(`${chosenDate}T12:00:00Z`);
  weekStart.setUTCDate(
    weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7)
  );
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setUTCDate(day.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
  // Load the month and selected week together so the mobile week list is always ready.
  const from = new Date(
    Math.min(
      new Date(month.getFullYear(), month.getMonth(), -6).getTime(),
      weekStart.getTime() - 86_400_000
    )
  ).toISOString();
  const to = new Date(
    Math.max(
      new Date(month.getFullYear(), month.getMonth() + 1, 7).getTime(),
      weekStart.getTime() + 8 * 86_400_000
    )
  ).toISOString();
  const rounds = useQuery({
    queryKey: ['interview-calendar', from, to, zone],
    queryFn: async () => {
      const items = [];
      let page = 1;
      while (true) {
        const result = await apiV030.interviews({
          from,
          to,
          state: 'all',
          per_page: 100,
          page,
        });
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length) return items;
        page++;
      }
    },
    enabled: interviews && Boolean(zone),
  });
  const calendarReminders = useQuery({
    queryKey: ['reminders', 'calendar', from, to],
    queryFn: () =>
      apiV030.reminders({
        due_from: from,
        due_to: to,
        state: 'open',
        per_page: 100,
      }),
    enabled: interviews,
  });
  function update(updates: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if ('state' in updates || 'kind' in updates) next.delete('page');
    setParams(next);
  }
  function openNew(deadline?: Deadline) {
    setRelated('');
    setModal({
      intent: crypto.randomUUID(),
      target: deadline
        ? { type: deadline.target_type, id: deadline.id }
        : undefined,
      draft: deadline
        ? {
            kind: deadline.kind ?? 'application_deadline',
            title: deadline.title,
            due_date: dayKey(deadline.due_at, zone!),
            due_time: '09:00',
          }
        : undefined,
    });
  }
  function edit(item: Reminder) {
    if (zone)
      setModal({
        item,
        draft: reminderDraft(item, zone),
        intent: item.intent_id,
      });
  }
  const events =
    rounds.data
      ?.filter((r) => r.scheduled_at)
      .map((r) => ({
        id: r.id,
        date: dayKey(r.scheduled_at!, zone!),
        label: `${new Date(r.scheduled_at!).toLocaleTimeString(locale(), { timeZone: zone!, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} ${r.company}`,
        href: `/interviews/${r.id}`,
        outcome: r.outcome,
      })) ?? [];
  return (
    <Layout>
      <div
        className={
          interviews && !week
            ? 'mx-auto max-w-6xl px-4 py-8'
            : 'mx-auto max-w-4xl px-4 py-8'
        }
      >
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-primary text-2xl font-bold">{t('kit.tasks')}</h1>
          <Button
            variant="primary"
            type="button"
            disabled={!zone}
            onClick={() => openNew()}
            className="flex items-center gap-1.5 self-start"
          >
            <i className="bi-plus-lg icon-sm" aria-hidden="true" />
            {t('kit.newReminder')}
          </Button>
        </div>
        <div className="mb-6">
          <SegmentedControl
            label={t('kit.tasks')}
            value={interviews ? 'interviews' : 'todo'}
            options={[
              { value: 'todo', label: t('kit.toDo') },
              { value: 'interviews', label: t('kit.interviews') },
            ]}
            onChange={(view) => update({ view })}
          />
        </div>
        {(tasks.isError || rounds.isError || preferences.isError) && (
          <p role="alert" className="text-red-bright mb-4">
            {t('tasks.loadFailed')}{' '}
            <Button
              onClick={() => {
                void tasks.refetch();
                void rounds.refetch();
                void preferences.refetch();
              }}
              className="flex items-center gap-1.5"
            >
              <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
              {t('Retry')}
            </Button>
          </p>
        )}
        {interviews ? (
          <>
            <div className="hidden sm:block">
              {!week && zone && (
                <MonthGrid
                  month={month}
                  today={today}
                  events={events}
                  reminderDates={calendarReminders.data?.items.map((r) =>
                    dayKey(r.due_at, zone)
                  )}
                  onMonthChange={setMonth}
                  onDayClick={(date) => update({ calendar: 'week', date })}
                  headerActions={
                    <SegmentedControl
                      label={t('kit.interviewCalendar')}
                      value="month"
                      options={[
                        { value: 'month', label: t('kit.month') },
                        { value: 'week', label: t('kit.week') },
                      ]}
                      onChange={(calendar) => update({ calendar })}
                    />
                  }
                />
              )}
            </div>
            <div className={week ? '' : 'sm:hidden'}>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button
                    variant="icon"
                    aria-label={t('tasks.previousWeek')}
                    onClick={() =>
                      update({
                        date: new Date(weekStart.getTime() - 7 * 86_400_000)
                          .toISOString()
                          .slice(0, 10),
                      })
                    }
                    className="flex items-center gap-1.5"
                  >
                    ‹
                  </Button>
                  <span>
                    {formatDate(days[0])} — {formatDate(days[6])}
                  </span>
                  <Button
                    variant="icon"
                    aria-label={t('tasks.nextWeek')}
                    onClick={() =>
                      update({
                        date: new Date(weekStart.getTime() + 7 * 86_400_000)
                          .toISOString()
                          .slice(0, 10),
                      })
                    }
                    className="flex items-center gap-1.5"
                  >
                    ›
                  </Button>
                  <Button
                    className="flex items-center gap-1.5"
                    onClick={() =>
                      update({ date: dayKey(new Date(), zone || 'UTC') })
                    }
                  >
                    <i className="bi-arrow-right icon-sm" aria-hidden="true" />
                    {t('kit.today')}
                  </Button>
                </div>
                <div className="hidden sm:block">
                  <SegmentedControl
                    label={t('kit.interviewCalendar')}
                    value="week"
                    options={[
                      { value: 'month', label: t('kit.month') },
                      { value: 'week', label: t('kit.week') },
                    ]}
                    onChange={(calendar) => update({ calendar })}
                  />
                </div>
              </div>
              {days
                .filter((day) => events.some((event) => event.date === day))
                .map((day) => (
                  <section
                    key={day}
                    className="bg-secondary mb-6 rounded-lg p-6"
                  >
                    <h2 className="text-muted mb-3 text-sm font-semibold uppercase">
                      {new Date(`${day}T12:00Z`).toLocaleDateString(locale(), {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </h2>
                    <div className="space-y-2">
                      {zone &&
                        rounds.data
                          ?.filter(
                            (r) =>
                              r.scheduled_at &&
                              dayKey(r.scheduled_at, zone) === day
                          )
                          .map((r) => (
                            <TextLink
                              key={r.id}
                              to={`/interviews/${r.id}`}
                              className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-3 text-left will-change-transform sm:flex sm:flex-wrap"
                            >
                              <span className="text-orange-bright">
                                {new Date(r.scheduled_at!).toLocaleTimeString(
                                  locale(),
                                  {
                                    timeZone: zone,
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hourCycle: 'h23',
                                  }
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                {r.company} — {r.job_title}
                              </span>
                              <span className="text-muted text-xs">
                                <i
                                  className={`bi ${r.mode === 'video' ? 'bi-camera-video' : r.mode === 'phone' ? 'bi-telephone' : 'bi-geo-alt'} mr-2`}
                                  aria-hidden="true"
                                />
                                {roundTypeLabel(r.round_type)}
                              </span>
                              <span
                                className={`justify-self-start rounded px-2 py-1 text-xs ${r.outcome === 'passed' ? 'bg-green-bright/10 text-green-bright' : r.outcome === 'failed' ? 'bg-red-bright/10 text-red-bright' : 'bg-orange-bright/10 text-orange-bright'}`}
                              >
                                ●{' '}
                                {t('tasks.outcome.' + (r.outcome || 'pending'))}
                              </span>
                            </TextLink>
                          ))}
                    </div>
                  </section>
                ))}
              {!rounds.isPending &&
                !events.some((event) => days.includes(event.date)) && (
                  <EmptyState
                    message={t('kit.noInterviews')}
                    icon="bi-calendar"
                  />
                )}
            </div>
            {rounds.isPending && <p role="status">{t('tasks.loading')}</p>}
          </>
        ) : (
          <>
            <div className="bg-secondary mb-6 flex flex-wrap items-center gap-3 rounded-lg p-4 [&_[role=radiogroup]>label]:px-2 sm:[&_[role=radiogroup]>label]:px-3">
              <SegmentedControl
                label={t('kit.reminders')}
                value={filter!}
                options={['open', 'done', 'all'].map((value) => ({
                  value,
                  label: t('kit.' + value),
                }))}
                onChange={(state) => update({ state })}
              />
              <Dropdown
                size="sm"
                value={kind || ''}
                onChange={(kind) => update({ kind })}
                options={[
                  { value: '', label: t('tasks.allKinds') },
                  ...Object.keys(reminderKinds).map((value) => ({
                    value,
                    label: t('kit.kind.' + value),
                  })),
                ]}
              />
            </div>
            {tasks.isPending ? (
              <p role="status">{t('tasks.loading')}</p>
            ) : (
              zone && (
                <>
                  {taskGroups.map((group) => {
                    const rows =
                      tasks.data?.items.filter(
                        (r) => taskGroup(r.due_at, zone) === group
                      ) ?? [];
                    if (!rows.length) return null;
                    return (
                      <section
                        key={group}
                        className="bg-secondary mb-6 rounded-lg p-6"
                      >
                        <h2
                          className={`mb-3 text-lg font-semibold ${group === 'overdue' ? 'text-red-bright' : 'text-fg1'}`}
                        >
                          {t('tasks.group.' + group)}
                        </h2>
                        <div className="space-y-2">
                          {rows.map((item) => (
                            <TaskRow
                              key={item.id}
                              item={item}
                              zone={zone}
                              onEdit={edit}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                  {filter !== 'done' &&
                    (!kind || kind === 'application_deadline') &&
                    Boolean(tasks.data?.deadlines.length) && (
                      <details className="bg-secondary mb-6 rounded-lg p-6">
                        <summary
                          style={{ fontFamily: 'var(--font-display)' }}
                          className="text-fg1 hover:text-accent-bright focus:ring-accent hover:bg-bg2 cursor-pointer text-lg font-semibold transition-all duration-200 ease-in-out focus:ring-2"
                        >
                          {t('tasks.deadlinesWithoutReminder', {
                            count: tasks.data?.deadlines.length ?? 0,
                          })}
                        </summary>
                        <div className="mt-4 space-y-2">
                          {tasks.data?.deadlines.map((d) => (
                            <div
                              key={d.id}
                              className="bg-tertiary text-muted grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-lg p-4 text-sm sm:grid-cols-[minmax(0,1fr)_7rem_10rem]"
                            >
                              <TextLink
                                className="min-w-0"
                                to={`/${d.target_type === 'lead' ? 'job-leads' : d.target_type === 'round' ? 'interviews' : 'applications'}/${d.id}`}
                              >
                                <i className="bi bi-calendar-x mr-2" />
                                {t('tasks.deadline', { title: d.title })}
                              </TextLink>
                              <span className="text-muted w-full text-right text-sm tabular-nums">
                                {new Date(d.due_at).toLocaleDateString(
                                  locale(),
                                  {
                                    timeZone: zone,
                                    month: 'short',
                                    day: 'numeric',
                                  }
                                )}
                              </span>
                              <Button
                                className="flex items-center gap-1.5"
                                onClick={() => openNew(d)}
                              >
                                <i className="bi bi-bell mr-2" />
                                {t('tasks.remindMe')}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  {tasks.data?.total === 0 && !tasks.data.deadlines.length && (
                    <EmptyState
                      message={t('kit.noTasks')}
                      icon="bi-bell"
                      action={{
                        label: t('kit.newReminder'),
                        onClick: () => openNew(),
                      }}
                    />
                  )}
                  {(tasks.data?.total ?? 0) > 100 && (
                    <Pagination
                      currentPage={page}
                      totalPages={Math.ceil(tasks.data!.total / 100)}
                      perPage={100}
                      totalItems={tasks.data!.total}
                      onPageChange={(p) => update({ page: String(p) })}
                    />
                  )}
                </>
              )
            )}
          </>
        )}
        {modal && zone && (
          <ReminderModal
            initial={modal.draft}
            editing={Boolean(modal.item)}
            relatedLabel={
              modal.item || modal.target ? modal.draft?.title : undefined
            }
            relatedPicker={
              <ReminderRecordPicker
                value={related}
                onChange={(value, target) => {
                  setRelated(value);
                  setModal({ ...modal, target });
                }}
              />
            }
            onClose={() => setModal(null)}
            onSave={async (draft) => {
              const fields = {
                ...draft,
                note: draft.note || null,
                time_zone: zone,
              };
              if (modal.item) await actions.update(modal.item, fields);
              else
                await actions.create({
                  ...fields,
                  intent_id: modal.intent,
                  ...(modal.target
                    ? reminderTargetFields(modal.target.type, modal.target.id)
                    : {}),
                });
            }}
          />
        )}
      </div>
    </Layout>
  );
}
