import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import Dropdown, { type DropdownOption } from './Dropdown';

export interface JobLeadsFiltersValue {
  status: string;
  decision?: string;
  source: string;
  sort: string;
  perPage: number;
}

interface JobLeadsFiltersProps {
  value: JobLeadsFiltersValue;
  onChange: (value: JobLeadsFiltersValue) => void;
  sources: string[];
  advanced?: boolean;
}

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
  advanced = false,
}: JobLeadsFiltersProps) {
  useTranslation();
  const sourceOptions: DropdownOption[] = [
    { value: '', label: t('All Sources') },
    ...sources.map((source) => ({ value: source, label: source })),
  ];

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
    <div className="order-1 flex flex-wrap items-center gap-3">
      {!advanced && (
        <>
          <Dropdown
            options={[
              { value: '', label: t('records.allDecisions') },
              { value: 'undecided', label: t('records.undecided') },
              ...['interesting', 'rejected', 'archived'].map((value) => ({
                value,
                label: t('records.decision.' + value),
              })),
            ]}
            value={value.decision || ''}
            onChange={(decision) => onChange({ ...value, decision })}
            placeholder={t('records.allDecisions')}
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
        </>
      )}
      {advanced && (
        <>
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
        </>
      )}
    </div>
  );
}
