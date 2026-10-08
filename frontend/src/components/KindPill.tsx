import { useTranslation } from 'react-i18next';
import { reminderKinds, pillStyle, type ReminderKind } from '@/lib/uiPills';
export default function KindPill({ kind }: { kind: ReminderKind }) {
  const { t } = useTranslation();
  const { icon, color } = reminderKinds[kind];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={pillStyle(color)}
    >
      <i className={`bi ${icon} text-xs`} aria-hidden="true" />
      {t(`kit.kind.${kind}`)}
    </span>
  );
}
