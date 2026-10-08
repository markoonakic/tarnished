import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import SearchableCombobox from './SearchableCombobox';
import { apiV030, type TargetType } from '@/lib/apiV030';
import { useTranslation } from 'react-i18next';
export default function ReminderRecordPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string, target?: { type: TargetType; id: string }) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['reminder-picker', search],
    queryFn: async () => {
      const [apps, leads, companies] = await Promise.all([
        apiV030.applications({ search, per_page: 25 }),
        apiV030.leads({ search, per_page: 25 }),
        apiV030.companies({ query: search, per_page: 25 }),
      ]);
      return [
        ...apps.items.map((a) => ({
          value: `application:${a.id}`,
          label: `${a.company} — ${a.job_title}`,
          type: 'application' as const,
          id: a.id,
        })),
        ...leads.items.map((a) => ({
          value: `lead:${a.id}`,
          label: [a.company, a.title].filter(Boolean).join(' — '),
          type: 'lead' as const,
          id: a.id,
        })),
        ...companies.items.map((a) => ({
          value: `company:${a.id}`,
          label: a.name,
          type: 'company' as const,
          id: a.id,
        })),
      ];
    },
  });
  return (
    <div>
      <input
        aria-label={t('tasks.searchRecords')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="bg-bg2 focus:ring-accent mb-2 w-full rounded px-3 py-2 text-sm focus:ring-2"
        placeholder={t('tasks.searchRecords')}
      />
      <SearchableCombobox
        options={[
          { value: '', label: t('tasks.noRelatedRecord') },
          ...(query.data ?? []),
        ]}
        value={value}
        onChange={(v) => {
          const found = query.data?.find((r) => r.value === v);
          onChange(v, found);
        }}
        placeholder={t('tasks.noRelatedRecord')}
      />
    </div>
  );
}
