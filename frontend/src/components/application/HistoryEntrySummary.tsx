import type { ApplicationStatusHistory } from '../../lib/types';
import { historyStage } from '../../lib/history';
import { getStatusColor } from '../../lib/statusColors';
import { useThemeColors } from '../../hooks/useThemeColors';

export default function HistoryEntrySummary({
  entry,
}: {
  entry: ApplicationStatusHistory;
}) {
  const colors = useThemeColors();
  if (entry.is_gap) return <p className="text-muted text-sm">History gap.</p>;
  const from = historyStage(entry.from_status, entry.from_meaning);
  const to = historyStage(entry.to_status, entry.to_meaning);
  function badge(stage: typeof to) {
    const color = getStatusColor(stage.name, colors, stage.color);
    return (
      <span
        className="rounded px-2 py-1 text-xs font-medium"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {stage.name}
      </span>
    );
  }
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {entry.from_status || entry.from_meaning ? (
          <>
            {badge(from)}
            <i
              className="bi-arrow-right text-muted icon-xs"
              aria-hidden="true"
            />
          </>
        ) : (
          <span className="text-muted text-xs">Application added</span>
        )}
        {badge(to)}
      </div>
      <p className="text-muted text-xs">
        {entry.time_provenance === 'recorded'
          ? new Date(entry.changed_at).toLocaleString()
          : 'Date not confirmed'}
        {entry.corrected_at ? ' · Edited' : ''}
      </p>
      {entry.note && (
        <p className="text-fg1 mt-2 text-sm whitespace-pre-wrap">
          {entry.note}
        </p>
      )}
      {entry.correction_note && (
        <p className="text-muted mt-1 text-sm whitespace-pre-wrap">
          Correction: {entry.correction_note}
        </p>
      )}
    </>
  );
}
