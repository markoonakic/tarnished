import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { JobFields } from '@/lib/apiV030';
import Dropdown from '../Dropdown';
import TagInput from '../TagInput';

import {
  workModes,
  employmentTypes,
  priorities,
  payPeriods,
  recordInput,
} from '@/lib/records';

export default function JobMetadataFields({
  value,
  onChange,
}: {
  value: JobFields;
  onChange: (fields: JobFields) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const selects = [
    ['work_mode', workModes],
    ['employment_type', employmentTypes],
    ['priority', priorities],
    ['pay_period', payPeriods],
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {selects.map(([key, values]) => (
        <div key={key}>
          <label htmlFor={id + key} className="text-muted mb-1 block text-sm">
            {t('records.' + key)}
          </label>
          <Dropdown
            id={id + key}
            value={value[key] || (key === 'priority' ? 'normal' : '')}
            options={[
              ...(key === 'priority'
                ? []
                : [{ value: '', label: t('records.unspecified') }]),
              ...values.map((value) => ({
                value,
                label: t('records.' + value),
              })),
            ]}
            onChange={(selected) =>
              onChange({ ...value, [key]: selected || null })
            }
          />
        </div>
      ))}
      <label className="text-muted block text-sm">
        {t('records.seniority')}
        <input
          className={recordInput}
          maxLength={100}
          value={value.seniority || ''}
          onChange={(event) =>
            onChange({ ...value, seniority: event.target.value || null })
          }
        />
      </label>
      <label className="text-muted block text-sm">
        {t('records.deadline')}
        <input
          type="date"
          className={recordInput}
          value={value.deadline || ''}
          onChange={(event) =>
            onChange({ ...value, deadline: event.target.value || null })
          }
        />
      </label>
      <div className="sm:col-span-2">
        <TagInput
          label={t('records.tags')}
          value={value.tags || []}
          onChange={(tags) => onChange({ ...value, tags })}
        />
      </div>
    </div>
  );
}
