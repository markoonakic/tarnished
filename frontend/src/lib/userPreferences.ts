import api from './api';

export type Language = 'en' | 'sr-Latn';

export type TimeZoneMode = 'device' | 'manual';

export interface UserPreferences {
  language: Language;
  show_streak_stats: boolean;
  show_needs_attention: boolean;
  show_heatmap: boolean;
  time_zone_mode: TimeZoneMode;
  time_zone: string | null;
}

export interface UserPreferencesUpdate {
  language?: Language;
  show_streak_stats?: boolean;
  show_needs_attention?: boolean;
  show_heatmap?: boolean;
  time_zone_mode?: TimeZoneMode;
  time_zone?: string | null;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  language: 'en',
  show_streak_stats: true,
  show_needs_attention: true,
  show_heatmap: true,
  time_zone_mode: 'device',
  time_zone: null,
};

export async function getPreferences(): Promise<UserPreferences> {
  const response = await api.get('/api/user-preferences');
  return response.data;
}

export async function updatePreferences(
  updates: UserPreferencesUpdate
): Promise<UserPreferences> {
  const response = await api.patch('/api/user-preferences', updates);
  return response.data;
}
