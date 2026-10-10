import TextLink from '@/components/ui/TextLink';
import { MAX_SEARCH_LENGTH } from '@/lib/recordFilters';
import Button from '@/components/ui/Button';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import SegmentedControl from '@/components/SegmentedControl';
import EmptyState from '@/components/EmptyState';
import Loading from '@/components/Loading';
import Dropdown from '@/components/Dropdown';
import Pagination from '@/components/Pagination';
import {
  CompanyModal,
  ContactModal,
} from '@/components/companies/RecordModals';
import { apiV030, type CompanyQuery } from '@/lib/apiV030';
import { pillStyle } from '@/lib/uiPills';
import {
  allCompanies,
  inputClass,
  roles,
  roleLabel,
  roleColor,
  dateLabel,
  failureMessage,
} from '@/components/companies/addressBook';

export default function Companies() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const contacts = location.pathname === '/contacts';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const search = (params.get('query') ?? '').slice(0, MAX_SEARCH_LENGTH);
  const industry = params.get('industry') ?? '';
  const companyId = params.get('company_id') ?? '';
  const role = params.get('role') ?? '';
  const sort = (params.get('sort') || 'activity') as CompanyQuery['sort'];
  const companies = useQuery({
    queryKey: ['companies', 'picker'],
    queryFn: allCompanies,
  });
  const list = useQuery({
    queryKey: [contacts ? 'contacts' : 'companies', 'list', params.toString()],
    queryFn: () =>
      contacts
        ? apiV030.contacts({
            query: search,
            company_id: companyId,
            role,
            page,
            per_page: 25,
          })
        : apiV030.companies({
            query: search,
            industry,
            sort,
            page,
            per_page: 25,
          }),
  });
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value)
      next.set(
        key,
        key === 'query' ? value.slice(0, MAX_SEARCH_LENGTH) : value
      );
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }
  const companyNames = new Map(
    (companies.data ?? []).map((company) => [company.id, company.name])
  );
  const headings = contacts
    ? ['contactName', 'function', 'company', 'role', 'last_contact_on', 'email']
    : [
        'company',
        'industry',
        'location',
        'size',
        'leads',
        'applications',
        'lastActivity',
      ];
  function rowCells(row: NonNullable<typeof list.data>['items'][number]) {
    if ('lead_count' in row || !contacts) {
      const company = row as import('@/lib/apiV030').Company;
      return [
        <TextLink to={'/companies/' + row.id}>{row.name}</TextLink>,
        company.industry || '—',
        company.location || '—',
        company.size?.replaceAll('-', '–') || '—',
        company.lead_count ?? 0,
        company.application_count ?? 0,
        dateLabel(company.last_activity_at),
      ];
    }
    const contact = row as import('@/lib/apiV030').Contact;
    return [
      <TextLink to={'/contacts/' + row.id}>{row.name}</TextLink>,
      contact.function || '—',
      contact.company_id ? (
        <TextLink
          to={'/companies/' + contact.company_id}

          onClick={(event) => event.stopPropagation()}
        >
          {contact.company_name || companyNames.get(contact.company_id) || '—'}
        </TextLink>
      ) : (
        '—'
      ),
      contact.role ? (
        <span
          className="inline-flex rounded px-2.5 py-1 text-xs font-semibold"
          style={pillStyle(roleColor(contact.role))}
        >
          {roleLabel(contact.role)}
        </span>
      ) : (
        '—'
      ),
      dateLabel(contact.last_contact_on),
      contact.email ? (
        <TextLink
          href={'mailto:' + contact.email}
          title={contact.email}
          className="truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {contact.email}
        </TextLink>
      ) : (
        '—'
      ),
    ];
  }
  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-primary text-2xl font-bold">
            {t('companies.companies')}
          </h1>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <i className="bi-plus-lg icon-sm" aria-hidden="true" />
            {t(contacts ? 'companies.newContact' : 'companies.newCompany')}
          </Button>
        </div>
        <div className="mb-6">
          <SegmentedControl
            label={t('companies.companies')}
            options={[
              { value: 'companies', label: t('companies.companies') },
              { value: 'contacts', label: t('companies.contacts') },
            ]}
            value={contacts ? 'contacts' : 'companies'}
            onChange={(tab) => navigate('/' + tab)}
          />
        </div>
        <div className="bg-secondary mb-6 flex flex-wrap gap-3 rounded-lg p-4">
          <input
            className={inputClass + ' w-full sm:max-w-sm'}
            aria-label={t(
              contacts
                ? 'companies.searchContacts'
                : 'companies.searchCompanies'
            )}
            placeholder={t(
              contacts
                ? 'companies.searchContacts'
                : 'companies.searchCompanies'
            )}
            value={search}
            maxLength={MAX_SEARCH_LENGTH}
            onChange={(e) => filter('query', e.target.value)}
          />
          <Dropdown
            value={contacts ? companyId : industry}
            options={[
              {
                value: '',
                label: t(
                  contacts
                    ? 'companies.allCompanies'
                    : 'companies.allIndustries'
                ),
              },
              ...(contacts
                ? (companies.data ?? []).map((company) => ({
                    value: company.id,
                    label: company.name,
                  }))
                : [
                    ...new Set(
                      (companies.data ?? [])
                        .map((company) => company.industry)
                        .filter((value): value is string => !!value)
                    ),
                  ]
                    .sort()
                    .map((value) => ({ value, label: value }))),
            ]}
            onChange={(value) =>
              filter(contacts ? 'company_id' : 'industry', value)
            }
          />
          <Dropdown
            value={contacts ? role : (sort ?? 'activity')}
            options={
              contacts
                ? [
                    { value: '', label: t('companies.allRoles') },
                    ...roles.map((value) => ({
                      value,
                      label: roleLabel(value),
                    })),
                  ]
                : ['name', 'activity', 'applications'].map((value) => ({
                    value,
                    label: t('companies.sort.' + value),
                  }))
            }
            onChange={(value) => filter(contacts ? 'role' : 'sort', value)}
          />
        </div>
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <p role="alert" className="text-red">
            {failureMessage(list.error)}
            <Button onClick={() => void list.refetch()}>
              <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
              {t('companies.reload')}
            </Button>
          </p>
        ) : !list.data.items.length ? (
          <div>
            <EmptyState
              message={t(
                contacts ? 'companies.noContacts' : 'companies.noCompanies'
              )}
              icon={contacts ? 'bi-person-lines-fill' : 'bi-buildings'}
            />
            <div className="mt-4 text-center">
              <Button variant="primary" onClick={() => setCreating(true)}>
                <i className="bi-plus-lg icon-sm" aria-hidden="true" />
                {t(contacts ? 'companies.newContact' : 'companies.newCompany')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-secondary mb-6 hidden overflow-hidden rounded-lg md:block">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-tertiary text-muted border-b text-left text-xs uppercase">
                    {headings.map((key) => (
                      <th key={key} className="px-4 py-3 font-semibold">
                        {t('companies.' + key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-tertiary hover:bg-bg2 cursor-pointer border-b last:border-b-0"
                      onClick={(event) => {
                        if (!(event.target as Element).closest('a, button'))
                          navigate(
                            '/' +
                              (contacts ? 'contacts' : 'companies') +
                              '/' +
                              row.id
                          );
                      }}
                    >
                      {rowCells(row).map((cell, index) => (
                        <td
                          key={index}
                          className="text-muted px-4 py-4 text-sm break-words"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mb-6 space-y-6 md:hidden">
              {list.data.items.map((row) => (
                <div key={row.id} className="bg-secondary rounded-lg p-4">
                  {rowCells(row).map((cell, index) => (
                    <div
                      key={index}
                      className={
                        index === 0
                          ? 'text-primary mb-2 font-semibold'
                          : 'text-muted flex flex-wrap gap-2 text-sm'
                      }
                    >
                      {index > 0 && (
                        <span>{t('companies.' + headings[index])}:</span>
                      )}
                      {cell}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
        {list.data && (
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(list.data.total / 25)}
            totalItems={list.data.total}
            perPage={25}
            onPageChange={(page) => filter('page', String(page))}
          />
        )}
        {creating &&
          (contacts ? (
            <ContactModal
              onClose={() => setCreating(false)}
              onSaved={(contact) => navigate('/contacts/' + contact.id)}
            />
          ) : (
            <CompanyModal
              onClose={() => setCreating(false)}
              onSaved={(company) => navigate('/companies/' + company.id)}
            />
          ))}
      </div>
    </Layout>
  );
}
