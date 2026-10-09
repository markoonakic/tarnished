import Button from '@/components/ui/Button';
import { useState } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Card from '../Card';
import ContactRow from '../ContactRow';
import SearchableCombobox from '../SearchableCombobox';
import { ContactModal } from './RecordModals';
import { apiV030, type Contact } from '@/lib/apiV030';
import {
  allContacts,
  failureMessage,
  roleLabel,
  roleColor,
} from './addressBook';

export default function LinkedContacts({
  id,
  kind,
  companyId,
  companyName,
  contactId,
  revision,
  onUpdated,
}: {
  id: string;
  kind: 'lead' | 'application';
  companyId?: string | null;
  companyName?: string | null;
  contactId?: string | null;
  revision: number;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient(queryClient);
  const [picker, setPicker] = useState(false);
  const [createName, setCreateName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const contacts = useQuery(
    { queryKey: ['contacts', 'picker'], queryFn: allContacts },
    queryClient
  );
  const links = useQuery(
    {
      queryKey: ['contacts', 'application', id, revision],
      queryFn: () => apiV030.applicationContacts(id),
      enabled: kind === 'application',
    },
    queryClient
  );
  const ids =
    kind === 'application'
      ? (links.data?.contact_ids ?? [])
      : contactId
        ? [contactId]
        : [];
  const missing = useQuery(
    {
      queryKey: ['contacts', 'linked', ids],
      queryFn: () => Promise.all(ids.map((id) => apiV030.contact(id))),
      enabled:
        !!ids.length &&
        ids.some((id) => !contacts.data?.some((contact) => contact.id === id)),
    },
    queryClient
  );
  const byId = new Map(
    (contacts.data ?? [])
      .concat(missing.data ?? [])
      .map((contact) => [contact.id, contact])
  );
  async function save(next: string[]) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (kind === 'application')
        await apiV030.setApplicationContacts(id, {
          contact_ids: next,
          expected_revision: links.data?.revision ?? revision,
        });
      else
        await apiV030.updateLead(id, {
          recruiter_contact_id: next[0] ?? null,
          expected_revision: revision,
        });
      await client.invalidateQueries({
        queryKey: ['contacts', 'application', id],
      });
      onUpdated?.();
      setPicker(false);
    } catch (error) {
      setError(failureMessage(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const available = (contacts.data ?? [])
    .filter((contact) => !ids.includes(contact.id))
    .sort(
      (a, b) =>
        Number(b.company_id === companyId) -
          Number(a.company_id === companyId) || a.name.localeCompare(b.name)
    );
  return (
    <Card
      title={t('companies.contacts')}
      icon="bi-person-lines-fill"
      count={ids.length}
      actions={
        <Button
          type="button"
          disabled={busy || (kind === 'application' && links.isPending)}

          onClick={() => setPicker(!picker)}
        >
          <i className="bi-arrow-right icon-sm" aria-hidden="true" />
          {t('companies.linkContact')}
        </Button>
      }
    >
      <div className="space-y-2">
        {ids.map((id) => {
          const contact = byId.get(id);
          return contact ? (
            <ContactRow
              key={id}
              name={contact.name}
              href={'/contacts/' + id}
              subtitle={contact.function ?? undefined}
              role={roleLabel(contact.role)}
              roleColor={roleColor(contact.role)}
              email={contact.email}
              onUnlink={
                busy
                  ? undefined
                  : () =>
                      void save(ids.filter((value) => value !== id)).catch(
                        () => {}
                      )
              }
            />
          ) : null;
        })}
      </div>
      {!ids.length && (
        <p className="text-muted text-sm">{t('companies.noLinkedContacts')}</p>
      )}
      {picker && (
        <div className="mt-3">
          <label
            htmlFor={'contact-picker-' + id}
            className="text-muted mb-1 block text-sm"
          >
            {t('companies.linkContact')}
          </label>
          <SearchableCombobox
            id={'contact-picker-' + id}
            value=""
            options={available.map((contact) => ({
              value: contact.id,
              label:
                contact.name +
                (contact.function ? ' — ' + contact.function : ''),
            }))}
            onChange={(value) =>
              void save(kind === 'lead' ? [value] : [...ids, value]).catch(
                () => {}
              )
            }
            onCreate={setCreateName}
            disabled={busy || (kind === 'application' && links.isPending)}
            placeholder={t('companies.searchContacts')}
          />
        </div>
      )}
      {(error || contacts.isError || links.isError) && (
        <p role="alert" className="text-red mt-3 text-sm">
          {error || failureMessage(contacts.error || links.error)}{' '}
          <Button
            onClick={() => {
              void contacts.refetch();
              if (kind === 'application') void links.refetch();
              onUpdated?.();
            }}
          >
            <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
            {t('companies.reload')}
          </Button>
        </p>
      )}
      {createName !== null && (
        <ContactModal
          initialName={createName}
          companyId={companyId}
          companyName={companyName ?? ''}
          onClose={() => setCreateName(null)}
          onSaved={(contact: Contact) => {
            void save(
              kind === 'lead' ? [contact.id] : [...ids, contact.id]
            ).catch(() => {});
          }}
        />
      )}
    </Card>
  );
}
