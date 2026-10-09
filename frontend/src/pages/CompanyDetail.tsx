import TextLink from '@/components/ui/TextLink';
import Button from '@/components/ui/Button';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import Card from '@/components/Card';
import Loading from '@/components/Loading';
import ContactRow from '@/components/ContactRow';
import TargetNotes from '@/components/TargetNotes';
import AddressReminders from '@/components/companies/AddressReminders';
import {
  CompanyModal,
  ContactModal,
  DeleteConfirm,
} from '@/components/companies/RecordModals';
import {
  RelatedApplications,
  RelatedLeads,
} from '@/components/companies/RelatedRecords';
import {
  inputClass,
  roleLabel,
  roleColor,
  dateLabel,
  failureMessage,
} from '@/components/companies/addressBook';
import { apiV030 } from '@/lib/apiV030';

export default function CompanyDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['companies', 'detail', id],
    queryFn: () => apiV030.company(id),
  });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [culture, setCulture] = useState<string | null>(null);
  const [cultureRevision, setCultureRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const company = query.data;
  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <TextLink
          to="/companies"
          className="mb-6 inline-flex items-center gap-1.5"
        >
          <i className="bi bi-chevron-left" aria-hidden="true" />
          {t('companies.backCompanies')}
        </TextLink>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <p role="alert" className="text-red">
            {failureMessage(query.error)}{' '}
            <Button onClick={() => void query.refetch()}>
              <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
              {t('companies.reload')}
            </Button>
          </p>
        ) : (
          company && (
            <>
              <section className="bg-secondary mb-6 rounded-lg p-6">
                <div className="mb-1 flex flex-wrap items-center gap-3">
                  <h1 className="text-primary text-2xl font-bold">
                    {company.name}
                  </h1>
                  {company.website && (
                    <TextLink
                      className="inline-flex items-center gap-2"
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <i className="bi bi-link-45deg" aria-hidden="true" />
                      {company.website.replace(/^https?:\/\//, '')}
                    </TextLink>
                  )}
                </div>
                <p className="text-muted text-sm">
                  {[
                    company.industry,
                    company.location,
                    company.size?.replaceAll('-', '–'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {company.description && (
                  <p className="text-fg1 mt-4 text-sm whitespace-pre-wrap">
                    {company.description}
                  </p>
                )}
                <div className="border-tertiary mt-6 flex justify-end gap-2 border-t pt-4">
                  <Button onClick={() => setEditing(true)}>
                    <i className="bi bi-pencil mr-2" aria-hidden="true" />
                    {t('companies.edit')}
                  </Button>
                  <Button
                    variant="danger"
                    className=""
                    onClick={() => setDeleting(true)}
                  >
                    <i className="bi bi-trash mr-2" aria-hidden="true" />
                    {t('companies.delete')}
                  </Button>
                </div>
              </section>
              <Card
                title={t('companies.culture_notes')}
                icon="bi-chat-square-quote"
                actions={
                  culture === null && (
                    <Button
                      onClick={() => {
                        setCulture(company.culture_notes ?? '');
                        setCultureRevision(company.revision);
                        setError('');
                      }}
                    >
                      <i className="bi bi-pencil mr-2" aria-hidden="true" />
                      {t('companies.edit')}
                    </Button>
                  )
                }
              >
                {culture === null ? (
                  <p
                    className={
                      company.culture_notes
                        ? 'text-fg1 text-sm whitespace-pre-wrap'
                        : 'text-muted text-sm'
                    }
                  >
                    {company.culture_notes || t('companies.cultureEmpty')}
                  </p>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (busy) return;
                      setBusy(true);
                      try {
                        await apiV030.updateCompany(id, {
                          culture_notes: culture || null,
                          expected_revision: cultureRevision,
                        });
                        await client.invalidateQueries({
                          queryKey: ['companies'],
                        });
                        setCulture(null);
                      } catch (error) {
                        setError(failureMessage(error));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <textarea
                      aria-label={t('companies.culture_notes')}
                      maxLength={20000}
                      rows={5}
                      className={inputClass}
                      disabled={busy}
                      value={culture}
                      onChange={(e) => setCulture(e.target.value)}
                    />
                    {error && (
                      <p role="alert" className="text-red mt-2">
                        {error}
                      </p>
                    )}
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        type="button"
                        disabled={busy}

                        onClick={() => setCulture(null)}
                      >
                        <i className="bi-x-lg icon-sm" aria-hidden="true" />
                        {t('companies.cancel')}
                      </Button>
                      <Button type="submit" disabled={busy} variant="primary">
                        <i className="bi-check2 icon-sm" aria-hidden="true" />
                        {t('companies.save')}
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
              <Card
                title={t('companies.contacts')}
                icon="bi-person-lines-fill"
                count={company.contact_count ?? company.contacts.length}
                actions={
                  <Button onClick={() => setAddingContact(true)}>
                    <i className="bi-plus-lg icon-sm" aria-hidden="true" />
                    {t('companies.addContact')}
                  </Button>
                }
              >
                <div className="space-y-2">
                  {company.contacts.map((contact) => (
                    <ContactRow
                      key={contact.id}
                      name={contact.name}
                      href={'/contacts/' + contact.id}
                      subtitle={contact.function ?? undefined}
                      role={roleLabel(contact.role)}
                      roleColor={roleColor(contact.role)}
                      email={contact.email}
                      phone={contact.phone}
                      lastContact={
                        contact.last_contact_on
                          ? dateLabel(contact.last_contact_on)
                          : undefined
                      }
                    />
                  ))}
                </div>
                {!company.contacts.length && (
                  <p className="text-muted text-sm">
                    {t('companies.noContacts')}
                  </p>
                )}
                {(company.contact_count ?? 0) > company.contacts.length && (
                  <TextLink to={'/contacts?company_id=' + id}>
                    {t('companies.viewAll')}
                  </TextLink>
                )}
              </Card>
              <RelatedLeads items={company.leads} />
              {(company.lead_count ?? 0) > company.leads.length && (
                <TextLink to={'/job-leads?company_id=' + id}>
                  {t('companies.viewAll')}
                </TextLink>
              )}
              <Card
                title={t('companies.applications')}
                icon="bi-send"
                count={company.application_count ?? company.applications.length}
              >
                <RelatedApplications items={company.applications} />
                {(company.application_count ?? 0) >
                  company.applications.length && (
                  <TextLink to={'/applications?company_id=' + id}>
                    {t('companies.viewAll')}
                  </TextLink>
                )}
              </Card>
              <AddressReminders type="company" id={id} name={company.name} />
              <TargetNotes targetType="company" targetId={id} />
              {editing && (
                <CompanyModal
                  company={company}
                  onClose={() => setEditing(false)}
                  onSaved={() => void query.refetch()}
                />
              )}
              {addingContact && (
                <ContactModal
                  companyId={id}
                  companyName={company.name}
                  onClose={() => setAddingContact(false)}
                  onSaved={() => void query.refetch()}
                />
              )}
              {deleting && (
                <DeleteConfirm
                  message={t('companies.deleteCompanyWarning', {
                    leads: t('companies.linkedLeads', {
                      count: company.lead_count ?? company.leads.length,
                    }),
                    applications: t('companies.linkedApplications', {
                      count:
                        company.application_count ??
                        company.applications.length,
                    }),
                  })}
                  onClose={() => setDeleting(false)}
                  onDelete={async () => {
                    await apiV030.deleteCompany(id, company.revision);
                    await client.invalidateQueries({ queryKey: ['companies'] });
                    navigate('/companies');
                  }}
                />
              )}
            </>
          )
        )}
      </div>
    </Layout>
  );
}
