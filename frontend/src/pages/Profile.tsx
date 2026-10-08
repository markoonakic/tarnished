import { useTranslation } from 'react-i18next';
import Layout from '@/components/Layout';
import SettingsProfile from '@/components/settings/SettingsProfile';
export default function Profile() {
  const { t } = useTranslation();
  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-primary mb-2 text-2xl font-bold">
          {t('kit.profile')}
        </h1>
        <p className="text-fg4 mb-6 text-sm">{t('kit.profileSubtitle')}</p>
        <SettingsProfile />
      </div>
    </Layout>
  );
}
