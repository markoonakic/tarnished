import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiV030 } from '@/lib/apiV030';
import SearchableCombobox from './SearchableCombobox';
import { Link } from 'react-router-dom';
export default function InterviewParticipants({
  value,
  onChange,
  companyId,
  readOnly = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  companyId?: string | null;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(false);
  const contacts = useQuery({
    queryKey: ['interview-participants', companyId],
    queryFn: async () => {
      const items = [];
      for (let page = 1; ; page++) {
        const result = await apiV030.contacts({ per_page: 100, page });
        items.push(...result.items);
        if (items.length >= result.total || !result.items.length)
          return items.sort(
            (a, b) =>
              Number(b.company_id === companyId) -
              Number(a.company_id === companyId)
          );
      }
    },
  });
  const add = (id: string) => {
    if (id && !value.includes(id)) onChange([...value, id]);
    setAdding(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((id) => {
          const item = contacts.data?.find((c) => c.id === id);
          return (
            <span
              key={id}
              className="bg-bg2 inline-flex items-center gap-2 rounded px-2 py-1 text-xs"
            >
              <Link to={`/contacts/${id}`}>
                {item?.name ?? t('tasks.openContact')}
                {item?.role ? ` · ${item.role}` : ''}
              </Link>
              {!readOnly && (
                <button
                  aria-label={t('tasks.removeParticipant', {
                    name: item?.name ?? id,
                  })}
                  onClick={() => onChange(value.filter((v) => v !== id))}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="text-accent focus:ring-accent rounded text-xs focus:ring-2"
        >
          + {t('tasks.addParticipant')}
        </button>
      </div>
      {adding && (
        <SearchableCombobox
          value=""
          options={
            contacts.data
              ?.filter((c) => !value.includes(c.id))
              .map((c) => ({
                value: c.id,
                label: [c.name, c.function].filter(Boolean).join(' · '),
              })) ?? []
          }
          placeholder={t('tasks.selectContact')}
          onChange={add}
          onCreate={async (name) => {
            try {
              const c = await apiV030.createContact({
                name,
                company_id: companyId,
              });
              await client.invalidateQueries({
                queryKey: ['interview-participants'],
              });
              add(c.id);
            } catch {
              setError(true);
            }
          }}
        />
      )}
      {(error || contacts.isError) && (
        <p role="alert" className="text-red-bright text-xs">
          {t('tasks.loadFailed')}
        </p>
      )}
    </div>
  );
}
