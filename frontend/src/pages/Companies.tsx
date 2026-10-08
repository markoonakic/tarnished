import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import SegmentedControl from '@/components/SegmentedControl';
import EmptyState from '@/components/EmptyState';
import Dropdown from '@/components/Dropdown';
export default function Companies() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const contacts = location.pathname === '/contacts';
  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-primary text-2xl font-bold">
            {t('kit.companies')}
          </h1>
          <button
            type="button"
            disabled
            className="bg-accent text-bg0 rounded-md px-4 py-2 font-medium opacity-50"
          >
            {t(contacts ? 'kit.newContact' : 'kit.newCompany')}
          </button>
        </div>
        <div className="-mt-2 mb-6">
          <SegmentedControl
            label={t('kit.companies')}
            options={[
              { value: 'companies', label: t('kit.companies') },
              { value: 'contacts', label: t('kit.contacts') },
            ]}
            value={contacts ? 'contacts' : 'companies'}
            onChange={(tab) => navigate('/' + tab)}
          />
        </div>
        <div className="bg-bg1 mb-6 flex flex-wrap items-center gap-3 rounded-lg p-4">
          <input
            aria-label={t(
              contacts ? 'kit.searchContacts' : 'kit.searchCompanies'
            )}
            placeholder={t(
              contacts ? 'kit.searchContacts' : 'kit.searchCompanies'
            )}
            className="bg-bg2 text-fg1 placeholder:text-fg4 focus:ring-accent w-full max-w-sm rounded-md px-3 py-2 text-sm outline-none focus:ring-2"
          />
          <Dropdown
            options={[
              {
                value: '',
                label: t(contacts ? 'kit.allCompanies' : 'kit.allIndustries'),
              },
            ]}
            value=""
            onChange={() => {}}
            disabled
          />
          <Dropdown
            options={[
              {
                value: 'name',
                label: t(contacts ? 'kit.allRoles' : 'kit.sortName'),
              },
            ]}
            value="name"
            onChange={() => {}}
            disabled
          />
        </div>
        <EmptyState
          message={t(contacts ? 'kit.noContacts' : 'kit.noCompanies')}
          icon="bi-buildings"
        />
      </div>
    </Layout>
  );
}
