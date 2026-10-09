import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { apiV030, type BoardCard, type JobQuery } from '@/lib/apiV030';
import { listStatuses } from '@/lib/settings';
import { statusLabel } from '@/lib/referenceLabels';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getStatusColor } from '@/lib/statusColors';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { getEffectiveTimeZone } from '@/lib/roundDateTime';
import { useToast } from '@/hooks/useToast';
import StatusChangeDialog from './StatusChangeDialog';
import { locale } from '@/lib/i18n';
import HelpTip from './HelpTip';

function boardFilters(params: URLSearchParams): JobQuery {
  const values = Object.fromEntries(params);
  delete values.view;
  delete values.page;
  delete values.sort;
  if (values.status) {
    values.status_id = values.status;
    delete values.status;
  }
  return {
    ...values,
    tags: params.getAll('tags'),
    show_archived: params.get('show_archived') === 'true',
    page: 1,
    per_page: 25,
  } as JobQuery;
}
export default function ApplicationBoard({
  params = new URLSearchParams(),
  compact = false,
}: {
  params?: URLSearchParams;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const colors = useThemeColors();
  const preferences = useUserPreferences();
  const zone = preferences.data ? getEffectiveTimeZone(preferences.data) : null;
  const client = useQueryClient();
  const filters = boardFilters(params);
  const board = useQuery({
    queryKey: ['application-board', filters],
    queryFn: () => apiV030.board(filters),
  });
  const statuses = useQuery({
    queryKey: ['board-statuses'],
    queryFn: listStatuses,
  });
  const [expanded, setExpanded] = useState<string[]>([]);
  const [extra, setExtra] = useState<{
    key: string;
    cards: Record<string, BoardCard[]>;
    pages: Record<string, number>;
  }>({ key: '', cards: {}, pages: {} });
  const filterKey = params.toString();
  const extras =
    extra.key === filterKey ? extra : { key: filterKey, cards: {}, pages: {} };
  const [loadingColumn, setLoadingColumn] = useState('');
  const [dragging, setDragging] = useState<BoardCard | null>(null);
  const [hover, setHover] = useState('');
  const [move, setMove] = useState<{ card: BoardCard; status: string } | null>(
    null
  );
  const openMove = (card: BoardCard, status: string) => {
    if (card.status.id !== status) setMove({ card, status });
  };
  async function loadMore(id: string) {
    if (loadingColumn) return;
    setLoadingColumn(id);
    try {
      const page = (extras.pages[id] ?? 1) + 1;
      const result = await apiV030.board({ ...filters, status_id: id, page });
      const rows = result.columns.find((c) => c.status_id === id)?.items ?? [];
      setExtra({
        key: filterKey,
        cards: {
          ...extras.cards,
          [id]: [...(extras.cards[id] ?? []), ...rows],
        },
        pages: { ...extras.pages, [id]: page },
      });
    } catch {
      toast.error(t('tasks.loadFailed'));
    } finally {
      setLoadingColumn('');
    }
  }
  if (board.isError || statuses.isError)
    return (
      <p role="alert" className="text-red-bright">
        {t('tasks.loadFailed')}{' '}
        <button
          onClick={() => {
            void board.refetch();
            void statuses.refetch();
          }}
          className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
        >
          <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
          {t('Retry')}
        </button>
      </p>
    );
  if (board.isPending || statuses.isPending)
    return <p role="status">{t('tasks.loading')}</p>;
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-fg1 text-lg font-semibold">
          {t('tasks.board')}
        </span>
        <HelpTip label={t('tasks.board')}>{t('tasks.boardHint')}</HelpTip>
      </div>
      <div
        className="flex items-stretch gap-3 overflow-x-auto pb-3"
        aria-label={t('tasks.board')}
      >
        {statuses.data
          ?.filter((s) => !filters.status_id || filters.status_id === s.id)
          .map((status) => {
            const column = board.data?.columns.find(
              (c) => c.status_id === status.id
            );
            const cards = [
              ...(column?.items ?? []),
              ...(extras.cards[status.id] ?? []),
            ];
            const terminal = ['rejected', 'withdrawn'].includes(status.meaning);
            const collapsed = terminal && !expanded.includes(status.id);
            const color = getStatusColor(status.name, colors, status.color);
            return (
              <section
                key={status.id}
                aria-label={statusLabel(status)}
                onDragOver={(e) => {
                  if (dragging) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setHover(status.id);
                  }
                }}
                onDragLeave={() => setHover('')}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging) openMove(dragging, status.id);
                  setDragging(null);
                  setHover('');
                }}
                className={`bg-secondary flex shrink-0 flex-col rounded-lg p-3 ${compact ? 'h-80' : 'h-[calc(100dvh-18rem)] min-h-80'} ${collapsed ? 'w-12' : compact ? 'w-60' : 'w-72'} ${hover === status.id ? 'ring-accent ring-2' : ''}`}
              >
                {collapsed ? (
                  <button
                    className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex h-full min-h-48 w-full cursor-pointer items-center gap-3 rounded p-1 text-sm transition-all duration-200 ease-in-out [writing-mode:vertical-rl] focus:ring-2 disabled:opacity-50"
                    onClick={() => setExpanded([...expanded, status.id])}
                  >
                    <i className="bi-arrow-right icon-sm" aria-hidden="true" />
                    <span style={{ color }}>{statusLabel(status)}</span>
                    <span className="text-muted">{column?.count ?? 0}</span>
                  </button>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold"
                        style={{ color, backgroundColor: `${color}20` }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {statusLabel(status)}
                      </span>
                      <span className="text-muted text-xs">
                        {column?.count ?? 0}
                      </span>
                      {terminal && (
                        <button
                          onClick={() =>
                            setExpanded(
                              expanded.filter((id) => id !== status.id)
                            )
                          }
                          aria-label={t('tasks.collapseColumn', {
                            name: statusLabel(status),
                          })}
                          className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                        >
                          ‹
                        </button>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                      {cards.map((card) => (
                        <article
                          key={card.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', card.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDragging(card);
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setHover('');
                          }}
                          className="bg-bg2 hover:bg-bg3 relative rounded-lg p-3"
                        >
                          <Link
                            to={`/applications/${card.id}`}
                            className="text-accent hover:text-accent-bright focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
                          >
                            <strong className="text-primary block">
                              {card.company || t('companies.notSet')}
                            </strong>
                            <span
                              className="text-primary block truncate"
                              title={card.job_title}
                            >
                              {card.job_title || t('companies.notSet')}
                            </span>
                            <span
                              className="text-muted block truncate text-xs"
                              title={card.location ?? undefined}
                            >
                              {[
                                card.location,
                                card.work_mode
                                  ? t('tasks.workMode.' + card.work_mode)
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </Link>
                          <details className="absolute top-3 right-2">
                            <summary
                              aria-label={t('tasks.cardActions', {
                                company: card.company,
                              })}
                              className="text-muted focus:ring-accent hover:bg-bg2 cursor-pointer list-none rounded px-1 transition-all duration-200 ease-in-out focus:ring-2"
                              title={t('tasks.cardActions', {
                                company: card.company,
                              })}
                            >
                              <i
                                className="bi bi-three-dots"
                                aria-hidden="true"
                              />
                            </summary>
                            <div className="bg-secondary border-tertiary absolute right-0 z-10 w-48 rounded-lg border p-1 shadow-xl">
                              <p className="text-muted px-3 py-2 text-xs">
                                {t('tasks.moveTo')}
                              </p>
                              {statuses.data
                                ?.filter((s) => s.id !== card.status.id)
                                .map((s) => (
                                  <button
                                    key={s.id}
                                    className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex w-full cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-left text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                                    disabled={!zone}
                                    onClick={(e) => {
                                      e.currentTarget
                                        .closest('details')
                                        ?.removeAttribute('open');
                                      openMove(card, s.id);
                                    }}
                                  >
                                    <i
                                      className="bi-arrow-right icon-sm"
                                      aria-hidden="true"
                                    />
                                    {statusLabel(s)}
                                  </button>
                                ))}
                            </div>
                          </details>
                          <div className="text-muted mt-2 flex flex-wrap items-center gap-3 text-xs">
                            <span title={t('Applied')}>
                              <i className="bi bi-send mr-1" />
                              {card.applied_at
                                ? t('tasks.daysShort', {
                                    count: Math.max(
                                      0,
                                      Math.floor(
                                        (Date.now() -
                                          Date.parse(card.applied_at)) /
                                          86_400_000
                                      )
                                    ),
                                  })
                                : '—'}
                            </span>
                            <span title={t('Interview Rounds')}>
                              <i className="bi bi-people mr-1" />
                              {card.round_count}
                            </span>
                            {card.next_interview_at && (
                              <span className="text-orange-bright">
                                <i className="bi bi-calendar-event mr-1" />
                                {new Date(
                                  card.next_interview_at
                                ).toLocaleString(locale(), {
                                  timeZone: zone ?? undefined,
                                  weekday: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hourCycle: 'h23',
                                })}
                              </span>
                            )}
                            {card.open_reminder_count > 0 && (
                              <i
                                className="bi bi-bell-fill text-yellow-bright"
                                title={t('kit.reminders')}
                              />
                            )}
                            {card.priority === 'high' && (
                              <i
                                className="bi bi-flag-fill text-orange-bright"
                                title={t('tasks.highPriority')}
                              />
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                    {cards.length < (column?.count ?? 0) && (
                      <button
                        disabled={Boolean(loadingColumn)}
                        onClick={() => void loadMore(status.id)}
                        className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent mt-3 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                      >
                        <i
                          className="bi-arrow-right icon-sm"
                          aria-hidden="true"
                        />
                        {t('tasks.loadMore')}
                      </button>
                    )}
                    {!cards.length && (
                      <p className="text-muted py-6 text-xs">
                        {t('tasks.noCards')}
                      </p>
                    )}
                  </>
                )}
              </section>
            );
          })}
      </div>

      {move && zone && (
        <StatusChangeDialog
          options={
            statuses.data?.map((s) => ({
              value: s.id,
              label: statusLabel(s),
              meaning: s.meaning,
            })) ?? []
          }
          statusId={move.status}
          timeZone={zone}
          onClose={() => setMove(null)}
          onSave={async (draft) => {
            try {
              await apiV030.updateApplication(move.card.id, {
                expected_revision: move.card.evidence_revision,
                status_id: draft.status_id,
                status_changed_at: draft.changed_at,
                status_comment: draft.comment || null,
                status_reason: draft.reason,
              });
              setExtra({ key: '', cards: {}, pages: {} });
              await client.invalidateQueries({
                predicate: ({ queryKey }) =>
                  [
                    'application-board',
                    'applications',
                    'dashboard-overview',
                    'application-history',
                    'application',
                  ].includes(String(queryKey[0])),
              });
            } catch (error) {
              if (isAxiosError(error) && error.response?.status === 409) {
                toast.error(t('tasks.boardConflict'));
                setMove(null);
              }
              throw error;
            }
          }}
        />
      )}
    </>
  );
}
