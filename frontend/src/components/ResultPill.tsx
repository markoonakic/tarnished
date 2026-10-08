import { useTranslation } from 'react-i18next';
import { pillStyle } from '@/lib/uiPills';
export type MatchResult = 'confirmed' | 'partial' | 'no_evidence' | 'unknown';
const results = {
  confirmed: ['✓', '--green-bright'],
  partial: ['◐', '--yellow-bright'],
  no_evidence: ['✕', '--red-bright'],
  unknown: ['?', '--gray'],
} as const;
export default function ResultPill({
  result,
  count,
}: {
  result: MatchResult;
  count?: number;
}) {
  const { t } = useTranslation();
  const [icon, color] = results[result];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={pillStyle(color)}
    >
      <span aria-hidden="true">{icon}</span>
      {t(`kit.result.${result}`)}
      {count !== undefined && <> {count}</>}
    </span>
  );
}
