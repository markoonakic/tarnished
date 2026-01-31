import { useSearchParams } from 'react-router-dom';

const PERIODS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '3m', label: '3m' },
  { value: 'all', label: 'All' },
] as const;

type Period = typeof PERIODS[number]['value'];

interface PeriodSelectorProps {
  onPeriodChange?: (period: Period) => void;
}

export default function PeriodSelector({ onPeriodChange }: PeriodSelectorProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPeriod = (searchParams.get('period') as Period) || '7d';

  const handlePeriodChange = (period: Period) => {
    setSearchParams({ period });
    onPeriodChange?.(period);
  };

  return (
    <div className="flex gap-2 mb-6">
      {PERIODS.map((period) => (
        <button
          key={period.value}
          onClick={() => handlePeriodChange(period.value)}
          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ease-in-out cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-aqua/50 ${
            currentPeriod === period.value
              ? 'bg-accent-aqua text-bg1'
              : 'bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0'
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
