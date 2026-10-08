import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
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
  {
    value: '',
    get label() {
      return t('All Statuses');
    },
  },
  {
    value: 'pending',
    get label() {
      return t('Saved / not extracted');
    },
  },
  {
    value: 'processing',
    get label() {
      return t('Processing / possibly interrupted');
    },
  },
  {
    value: 'converted',
    get label() {
      return t('Converted');
    },
  },
  {
    value: 'extracted',
    get label() {
      return t('Extracted');
    },
  },
  {
    value: 'failed',
    get label() {
      return t('Failed');
    },
  },
];

const sortOptions: DropdownOption[] = [
  {
    value: 'newest',
    get label() {
      return t('Newest First');
    },
  },
  {
    value: 'oldest',
    get label() {
      return t('Oldest First');
    },
  },
];

const perPageOptions: DropdownOption[] = [
  {
    value: '10',
    get label() {
      return t('10 / page');
    },
  },
  {
    value: '25',
    get label() {
      return t('25 / page');
    },
  },
  {
    value: '50',
    get label() {
      return t('50 / page');
    },
  },
  {
    value: '100',
    get label() {
      return t('100 / page');
    },
  },
];

export default function JobLeadsFilters({
  value,
  onChange,
  sources,
}: JobLeadsFiltersProps) {
  useTranslation();
  const sourceOptions: DropdownOption[] = [
    { value: '', label: t('All Sources') },
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
        placeholder={t('All Statuses')}
        size="xs"
        containerBackground="bg1"
      />
      <Dropdown
        options={sourceOptions}
        value={value.source}
        onChange={handleSourceChange}
        placeholder={t('All Sources')}
        size="xs"
        containerBackground="bg1"
        disabled={sources.length === 0}
      />
      <Dropdown
        options={sortOptions}
        value={value.sort}
        onChange={handleSortChange}
        placeholder={t('Newest First')}
        size="xs"
        containerBackground="bg1"
      />
      <Dropdown
        options={perPageOptions}
        value={String(value.perPage)}
        onChange={handlePerPageChange}
        placeholder={t('25 / page')}
        size="xs"
        containerBackground="bg1"
      />
    </div>
  );
}
