import { Link } from 'react-router-dom';
import type { PipelineMetrics } from '@/lib/analytics';
import HelpTip from '../HelpTip';

const stageName = (value: string) =>
  value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
function duration(hours: number) {
  if (hours > 0 && hours < 1 / 60) return '<1m';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return hours < 24
    ? `${hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}h`
    : `${(hours / 24).toLocaleString(undefined, { maximumFractionDigits: 1 })}d`;
}

export default function StageResidence({
  metrics,
}: {
  metrics: PipelineMetrics;
}) {
  const completed = new Map<string, { hours: number; count: number }>();
  for (const visit of metrics.visits) {
    if (visit.kind !== 'completed' || visit.hours === null) continue;
    const stage = completed.get(visit.meaning) ?? { hours: 0, count: 0 };
    stage.hours += visit.hours;
    stage.count++;
    completed.set(visit.meaning, stage);
  }
  const waiting = metrics.applications
    .filter((app) => app.current_stage_age_hours !== null)
    .sort((a, b) => b.current_stage_age_hours! - a.current_stage_age_hours!)
    .slice(0, 5);
  if (!completed.size && !waiting.length) return null;

  return (
    <section className="border-tertiary mt-6 space-y-4 border-t pt-4">
      {completed.size > 0 && (
        <>
          <h3 className="text-fg1 flex items-center gap-2 font-semibold">
            Time in Stage
            <HelpTip label="About time in stage">
              <p>
                Average time for completed stage visits. Unfinished visits and
                missing dates are excluded.
              </p>
            </HelpTip>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-tertiary border-b">
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Average time</th>
                  <th className="px-3 py-2">Completed visits</th>
                </tr>
              </thead>
              <tbody>
                {[...completed].map(([meaning, stage]) => (
                  <tr key={meaning} className="border-tertiary border-b">
                    <td className="px-3 py-2">{stageName(meaning)}</td>
                    <td className="px-3 py-2">
                      {duration(stage.hours / stage.count)}
                    </td>
                    <td className="px-3 py-2">{stage.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {waiting.length > 0 && (
        <>
          <h3 className="text-fg1 flex items-center gap-2 font-semibold">
            Longest Waits
            <HelpTip label="About longest waits">
              <p>Applications still open, by time in their current stage.</p>
            </HelpTip>
          </h3>
          <ul className="space-y-2">
            {waiting.map((app) => (
              <li key={app.application_id}>
                <Link
                  to={`/applications/${app.application_id}`}
                  aria-label={`${app.company} · ${app.job_title}, ${stageName(app.as_of_meaning)}, ${duration(app.current_stage_age_hours!)}`}
                  className="bg-bg2 hover:bg-bg3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm transition-all duration-200 ease-in-out"
                >
                  <span className="text-fg1 min-w-0">
                    {app.company} · {app.job_title}
                  </span>
                  <span className="text-muted">
                    {stageName(app.as_of_meaning)} ·{' '}
                    {duration(app.current_stage_age_hours!)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
