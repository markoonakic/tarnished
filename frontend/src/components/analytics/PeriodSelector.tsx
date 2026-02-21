import { useSearchParams } from 'react-router-dom';

const PERIODS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '3m', label: '3m' },
  { value: 'all', label: 'All' },
] as const;

type Period = (typeof PERIODS)[number]['value'];

interface PeriodSelectorProps {
  onPeriodChange?: (period: Period) => void;
}

export default function PeriodSelector({
  onPeriodChange,
}: PeriodSelectorProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPeriod = (searchParams.get('period') as Period) || '7d';

  const handlePeriodChange = (period: Period) => {
    setSearchParams({ period });
    onPeriodChange?.(period);
  };

  return (
    <div className="flex gap-2">
      {PERIODS.map((period) => (
        <button
          key={period.value}
          onClick={() => handlePeriodChange(period.value)}
          className={`cursor-pointer rounded-lg px-4 py-2 font-medium transition-all duration-200 ease-in-out ${
            currentPeriod === period.value
              ? 'bg-accent text-bg1'
              : 'text-fg1 hover:bg-bg2 hover:text-fg0 bg-transparent'
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
