import { useTranslation } from 'react-i18next';
import SegmentedControl from '../SegmentedControl';
export default function ApplicationsViewSwitch({
  view,
  onChange,
}: {
  view: 'list' | 'board';
  onChange: (view: 'list' | 'board') => void;
}) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      label={t('Applications')}
      value={view}
      options={[
        { value: 'list', label: t('tasks.list') },
        { value: 'board', label: t('tasks.board') },
      ]}
      onChange={(v) => onChange(v as 'list' | 'board')}
    />
  );
}
