import { useMemo } from 'react';

import Dropdown from '../Dropdown';
import SearchableCombobox from '../SearchableCombobox';
import { getBrowserTimeZone } from '@/lib/api';
import { getSupportedTimeZones } from '@/lib/timeZones';
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from '@/hooks/useUserPreferences';
import type { TimeZoneMode } from '@/lib/userPreferences';

const timeZoneModeOptions = [
  { value: 'device', label: 'Use device time zone' },
  { value: 'manual', label: 'Set manually' },
] as const;

export default function TimeZoneSettings() {
  const browserTimeZone = getBrowserTimeZone();
  const {
    data: preferences,
    isLoading,
    isError,
    refetch,
  } = useUserPreferences();
  const updateMutation = useUpdateUserPreferences({
    errorMessage: 'Failed to save time zone settings',
  });

  const timeZoneOptions = useMemo(
    () =>
      getSupportedTimeZones(browserTimeZone).map((timeZone) => ({
        value: timeZone,
        label: timeZone,
      })),
    [browserTimeZone]
  );

  function handleModeChange(value: string) {
    if (!preferences || updateMutation.isPending) {
      return;
    }

    const mode = value as TimeZoneMode;
    if (mode === 'device') {
      updateMutation.mutate({
        time_zone_mode: 'device',
        time_zone: null,
      });
      return;
    }

    updateMutation.mutate({
      time_zone_mode: 'manual',
      time_zone: preferences.time_zone ?? browserTimeZone ?? 'UTC',
    });
  }

  function handleTimeZoneChange(value: string) {
    if (updateMutation.isPending) {
      return;
    }

    updateMutation.mutate({
      time_zone_mode: 'manual',
      time_zone: value,
    });
  }

  if (isLoading) {
    return (
      <div className="bg-secondary mt-4 rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">Time Zone</h2>
        <div className="text-muted text-sm">Loading time zone settings...</div>
      </div>
    );
  }

  if (isError || !preferences) {
    return (
      <div className="bg-secondary mt-4 rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 text-xl font-bold">Time Zone</h2>
        <p className="text-red-bright mb-4 text-sm">
          Failed to load time zone settings.
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
    <div className="bg-secondary mt-4 rounded-lg p-4 md:p-6">
      <h2 className="text-fg1 mb-4 text-xl font-bold">Time Zone</h2>
      <p className="text-muted mb-6 text-sm">
        Streak day boundaries use your effective time zone. By default,
        Tarnished uses your browser time zone without requesting location
        permissions.
      </p>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="time-zone-mode"
            className="text-muted mb-1.5 block text-sm"
          >
            Time zone source
          </label>
          <Dropdown
            id="time-zone-mode"
            options={timeZoneModeOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={preferences.time_zone_mode}
            onChange={handleModeChange}
            containerBackground="bg1"
          />
        </div>

        {preferences.time_zone_mode === 'device' ? (
          <div className="bg-bg2 rounded-lg px-4 py-3">
            <div className="text-fg1 text-sm font-medium">
              Current device time zone
            </div>
            <div className="text-muted mt-1 text-sm">
              {browserTimeZone ?? 'Unavailable in this browser'}
            </div>
          </div>
        ) : (
          <div>
            <label
              htmlFor="manual-time-zone"
              className="text-muted mb-1.5 block text-sm"
            >
              Manual time zone
            </label>
            <SearchableCombobox
              id="manual-time-zone"
              options={timeZoneOptions}
              value={preferences.time_zone ?? browserTimeZone ?? 'UTC'}
              onChange={handleTimeZoneChange}
              containerBackground="bg1"
              placeholder="Search time zones"
            />
          </div>
        )}
      </div>
    </div>
  );
}
