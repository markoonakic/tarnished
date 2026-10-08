import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import NotesPanel from '@/components/NotesPanel';
import RemindersCard from '@/components/RemindersCard';
export default function InterviewDetail() {
  const { t } = useTranslation();
  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link
          to="/applications"
          className="text-accent hover:text-accent-bright mb-6 block text-sm"
        >
          {t('kit.backApplications')}
        </Link>
        <section className="bg-secondary mb-6 rounded-lg p-6">
          <h1 className="text-primary text-2xl font-bold">
            {t('kit.interview')}
          </h1>
          <p className="text-muted mt-4 text-sm">{t('kit.notAvailable')}</p>
        </section>
        <RemindersCard reminders={[]} />
        <NotesPanel notes={[]} />
      </div>
    </Layout>
  );
}
