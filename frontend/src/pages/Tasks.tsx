import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
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
  const [month, setMonth] = useState(new Date());
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
  const chosenDate = params.get('date') || dayKey(new Date(), zone || 'UTC');
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
            due_date: deadline.due_at.slice(0, 10),
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
          interviews
            ? 'mx-auto max-w-6xl px-4 py-8'
            : 'mx-auto max-w-4xl px-4 py-8'
        }
      >
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-primary text-2xl font-bold">{t('kit.tasks')}</h1>
          <button
            type="button"
            disabled={!zone}
            onClick={() => openNew()}
            className="bg-accent text-bg0 hover:bg-accent-bright focus:ring-accent rounded-md px-4 py-2 font-medium focus:ring-2 disabled:opacity-50"
          >
            {t('kit.newReminder')}
          </button>
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
            <button
              onClick={() => {
                void tasks.refetch();
                void rounds.refetch();
                void preferences.refetch();
              }}
              className="underline"
            >
              {t('Retry')}
            </button>
          </p>
        )}
        {interviews ? (
          <>
            <div className="hidden sm:block">
              {!week && zone && (
                <MonthGrid
                  month={month}
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
                  <button
                    aria-label={t('tasks.previousWeek')}
                    onClick={() =>
                      update({
                        date: new Date(weekStart.getTime() - 7 * 86_400_000)
                          .toISOString()
                          .slice(0, 10),
                      })
                    }
                  >
                    ‹
                  </button>
                  <span>
                    {new Date(`${days[0]}T12:00Z`).toLocaleDateString(
                      locale(),
                      { dateStyle: 'medium' }
                    )}{' '}
                    —{' '}
                    {new Date(`${days[6]}T12:00Z`).toLocaleDateString(
                      locale(),
                      { dateStyle: 'medium' }
                    )}
                  </span>
                  <button
                    aria-label={t('tasks.nextWeek')}
                    onClick={() =>
                      update({
                        date: new Date(weekStart.getTime() + 7 * 86_400_000)
                          .toISOString()
                          .slice(0, 10),
                      })
                    }
                  >
                    ›
                  </button>
                  <button
                    className="text-accent"
                    onClick={() =>
                      update({ date: dayKey(new Date(), zone || 'UTC') })
                    }
                  >
                    {t('kit.today')}
                  </button>
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
              {days.map((day) => (
                <section key={day} className="mb-6">
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
                          <Link
                            key={r.id}
                            to={`/interviews/${r.id}`}
                            className="bg-secondary hover:bg-bg2 flex flex-wrap gap-3 rounded-lg p-4 text-sm"
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
                              <span className="text-muted block text-xs">
                                {roundTypeLabel(r.round_type)} ·{' '}
                                {t('tasks.mode.' + (r.mode || 'other'))}
                              </span>
                            </span>
                            <span
                              className={
                                r.outcome === 'passed'
                                  ? 'text-green-bright'
                                  : r.outcome === 'failed'
                                    ? 'text-red-bright'
                                    : 'text-orange-bright'
                              }
                            >
                              {t('tasks.outcome.' + (r.outcome || 'pending'))}
                            </span>
                          </Link>
                        ))}
                  </div>
                  {!rounds.isPending && !events.some((e) => e.date === day) && (
                    <p className="text-muted text-sm">
                      {t('kit.noInterviews')}
                    </p>
                  )}
                </section>
              ))}
            </div>
            {rounds.isPending && <p role="status">{t('Loading…')}</p>}
          </>
        ) : (
          <>
            <div className="bg-secondary mb-6 flex flex-wrap items-center gap-3 rounded-lg p-4">
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
              <p role="status">{t('Loading…')}</p>
            ) : (
              zone && (
                <>
                  {taskGroups.map((group) => {
                    const rows =
                      tasks.data?.items.filter(
                        (r) => taskGroup(r.due_at, zone) === group
                      ) ?? [];
                    const deadlines =
                      filter === 'open' &&
                      (!kind || kind === 'application_deadline')
                        ? (tasks.data?.deadlines.filter(
                            (d) => taskGroup(d.due_at, zone) === group
                          ) ?? [])
                        : [];
                    if (!rows.length && !deadlines.length) return null;
                    return (
                      <section key={group} className="mb-7">
                        <h2
                          className={`mb-3 text-sm font-semibold uppercase ${group === 'overdue' ? 'text-red-bright' : 'text-primary'}`}
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
                          {deadlines.map((d) => (
                            <div
                              key={d.id}
                              className="border-bg4 text-muted flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3 text-sm"
                            >
                              <Link
                                className="min-w-0 flex-1"
                                to={`/${d.target_type === 'lead' ? 'job-leads' : 'applications'}/${d.id}`}
                              >
                                <i className="bi bi-calendar-x mr-2" />
                                {t('tasks.deadline', { title: d.title })}
                              </Link>
                              <button
                                className="text-primary focus:ring-accent rounded px-2 py-1 focus:ring-2"
                                onClick={() => openNew(d)}
                              >
                                <i className="bi bi-bell-plus mr-2" />
                                {t('tasks.remindMe')}
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
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
