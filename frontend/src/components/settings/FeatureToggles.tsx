import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPreferences,
  updatePreferences,
  type UserPreferences,
} from '../../lib/userPreferences';

interface ToggleConfig {
  key: keyof UserPreferences;
  label: string;
  description: string;
}

const toggles: ToggleConfig[] = [
  {
    key: 'show_streak_stats',
    label: 'Show Streak Stats',
    description: 'Display motivational streak information on dashboard',
  },
  {
    key: 'show_needs_attention',
    label: 'Show Needs Attention',
    description: 'Display applications requiring follow-up on dashboard',
  },
  {
    key: 'show_heatmap',
    label: 'Show Activity Heatmap',
    description:
      'Display GitHub-style activity heatmap on dashboard and analytics',
  },
];

export default function FeatureToggles() {
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['user-preferences'],
    queryFn: getPreferences,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<UserPreferences>) =>
      updatePreferences(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
    },
  });

  function handleToggle(key: keyof UserPreferences) {
    const currentValue = preferences?.[key] ?? true;
    updateMutation.mutate({ [key]: !currentValue });
  }

  if (isLoading) {
    return (
      <div className="bg-bg1 rounded-lg p-4 md:p-6">
        <h2 className="text-primary mb-4 text-lg font-semibold">
          Feature Toggles
        </h2>
        <div className="text-muted">Loading preferences...</div>
      </div>
    );
  }

  return (
    <div className="bg-bg1 rounded-lg p-6">
      <h2 className="text-primary mb-4 text-lg font-semibold">
        Feature Toggles
      </h2>
      <p className="text-muted mb-6 text-sm">
        Control which features appear on your dashboard and analytics pages.
      </p>
      <ul className="space-y-4">
        {toggles.map((toggle) => {
          const isEnabled = preferences?.[toggle.key] ?? true;
          return (
            <li key={toggle.key} className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-primary text-sm font-medium">
                  {toggle.label}
                </div>
                <div className="text-muted mt-0.5 text-xs">
                  {toggle.description}
                </div>
              </div>
              <button
                onClick={() => handleToggle(toggle.key)}
                disabled={updateMutation.isPending}
                className={`focus:ring-accent focus:ring-offset-bg0 relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:ring-2 focus:ring-offset-2 focus:outline-none ${
                  isEnabled ? 'bg-accent' : 'bg-tertiary'
                } ${updateMutation.isPending ? 'cursor-wait opacity-50' : ''}`}
                role="switch"
                aria-checked={isEnabled}
              >
                <span
                  aria-hidden="true"
                  className={`bg-fg0 pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition-all duration-200 ease-in-out ${
                    isEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
