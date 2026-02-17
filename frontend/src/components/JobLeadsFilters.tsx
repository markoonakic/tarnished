import Dropdown, { type DropdownOption } from './Dropdown';

export interface JobLeadsFiltersValue {
  status: string;
  source: string;
  sort: string;
  perPage: number;
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

const perPageOptions: DropdownOption[] = [
  { value: '10', label: '10 / page' },
  { value: '25', label: '25 / page' },
  { value: '50', label: '50 / page' },
  { value: '100', label: '100 / page' },
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

  function handlePerPageChange(perPageStr: string) {
    onChange({ ...value, perPage: Number(perPageStr) });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dropdown
        options={statusOptions}
        value={value.status}
        onChange={handleStatusChange}
        placeholder="All Statuses"
        size="xs"
        containerBackground="bg1"
      />
      <Dropdown
        options={sourceOptions}
        value={value.source}
        onChange={handleSourceChange}
        placeholder="All Sources"
        size="xs"
        containerBackground="bg1"
        disabled={sources.length === 0}
      />
      <Dropdown
        options={sortOptions}
        value={value.sort}
        onChange={handleSortChange}
        placeholder="Newest First"
        size="xs"
        containerBackground="bg1"
      />
      <Dropdown
        options={perPageOptions}
        value={String(value.perPage)}
        onChange={handlePerPageChange}
        placeholder="25 / page"
        size="xs"
        containerBackground="bg1"
      />
    </div>
  );
}
