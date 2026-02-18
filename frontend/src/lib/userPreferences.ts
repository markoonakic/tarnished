import api from './api';

export interface UserPreferences {
  show_streak_stats: boolean;
  show_needs_attention: boolean;
  show_heatmap: boolean;
}

interface UserPreferencesUpdate {
  show_streak_stats?: boolean;
  show_needs_attention?: boolean;
  show_heatmap?: boolean;
}

export async function getPreferences(): Promise<UserPreferences> {
  const response = await api.get('/api/user-preferences');
  return response.data;
}

export async function updatePreferences(updates: UserPreferencesUpdate): Promise<UserPreferences> {
  const response = await api.put('/api/user-preferences', updates);
  return response.data;
}
