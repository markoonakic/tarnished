import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiV030, type Company } from '@/lib/apiV030';
import { errorMessage } from '@/lib/errorMessage';
import { recordCompanies } from '@/lib/records';
import SearchableCombobox from '../SearchableCombobox';

export default function CompanyPicker({
  id,
  value,
  name,
  onChange,
  disabled,
}: {
  id?: string;
  value?: string | null;
  name?: string | null;
  onChange: (id: string | null, name: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    recordCompanies()
      .then((data) => {
        if (current) setCompanies(data);
      })
      .catch(() => {
        if (current) setError(t('records.companiesFailed'));
      });
    return () => {
      current = false;
    };
  }, [t]);
  return (
    <>
      <SearchableCombobox
        id={id}
        value={value || (name ? 'snapshot' : '')}
        options={[
          ...(name && !companies.some((company) => company.id === value)
            ? [{ value: value || 'snapshot', label: name }]
            : []),
          ...companies.map((company) => ({
            value: company.id,
            label: company.name,
          })),
        ]}
        placeholder={t('records.company')}
        disabled={disabled || busy}
        onChange={(id) => {
          const company = companies.find((company) => company.id === id);
          if (company) onChange(company.id, company.name);
        }}
        onCreate={async (name) => {
          setBusy(true);
          setError('');
          try {
            const created = await apiV030.createCompany({ name });
            setCompanies((items) => [...items, created]);
            onChange(created.id, created.name);
          } catch (error) {
            setError(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      />
      {error && (
        <p role="alert" className="text-red mt-1 text-xs">
          {error}
        </p>
      )}
    </>
  );
}
