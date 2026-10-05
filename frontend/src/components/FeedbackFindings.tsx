import type {
  FeedbackCitation,
  FeedbackFinding,
  FeedbackSource,
  FeedbackState,
} from '../hooks/useFeedback';

import { historyStageLabels } from '../lib/history';
import type { StatusMeaning } from '../lib/types';

type Report = NonNullable<FeedbackState['report']>;
const disclosure =
  'border-bg3 rounded border p-3 [&>summary]:cursor-pointer [&>summary]:text-fg1 [&>summary]:font-semibold [&>summary]:focus-visible:outline-accent';

function recordValue(quote?: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(quote ?? '');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
const text = (value: unknown) =>
  typeof value === 'string' && value ? value : 'Not recorded';

function stageText(value: unknown) {
  return typeof value === 'string' && Object.hasOwn(historyStageLabels, value)
    ? historyStageLabels[value as StatusMeaning]
    : text(value);
}

function citationText(quote: string, timeZone?: string) {
  let value = quote;
  try {
    const parsed: unknown = JSON.parse(quote);
    if (typeof parsed === 'string') value = parsed;
  } catch {
    // Plain saved text does not need JSON decoding.
  }
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/
  );
  if (!match) return quote;
  const [, day, clock, fraction = '', offset] = match;
  const calendarValue = `${day}T${clock ?? '00:00:00'}${fraction}`;
  const calendar = new Date(`${calendarValue}Z`);
  if (
    !Number.isFinite(calendar.getTime()) ||
    !calendar.toISOString().startsWith(day)
  )
    return quote;
  const date = offset ? new Date(`${calendarValue}${offset}`) : calendar;
  if (!Number.isFinite(date.getTime())) return quote;
  // Offset-free values are calendar fields, not inferred UTC instants.
  return date.toLocaleString(undefined, {
    timeZone: offset ? timeZone : 'UTC',
    dateStyle: 'medium',
    ...(clock ? { timeStyle: 'short' as const } : {}),
  });
}

function sourceLabel(source?: FeedbackSource) {
  if (source?.id.includes(':interview_findings:'))
    return 'Earlier AI feedback · not verified experience';
  if (source?.kind === 'profile') return 'Saved profile statement';
  if (source?.kind === 'requirement') return 'Role requirement';
  if (source?.kind === 'history') return 'Recorded history';
  if (source?.kind === 'round') {
    if (source.id.includes(':scheduled_at:'))
      return 'Scheduled round · not proof of attendance';
    if (source.id.includes(':completed_at:')) return 'Round completed';
    if (source.id.includes(':outcome:')) return 'Round outcome';
    return 'Round record';
  }
  if (source?.kind === 'cv') return 'Current CV · not proof of submission';
  if (source?.kind === 'cover_letter')
    return 'Current cover letter · not proof of submission';
  return 'Application record';
}

function Passage({
  citation,
  label,
  timeZone,
}: {
  citation: FeedbackCitation;
  label: string;
  timeZone?: string;
}) {
  const value = citationText(citation.quote, timeZone);
  return (
    <blockquote className="border-accent bg-bg1 space-y-1 border-l-2 px-4 py-3">
      <p className="text-fg2 text-xs">{label}</p>
      <p
        className="text-fg1 whitespace-pre-line"
        title={value !== citation.quote ? citation.quote : undefined}
      >
        {value}
      </p>
    </blockquote>
  );
}

/** Only optional, validated coaching changes presentation. Legacy actions stay verbatim. */
export default function FeedbackFindings({
  report,
  scope,
}: {
  report: Report;
  scope: 'interview' | 'application' | 'pipeline';
}) {
  const rich = (finding: FeedbackFinding) =>
    finding.coaching?.version === 1 && finding.coaching.kind === scope;
  const first = report.findings.findIndex(rich);
  if (first === -1)
    return (
      <>
        {scope !== 'interview' && report.findings[0] && (
          <p className="text-fg1 break-words">
            {report.findings[0].observation}
          </p>
        )}
        <ul className="text-fg1 marker:text-accent list-disc space-y-3 pl-5">
          {report.findings.map((finding, index) => (
            <li key={index} className="pl-1 break-words whitespace-pre-line">
              {finding.action}
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <div className="space-y-4">
      {scope === 'pipeline' && <SavedMetrics report={report} />}
      {report.findings.map((finding, index) => {
        const coaching = rich(finding) ? finding.coaching : undefined;
        if (!coaching)
          return (
            <div
              key={index}
              className="text-fg1 break-words whitespace-pre-line"
            >
              <p>{finding.action}</p>
            </div>
          );
        return (
          <article
            key={index}
            className="bg-bg2 text-fg1 min-w-0 space-y-4 rounded-lg p-4 break-words sm:p-5"
            aria-label={coaching.title}
          >
            <h4 className="text-primary text-base font-semibold">
              {coaching.title}
            </h4>
            {coaching.kind === 'interview' && (
              <>
                {coaching.question && (
                  <p className="text-fg2 text-sm">
                    <span className="font-semibold">Recorded question: </span>
                    {coaching.question.quote}
                  </p>
                )}
                {finding.citations[coaching.answer_citation] && (
                  <Passage
                    citation={finding.citations[coaching.answer_citation]}
                    label="Your answer"
                  />
                )}
              </>
            )}
            <p className="whitespace-pre-line">{finding.observation}</p>
            {coaching.kind === 'application' &&
              coaching.context_citations.map((citationIndex) => {
                const citation = finding.citations[citationIndex];
                return citation ? (
                  <Passage
                    key={citationIndex}
                    citation={citation}
                    timeZone={report.time_zone}
                    label={sourceLabel(
                      report.sources.find((s) => s.id === citation.source_id)
                    )}
                  />
                ) : null;
              })}
            <div className="space-y-1">
              <h5 className="text-primary text-sm font-semibold">
                Why this matters
              </h5>
              <p className="whitespace-pre-line">{finding.interpretation}</p>
            </div>
            {coaching.kind === 'interview' ? (
              <>
                <details className={disclosure} open={index === first}>
                  <summary>Better answer</summary>
                  <p className="text-fg2 mt-3 text-xs">
                    Proposed wording · check the facts before using it
                  </p>
                  <p className="mt-2 whitespace-pre-line">
                    {coaching.better_answer}
                  </p>
                </details>
                <details className={disclosure} open={index === first}>
                  <summary>Practise this</summary>
                  <p className="mt-3 whitespace-pre-line">{finding.action}</p>
                </details>
                <details className={disclosure}>
                  <summary>Role requirement</summary>
                  <div className="mt-3 space-y-3">
                    {finding.citations
                      .filter((c) =>
                        report.sources.some(
                          (s) =>
                            s.id === c.source_id && s.kind === 'requirement'
                        )
                      )
                      .map((citation, i) => (
                        <Passage
                          key={i}
                          citation={citation}
                          label="Exact cited requirement"
                        />
                      ))}
                  </div>
                </details>
              </>
            ) : (
              <>
                {coaching.kind === 'application' ? (
                  <div className="space-y-3">
                    <h5 className="text-primary text-sm font-semibold">
                      Next steps · use a confirmed condition
                    </h5>
                    {coaching.branches.map((branch, i) => (
                      <details key={i} className={disclosure} open={i === 0}>
                        <summary>{branch.condition}</summary>
                        <p className="mt-3 whitespace-pre-line">
                          {branch.action}
                        </p>
                      </details>
                    ))}
                    {coaching.draft && (
                      <details className={disclosure} open={index === first}>
                        <summary>Conditional draft</summary>
                        <p className="mt-3 whitespace-pre-line">
                          {coaching.draft.condition}
                        </p>
                        <p className="text-fg2 mt-2 text-xs">
                          Writing example only. Check the condition and fill the
                          brackets. Nothing is sent.
                        </p>
                        <blockquote className="bg-bg1 mt-3 rounded p-4 whitespace-pre-line">
                          {coaching.draft.text}
                        </blockquote>
                      </details>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3" aria-label="Records to check">
                    {coaching.records.map((step, i) => {
                      const record = recordValue(
                        finding.citations[step.record_citation]?.quote
                      );
                      if (!record) return null;
                      const id = text(record.application_id);
                      // Imported quotes keep archived identities; import clears the fingerprint.
                      const link =
                        report.fingerprint &&
                        /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
                          id
                        );
                      return (
                        <section
                          key={i}
                          className="bg-bg1 space-y-2 rounded p-4"
                        >
                          <h5 className="text-primary font-semibold">
                            {link ? (
                              <a
                                className="text-fg1 underline underline-offset-2 hover:decoration-2"
                                href={`/applications/${encodeURIComponent(id)}`}
                              >
                                {text(record.company)}
                              </a>
                            ) : (
                              text(record.company)
                            )}
                          </h5>
                          <p className="text-fg2 text-sm">
                            {text(record.role)} · Applied{' '}
                            {text(record.applied_at)}
                          </p>
                          <p className="text-fg2 text-sm">
                            Source: {text(record.source)} · Current stage:{' '}
                            {stageText(record.current_stage)}
                          </p>
                          {record.stage_at_report_date !==
                            record.current_stage && (
                            <p className="text-fg2 text-sm">
                              Stage at report date:{' '}
                              {stageText(record.stage_at_report_date)}
                            </p>
                          )}
                          {record.history_incomplete === true && (
                            <p className="text-fg2 text-sm">
                              Recorded history is incomplete.
                            </p>
                          )}
                          {step.round_citations?.map((c) => {
                            const round = recordValue(
                              finding.citations[c]?.quote
                            );
                            return round ? (
                              <p key={c} className="text-fg2 text-sm">
                                {text(round.round_type)} · Scheduled:{' '}
                                {text(round.scheduled_at)} · Completed:{' '}
                                {text(round.completed_at)} · Outcome:{' '}
                                {text(round.outcome)}
                              </p>
                            ) : null;
                          })}
                          <p className="whitespace-pre-line">
                            <span className="font-semibold">Check: </span>
                            {step.condition}
                          </p>
                          <p className="whitespace-pre-line">{step.action}</p>
                        </section>
                      );
                    })}
                  </div>
                )}
                <div className="border-accent border-l-2 pl-4">
                  <h5 className="text-fg1 text-sm font-semibold">Next step</h5>
                  <p className="mt-1 whitespace-pre-line">{finding.action}</p>
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

function SavedMetrics({ report }: { report: Report }) {
  const metrics = recordValue(
    report.sources.find(
      (s) => s.id === 'pipeline:metrics:0' && s.kind === 'pipeline_metrics'
    )?.text
  );
  if (!metrics) return null;
  return (
    <div className="space-y-2" aria-label="Saved cohort metrics">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['Applications', 'total_applications', null],
            ['Responses', 'responded', 'response_rate'],
            ['Reached interview', 'interviews', 'interview_rate'],
            ['Offers', 'offers', 'offer_rate'],
          ] as const
        ).map(([label, count, rate]) => (
          <div key={count} className="bg-bg2 rounded p-3">
            <dt className="text-fg2 text-xs">{label}</dt>
            <dd className="text-primary mt-1 text-lg font-semibold">
              {typeof metrics[count] === 'number'
                ? String(metrics[count])
                : 'Not recorded'}
            </dd>
            {rate && (
              <dd className="text-fg2 text-xs">
                {typeof metrics[rate] === 'number'
                  ? `${metrics[rate]}%`
                  : 'Rate unavailable'}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
