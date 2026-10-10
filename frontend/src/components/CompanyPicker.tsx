import { useState } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import SearchableCombobox from './SearchableCombobox';
import { apiV030 } from '@/lib/apiV030';
import { allCompanies, failureMessage } from './companies/addressBook';

export default function CompanyPicker({
  value,
  name = '',
  onChange,
  id,
  disabled = false,
}: {
  value?: string | null;
  name?: string;
  onChange: (id: string | null, name: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient(queryClient);
  const query = useQuery(
    { queryKey: ['companies', 'picker'], queryFn: allCompanies },
    queryClient
  );
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');
  const options = (query.data ?? []).map((company) => ({
    value: company.id,
    label: [company.name, company.location || company.website]
      .filter(Boolean)
      .join(' — '),
  }));
  // Keep legacy names and selected records visible while the address book loads.
  const selected = value || (name ? 'legacy:' + name : '');
  if (selected && !options.some((option) => option.value === selected))
    options.unshift({ value: selected, label: name });
  return (
    <div>
      <SearchableCombobox
        id={id}
        value={selected}
        options={options}
        disabled={disabled || busy}
        placeholder={t('companies.selectCompany')}
        onChange={(id) => {
          setError('');
          onChange(
            id.startsWith('legacy:') ? null : id,
            query.data?.find((company) => company.id === id)?.name ?? name
          );
        }}
        onCreate={async (name) => {
          setBusy(true);
          setError('');
          try {
            const company = await apiV030.createCompany({ name }, requestKey);
            await client.invalidateQueries({ queryKey: ['companies'] });
            onChange(company.id, company.name);
            setRequestKey(crypto.randomUUID());
          } catch (error) {
            setError(failureMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      />
      {(error || query.isError) && (
        <p role="alert" className="text-red mt-1 text-sm">
          {error || failureMessage(query.error)}
        </p>
      )}
    </div>
  );
}
