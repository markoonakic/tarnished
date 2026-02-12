import FeatureToggles from './FeatureToggles';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsFeatures() {
  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <FeatureToggles />
    </>
  );
}
