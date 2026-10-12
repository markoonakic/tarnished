import { randomId } from '@/lib/randomId';
import TextLink from '@/components/ui/TextLink';
import Button from '@/components/ui/Button';
import { useRef, useState } from 'react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiV030 } from '@/lib/apiV030';
import SearchableCombobox from './SearchableCombobox';

export default function InterviewParticipants({
  value,
  onChange,
  companyId,
  readOnly = false,
  containerBackground = 'bg1',
  onPendingChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  companyId?: string | null;
  readOnly?: boolean;
  onPendingChange?: (pending: boolean) => void;
  containerBackground?: 'bg1' | 'bg2' | 'bg3';
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [requestKey, setRequestKey] = useState(() => randomId());
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const createLock = useRef(false);
  useUnsavedChanges(creating);
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
              <TextLink to={`/contacts/${id}`}>
                {item?.name ?? t('tasks.openContact')}
                {item?.role
                  ? ` · ${t('tasks.role.' + item.role, { defaultValue: item.role })}`
                  : ''}
              </TextLink>
              {!readOnly && (
                <Button
                  variant="icon"
                  disabled={creating}
                  aria-label={t('tasks.removeParticipant', {
                    name: item?.name ?? id,
                  })}
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  className="flex items-center gap-1.5"
                >
                  ×
                </Button>
              )}
            </span>
          );
        })}
        <Button
          type="button"
          disabled={creating}
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1.5"
        >
          <i className="bi-plus-lg icon-sm" aria-hidden="true" />
          {t('tasks.addParticipant')}
        </Button>
      </div>
      {adding && (
        <SearchableCombobox
          disabled={creating}
          containerBackground={containerBackground}
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
            if (createLock.current) return;
            createLock.current = true;
            setCreating(true);
            onPendingChange?.(true);
            setError(false);
            try {
              const c = await apiV030.createContact(
                {
                  name,
                  company_id: companyId,
                },
                requestKey
              );
              setRequestKey(randomId());
              await client.invalidateQueries({
                queryKey: ['interview-participants'],
              });
              add(c.id);
              setError(false);
            } catch {
              setError(true);
            } finally {
              createLock.current = false;
              setCreating(false);
              onPendingChange?.(false);
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
