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
    label: 'Show Flame of Ambition',
    description: 'Display the Flame of Ambition widget on the dashboard.',
  },
  {
    key: 'show_needs_attention',
    label: 'Show Needs Attention',
    description: 'Display follow-up sections on the dashboard.',
  },
  {
    key: 'show_heatmap',
    label: 'Show Activity Heatmap',
    description:
      'Display the activity heatmap on the dashboard and analytics page.',
  },
];

export default function FeatureToggles() {
  const {
    data: preferences,
    isLoading,
    isError,
    refetch,
  } = useUserPreferences();
  const updateMutation = useUpdateUserPreferences({
    errorMessage: 'Failed to save feature visibility settings',
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
        <h2 className="text-fg1 mb-4 text-xl font-bold">Features</h2>
        <div className="text-muted text-sm">Loading feature settings...</div>
      </div>
    );
  }

  if (isError || !preferences) {
    return (
      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">Features</h2>
        <p className="text-red-bright mb-4 text-sm">
          Failed to load feature settings.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 ease-in-out"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-secondary rounded-lg p-4 md:p-6">
      <h2 className="text-fg1 mb-4 text-xl font-bold">Features</h2>
      <p className="text-muted mb-6 text-sm">
        Choose which optional dashboard and analytics sections stay visible.
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
                <button
                  type="button"
                  onClick={() => handleToggle(toggle.key)}
                  disabled={updateMutation.isPending}
                  className={`focus:ring-accent focus:ring-offset-bg1 relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer self-center rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:ring-2 focus:ring-offset-2 focus:outline-none ${
                    isEnabled ? 'bg-accent' : 'bg-bg4'
                  } ${updateMutation.isPending ? 'cursor-wait opacity-50' : ''}`}
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
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
