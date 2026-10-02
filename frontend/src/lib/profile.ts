import api from './api';
import type { UserProfile } from './types';

interface UserProfileUpdate {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  city?: string | null;
  country?: string | null;
  authorized_to_work?: string | null;
  requires_sponsorship?: boolean | null;
}

/** Creates an empty profile if none exists. */
export async function getProfile(): Promise<UserProfile> {
  const response = await api.get('/api/profile');
  return response.data;
}

/** Updates only the supplied fields. */
export async function updateProfile(
  data: UserProfileUpdate
): Promise<UserProfile> {
  const response = await api.put('/api/profile', data);
  return response.data;
}
