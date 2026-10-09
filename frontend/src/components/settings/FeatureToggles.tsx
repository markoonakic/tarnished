import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from '@/hooks/useUserPreferences';

type BooleanPreferenceKey =
  'show_streak_stats' | 'show_needs_attention' | 'show_heatmap';

interface ToggleConfig {
  key: BooleanPreferenceKey;
  label: string;
  description: string;
}

const toggles: ToggleConfig[] = [
  {
    key: 'show_streak_stats',
    get label() {
      return t('Show Flame of Ambition');
    },
    get description() {
      return t('Display the Flame of Ambition widget on the dashboard.');
    },
  },
  {
    key: 'show_needs_attention',
    get label() {
      return t('Show Needs Attention');
    },
    get description() {
      return t('Display follow-up sections on the dashboard.');
    },
  },
  {
    key: 'show_heatmap',
    get label() {
      return t('Show Activity Heatmap');
    },
    get description() {
      return t(
        'Display the activity heatmap on the dashboard and analytics page.'
      );
    },
  },
];

export default function FeatureToggles() {
  useTranslation();
  const {
    data: preferences,
    isLoading,
    isError,
    refetch,
  } = useUserPreferences();
  const updateMutation = useUpdateUserPreferences({
    errorMessage: t('Failed to save feature visibility settings'),
  });

  function handleToggle(key: BooleanPreferenceKey) {
    if (!preferences || updateMutation.isPending) {
      return;
    }

    updateMutation.mutate({ [key]: !preferences[key] });
  }

  if (isLoading) {
    return (
      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">{t('Features')}</h2>
        <div className="text-muted text-sm">
          {t('Loading feature settings...')}
        </div>
      </div>
    );
  }

  if (isError || !preferences) {
    return (
      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">{t('Features')}</h2>
        <p className="text-red-bright mb-4 text-sm">
          {t('Failed to load feature settings.')}
        </p>
        <Button variant="primary" type="button" onClick={() => void refetch()}>
          {t('Try Again')}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-secondary rounded-lg p-4 md:p-6">
      <h2 className="text-fg1 mb-4 text-xl font-bold">{t('Features')}</h2>
      <p className="text-muted mb-6 text-sm">
        {t(
          'Choose which optional dashboard and analytics sections stay visible.'
        )}
      </p>

      <ul className="space-y-3">
        {toggles.map((toggle) => {
          const isEnabled = preferences[toggle.key];

          return (
            <li key={toggle.key} className="bg-bg2 rounded-lg px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-fg1 text-sm font-medium">
                    {toggle.label}
                  </div>
                  <div className="text-muted mt-1 text-sm">
                    {toggle.description}
                  </div>
                </div>
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => handleToggle(toggle.key)}
                  disabled={updateMutation.isPending}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 self-center ${
                    isEnabled ? '' : ''
                  } ${updateMutation.isPending ? '' : ''} `}
                  role="switch"
                  aria-label={toggle.label}
                  aria-checked={isEnabled}
                  aria-busy={updateMutation.isPending}
                >
                  <span
                    aria-hidden="true"
                    className={`bg-fg0 pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition-all duration-200 ease-in-out ${
                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
