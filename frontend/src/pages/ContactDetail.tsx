import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import Card from '@/components/Card';
import NotesPanel from '@/components/NotesPanel';
import RemindersCard from '@/components/RemindersCard';
export default function ContactDetail() {
  const { t } = useTranslation();
  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link
          to="/contacts"
          className="text-accent hover:text-accent-bright mb-6 block text-sm"
        >
          {t('kit.backContacts')}
        </Link>
        <section className="bg-secondary mb-6 rounded-lg p-6">
          <h1 className="text-primary text-2xl font-bold">
            {t('kit.contact')}
          </h1>
          <p className="text-muted mt-4 text-sm">{t('kit.notAvailable')}</p>
        </section>
        <Card title={t('kit.linkedRecords')} icon="bi-link-45deg">
          <p className="text-muted text-sm">{t('kit.noLinkedRecords')}</p>
        </Card>
        <RemindersCard reminders={[]} />
        <NotesPanel notes={[]} />
      </div>
    </Layout>
  );
}
