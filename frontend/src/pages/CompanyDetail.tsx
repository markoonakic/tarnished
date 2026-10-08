import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import Card from '@/components/Card';
import NotesPanel from '@/components/NotesPanel';
import RemindersCard from '@/components/RemindersCard';
export default function CompanyDetail() {
  const { t } = useTranslation();
  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link
          to="/companies"
          className="text-accent hover:text-accent-bright mb-6 block text-sm"
        >
          {t('kit.backCompanies')}
        </Link>
        <section className="bg-secondary mb-6 rounded-lg p-6">
          <h1 className="text-primary text-2xl font-bold">
            {t('kit.company')}
          </h1>
          <p className="text-muted mt-4 text-sm">{t('kit.notAvailable')}</p>
        </section>
        <Card title={t('kit.culture')} icon="bi-chat-square-quote">
          <p className="text-muted text-sm">{t('kit.cultureEmpty')}</p>
        </Card>
        <Card title={t('kit.contacts')} icon="bi-person-lines-fill" count={0}>
          <p className="text-muted text-sm">{t('kit.noContacts')}</p>
        </Card>
        <Card title={t('Job Leads')} icon="bi-bookmark" count={0}>
          <p className="text-muted text-sm">{t('kit.noLinkedRecords')}</p>
        </Card>
        <Card title={t('Applications')} icon="bi-send" count={0}>
          <p className="text-muted text-sm">{t('kit.noLinkedRecords')}</p>
        </Card>
        <RemindersCard reminders={[]} />
        <NotesPanel notes={[]} />
      </div>
    </Layout>
  );
}
