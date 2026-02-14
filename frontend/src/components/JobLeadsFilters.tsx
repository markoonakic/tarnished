import Dropdown, { type DropdownOption } from './Dropdown';

export interface JobLeadsFiltersValue {
  status: string;
  source: string;
  sort: string;
}

interface JobLeadsFiltersProps {
  value: JobLeadsFiltersValue;
  onChange: (value: JobLeadsFiltersValue) => void;
  sources: string[];
}

const statusOptions: DropdownOption[] = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'extracted', label: 'Extracted' },
  { value: 'failed', label: 'Failed' },
];

const sortOptions: DropdownOption[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
];

export default function JobLeadsFilters({ value, onChange, sources }: JobLeadsFiltersProps) {
  const sourceOptions: DropdownOption[] = [
    { value: '', label: 'All Sources' },
    ...sources.map((source) => ({ value: source, label: source })),
  ];

  function handleStatusChange(status: string) {
    onChange({ ...value, status });
  }

  function handleSourceChange(source: string) {
    onChange({ ...value, source });
  }

  function handleSortChange(sort: string) {
    onChange({ ...value, sort });
  }

  return (
    <div className="flex flex-wrap gap-3">
      <div className="min-w-[140px]">
        <label className="block text-xs font-medium text-muted mb-1">Status</label>
        <Dropdown
          options={statusOptions}
          value={value.status}
          onChange={handleStatusChange}
          placeholder="All Statuses"
          size="xs"
          containerBackground="bg1"
        />
      </div>
      <div className="min-w-[140px]">
        <label className="block text-xs font-medium text-muted mb-1">Source</label>
        <Dropdown
          options={sourceOptions}
          value={value.source}
          onChange={handleSourceChange}
          placeholder="All Sources"
          size="xs"
          containerBackground="bg1"
          disabled={sources.length === 0}
        />
      </div>
      <div className="min-w-[140px]">
        <label className="block text-xs font-medium text-muted mb-1">Sort</label>
        <Dropdown
          options={sortOptions}
          value={value.sort}
          onChange={handleSortChange}
          placeholder="Newest First"
          size="xs"
          containerBackground="bg1"
        />
      </div>
    </div>
  );
}
