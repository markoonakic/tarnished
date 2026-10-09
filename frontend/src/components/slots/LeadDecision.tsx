import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { JobLead } from '@/lib/types';
import { apiV030, type LeadDecision as Decision } from '@/lib/apiV030';
import { jobLeadError } from '@/lib/jobLeads';
import SegmentedControl from '../SegmentedControl';

export default function LeadDecision({
  lead,
  onUpdated,
}: {
  lead: JobLead;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="max-w-full text-right">
      {!lead.decision && (
        <p className="text-muted mb-1 text-xs">{t('records.undecided')}</p>
      )}
      <SegmentedControl
        label={t('records.decision')}
        value={lead.decision || null}
        options={(['interesting', 'rejected', 'archived'] as const).map(
          (value) => ({
            value,
            label: t('records.decision.' + value),
            disabled: busy,
          })
        )}
        onChange={async (decision: Decision) => {
          setBusy(true);
          setError('');
          try {
            await apiV030.updateLead(lead.id, {
              decision,
              expected_revision: lead.revision,
            });
            onUpdated?.();
          } catch (error) {
            setError(jobLeadError(error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {lead.decision && (
        <button
          className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent ml-2 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await apiV030.updateLead(lead.id, {
                decision: null,
                expected_revision: lead.revision,
              });
              onUpdated?.();
            } catch (error) {
              setError(jobLeadError(error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <i className="bi-arrow-right icon-sm" aria-hidden="true" />
          {t('records.resetDecision')}
        </button>
      )}
      {error && (
        <p role="alert" className="text-red mt-2 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
