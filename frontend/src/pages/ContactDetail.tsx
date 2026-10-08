import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import Card from '@/components/Card';
import Loading from '@/components/Loading';
import TargetNotes from '@/components/TargetNotes';
import AddressReminders from '@/components/companies/AddressReminders';
import {
  ContactModal,
  DeleteConfirm,
} from '@/components/companies/RecordModals';
import {
  RelatedApplications,
  RelatedInterviews,
} from '@/components/companies/RelatedRecords';
import {
  actionClass,
  roleLabel,
  roleColor,
  dateLabel,
  failureMessage,
} from '@/components/companies/addressBook';
import { apiV030 } from '@/lib/apiV030';
import { pillStyle } from '@/lib/uiPills';

export default function ContactDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['contacts', 'detail', id],
    queryFn: () => apiV030.contact(id),
  });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const contact = query.data;
  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link
          to="/contacts"
          className="text-accent focus:ring-accent mb-6 inline-flex items-center gap-2 rounded focus:ring-2"
        >
          <i className="bi bi-chevron-left" aria-hidden="true" />
          {t('companies.backContacts')}
        </Link>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <p role="alert" className="text-red">
            {failureMessage(query.error)}{' '}
            <button
              className={actionClass}
              onClick={() => void query.refetch()}
            >
              {t('companies.reload')}
            </button>
          </p>
        ) : (
          contact && (
            <>
              <section className="bg-secondary mb-6 rounded-lg p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h1 className="text-primary text-2xl font-bold">
                    {contact.name}
                  </h1>
                  {contact.role && (
                    <span
                      className="rounded px-2.5 py-1 text-xs font-semibold"
                      style={pillStyle(roleColor(contact.role))}
                    >
                      {roleLabel(contact.role)}
                    </span>
                  )}
                </div>
                <p className="text-fg1 mt-1 text-sm">
                  {contact.function}
                  {contact.company && (
                    <>
                      {contact.function && ' ' + t('companies.at') + ' '}
                      <Link
                        className="text-accent focus:ring-accent rounded focus:ring-2"
                        to={'/companies/' + contact.company.id}
                      >
                        {contact.company.name}
                      </Link>
                    </>
                  )}
                </p>
                <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted text-xs">
                      {t('companies.email')}
                    </dt>
                    <dd className="text-fg1 break-words">
                      {contact.email ? (
                        <a
                          className="text-accent"
                          href={'mailto:' + contact.email}
                        >
                          {contact.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs">
                      {t('companies.phone')}
                    </dt>
                    <dd className="text-fg1">
                      {contact.phone ? (
                        <a href={'tel:' + contact.phone}>{contact.phone}</a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs">
                      {t('companies.profile_url')}
                    </dt>
                    <dd className="text-fg1 break-words">
                      {contact.profile_url ? (
                        <a
                          className="text-accent"
                          href={contact.profile_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {contact.profile_url.replace(/^https?:\/\//, '')}
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs">
                      {t('companies.last_contact_on')}
                    </dt>
                    <dd className="text-fg1">
                      {dateLabel(contact.last_contact_on)}
                    </dd>
                  </div>
                </dl>
                {contact.communication_note && (
                  <div className="bg-tertiary mt-5 rounded-lg p-4">
                    <p className="text-muted mb-1 text-xs">
                      {t('companies.communication_note')}
                    </p>
                    <p className="text-fg1 text-sm whitespace-pre-wrap">
                      {contact.communication_note}
                    </p>
                  </div>
                )}
                <div className="border-tertiary mt-6 flex justify-end gap-2 border-t pt-4">
                  <button
                    className={actionClass}
                    onClick={() => setEditing(true)}
                  >
                    <i className="bi bi-pencil mr-2" aria-hidden="true" />
                    {t('companies.edit')}
                  </button>
                  <button
                    className={actionClass + ' text-red'}
                    onClick={() => setDeleting(true)}
                  >
                    <i className="bi bi-trash mr-2" aria-hidden="true" />
                    {t('companies.delete')}
                  </button>
                </div>
              </section>
              <Card title={t('companies.linkedRecords')} icon="bi-link-45deg">
                <RelatedApplications items={contact.applications} withCompany />
                <RelatedInterviews items={contact.rounds} />
              </Card>
              <AddressReminders type="contact" id={id} name={contact.name} />
              <TargetNotes targetType="contact" targetId={id} />
              {editing && (
                <ContactModal
                  contact={contact}
                  companyName={contact.company?.name}
                  onClose={() => setEditing(false)}
                  onSaved={() => void query.refetch()}
                />
              )}
              {deleting && (
                <DeleteConfirm
                  message={t('companies.deleteContactWarning')}
                  onClose={() => setDeleting(false)}
                  onDelete={async () => {
                    await apiV030.deleteContact(id, contact.revision);
                    await client.invalidateQueries({ queryKey: ['contacts'] });
                    await client.invalidateQueries({ queryKey: ['companies'] });
                    navigate('/contacts');
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
