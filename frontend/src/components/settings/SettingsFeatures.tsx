import { useTranslation } from 'react-i18next';
import FeatureToggles from './FeatureToggles';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsFeatures() {
  useTranslation();
  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <FeatureToggles />
    </>
  );
}
