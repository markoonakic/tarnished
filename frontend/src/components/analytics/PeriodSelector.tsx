import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

const PERIODS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '3m', label: '3m' },
  {
    value: 'all',
    get label() {
      return t('All');
    },
  },
] as const;

type Period = (typeof PERIODS)[number]['value'];

interface PeriodSelectorProps {
  onPeriodChange?: (period: Period) => void;
}

export default function PeriodSelector({
  onPeriodChange,
}: PeriodSelectorProps) {
  useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPeriod = (searchParams.get('period') as Period) || '7d';

  const handlePeriodChange = (period: Period) => {
    const next = new URLSearchParams(searchParams);
    next.set('period', period);
    setSearchParams(next);
    onPeriodChange?.(period);
  };

  return (
    <div className="flex gap-2">
      {PERIODS.map((period) => (
        <Button
          variant="primary"
          key={period.value}
          onClick={() => handlePeriodChange(period.value)}
          className={` ${currentPeriod === period.value ? '' : ''} `}
        >
          {period.label}
        </Button>
      ))}
    </div>
  );
}
