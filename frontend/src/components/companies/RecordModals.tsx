import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Modal from '../Modal';
import Dropdown from '../Dropdown';
import CompanyPicker from '../CompanyPicker';
import {
  apiV030,
  type Company,
  type CompanyInput,
  type Contact,
  type ContactInput,
} from '@/lib/apiV030';
import {
  actionClass,
  primaryClass,
  inputClass,
  failureMessage,
  roles,
  roleLabel,
} from './addressBook';

export function CompanyModal({
  company,
  onClose,
  onSaved,
}: {
  company?: Company;
  onClose: () => void;
  onSaved: (company: Company) => void;
}) {
  const { t } = useTranslation();
  const [baseline] = useState(company);
  const [draft, setDraft] = useState<CompanyInput>({
    name: company?.name ?? '',
    website: company?.website ?? '',
    industry: company?.industry ?? '',
    location: company?.location ?? '',
    size: company?.size ?? null,
    description: company?.description ?? '',
    culture_notes: company?.culture_notes ?? '',
  });
  const client = useQueryClient();
  return (
    <RecordForm
      title={t(company ? 'companies.editCompany' : 'companies.newCompany')}
      onClose={onClose}
      onSave={async () => {
        const data = { ...draft, name: draft.name.trim() };
        const saved = baseline
          ? await apiV030.updateCompany(baseline.id, {
              ...data,
              expected_revision: baseline.revision,
            })
          : await apiV030.createCompany(data);
        await client.invalidateQueries({ queryKey: ['companies'] });
        onSaved(saved);
      }}
    >
      {(['name', 'website', 'industry', 'location'] as const).map((key) => (
        <Field
          key={key}
          label={t('companies.' + key)}
          value={draft[key] ?? ''}
          required={key === 'name'}
          type={key === 'website' ? 'url' : 'text'}
          onChange={(value) => setDraft({ ...draft, [key]: value || null })}
        />
      ))}
      <label className="text-muted block text-sm">
        {t('companies.size')}
        <div className="mt-1">
          <Dropdown
            value={draft.size ?? ''}
            options={[
              { value: '', label: t('companies.notSet') },
              ...['1-10', '11-50', '51-200', '201-1000', '1000+'].map(
                (value) => ({ value, label: value.replaceAll('-', '–') })
              ),
            ]}
            onChange={(size) =>
              setDraft({
                ...draft,
                size: (size || null) as CompanyInput['size'],
              })
            }
          />
        </div>
      </label>
      {(['description', 'culture_notes'] as const).map((key) => (
        <Field
          key={key}
          label={t('companies.' + key)}
          value={draft[key] ?? ''}
          multiline
          onChange={(value) => setDraft({ ...draft, [key]: value || null })}
        />
      ))}
    </RecordForm>
  );
}
export function ContactModal({
  contact,
  companyId,
  companyName,
  initialName = '',
  onClose,
  onSaved,
}: {
  contact?: Contact;
  companyId?: string | null;
  companyName?: string;
  initialName?: string;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [baseline] = useState(contact);
  const [draft, setDraft] = useState<ContactInput>({
    name: contact?.name ?? initialName,
    function: contact?.function ?? '',
    company_id: contact?.company_id ?? companyId ?? null,
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    profile_url: contact?.profile_url ?? '',
    role: contact?.role ?? '',
    last_contact_on: contact?.last_contact_on ?? '',
    communication_note: contact?.communication_note ?? '',
  });
  const [name, setName] = useState(companyName ?? '');
  const [customRole, setCustomRole] = useState(
    !!contact?.role && !roles.includes(contact.role)
  );
  return (
    <RecordForm
      title={t(contact ? 'companies.editContact' : 'companies.newContact')}
      onClose={onClose}
      onSave={async () => {
        const data = {
          ...draft,
          name: draft.name.trim(),
          last_contact_on: draft.last_contact_on || null,
        };
        const saved = baseline
          ? await apiV030.updateContact(baseline.id, {
              ...data,
              expected_revision: baseline.revision,
            })
          : await apiV030.createContact(data);
        await client.invalidateQueries({ queryKey: ['contacts'] });
        await client.invalidateQueries({ queryKey: ['companies'] });
        onSaved(saved);
      }}
    >
      {(['name', 'function'] as const).map((key) => (
        <Field
          key={key}
          label={t(
            key === 'name' ? 'companies.contactName' : 'companies.function'
          )}
          value={draft[key] ?? ''}
          required={key === 'name'}
          onChange={(value) => setDraft({ ...draft, [key]: value })}
        />
      ))}
      <div>
        <label
          className="text-muted mb-1 block text-sm"
          htmlFor="contact-company"
        >
          {t('companies.company')}
        </label>
        <CompanyPicker
          id="contact-company"
          value={draft.company_id}
          name={name}
          onChange={(company_id, name) => {
            setDraft({ ...draft, company_id });
            setName(name);
          }}
        />
        {draft.company_id && (
          <button
            type="button"
            className={actionClass}
            onClick={() => {
              setDraft({ ...draft, company_id: null });
              setName('');
            }}
          >
            {t('companies.clearCompany')}
          </button>
        )}
      </div>
      {(['email', 'phone', 'profile_url', 'last_contact_on'] as const).map(
        (key) => (
          <Field
            key={key}
            label={t('companies.' + key)}
            type={
              key === 'email'
                ? 'email'
                : key === 'profile_url'
                  ? 'url'
                  : key === 'last_contact_on'
                    ? 'date'
                    : 'tel'
            }
            value={draft[key] ?? ''}
            onChange={(value) => setDraft({ ...draft, [key]: value })}
          />
        )
      )}
      <div>
        <label htmlFor="contact-role" className="text-muted mb-1 block text-sm">
          {t('companies.role')}
        </label>
        <Dropdown
          id="contact-role"
          value={customRole ? '__custom' : (draft.role ?? '')}
          options={[
            { value: '', label: t('companies.notSet') },
            ...roles.map((role) => ({ value: role, label: roleLabel(role) })),
            { value: '__custom', label: t('companies.customRole') },
          ]}
          onChange={(role) => {
            setCustomRole(role === '__custom');
            setDraft({ ...draft, role: role === '__custom' ? '' : role });
          }}
        />
      </div>
      {customRole && (
        <Field
          label={t('companies.customRole')}
          value={draft.role ?? ''}
          onChange={(role) => setDraft({ ...draft, role })}
        />
      )}
      <Field
        label={t('companies.communication_note')}
        multiline
        value={draft.communication_note ?? ''}
        onChange={(communication_note) =>
          setDraft({ ...draft, communication_note })
        }
      />
    </RecordForm>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  multiline = false,
  list,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  list?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-muted mb-1 block text-sm">
        {label}
        {required && ' *'}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          className={inputClass}
          maxLength={20000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          required={required}
          maxLength={type === 'url' ? 2048 : 255}
          list={list}
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
function RecordForm({
  title,
  onClose,
  onSave,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal label={title} onClose={onClose} busy={busy}>
      <form
        className="bg-secondary mx-4 max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-lg p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            await onSave();
            onClose();
          } catch (error) {
            setError(failureMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-primary text-xl font-semibold">{title}</h2>
          <button
            type="button"
            disabled={busy}
            aria-label={t('companies.close')}
            onClick={onClose}
            className={actionClass}
          >
            ×
          </button>
        </div>
        <fieldset disabled={busy} className="space-y-4">
          {children}
        </fieldset>
        {error && (
          <p role="alert" className="text-red mt-4">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className={actionClass}
            disabled={busy}
            onClick={onClose}
          >
            {t('companies.cancel')}
          </button>
          <button type="submit" className={primaryClass} disabled={busy}>
            {t('companies.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function DeleteConfirm({
  message,
  onClose,
  onDelete,
}: {
  message: string;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal label={t('companies.confirmDelete')} onClose={onClose} busy={busy}>
      <div className="bg-secondary mx-4 w-full max-w-md rounded-lg p-6">
        <h2 className="text-primary mb-4 text-xl font-semibold">
          {t('companies.confirmDelete')}
        </h2>
        <p className="text-fg1">{message}</p>
        {error && (
          <p className="text-red mt-3" role="alert">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button disabled={busy} className={actionClass} onClick={onClose}>
            {t('companies.cancel')}
          </button>
          <button
            disabled={busy}
            className="bg-red text-bg0 hover:bg-red-bright focus:ring-red cursor-pointer rounded px-4 py-2 font-medium focus:ring-2 disabled:opacity-50"
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try {
                await onDelete();
                onClose();
              } catch (error) {
                setError(failureMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('companies.delete')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
