import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/useToast';
import { getProfile, updateProfile } from '@/lib/profile';
import type { UserProfile } from '@/lib/types';
import Loading from '../Loading';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsProfile() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const data = await getProfile();
      setProfile(data);
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    try {
      await updateProfile({
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
        linkedin_url: profile.linkedin_url,
        city: profile.city,
        country: profile.country,
      });
      toast.success('Profile saved successfully');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  function handleInputChange(field: keyof UserProfile, value: string) {
    if (!profile) return;
    setProfile({ ...profile, [field]: value || null });
  }

  if (loading) {
    return (
      <>
        <div className="md:hidden">
          <SettingsBackLink />
        </div>
        <div className="bg-secondary rounded-lg p-4 md:p-6">
          <Loading message="Loading profile..." />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <form onSubmit={handleSave} className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-xl font-bold text-fg1 mb-4">Profile</h2>
        <p className="text-sm text-muted mb-4">
          Your personal information for autofill and communications.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* First Name */}
          <div>
            <label htmlFor="first-name" className="text-sm text-muted block mb-1.5">First Name</label>
            <input
              id="first-name"
              type="text"
              value={profile?.first_name || ''}
              onChange={(e) => handleInputChange('first_name', e.target.value)}
              placeholder="John"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Last Name */}
          <div>
            <label htmlFor="last-name" className="text-sm text-muted block mb-1.5">Last Name</label>
            <input
              id="last-name"
              type="text"
              value={profile?.last_name || ''}
              onChange={(e) => handleInputChange('last_name', e.target.value)}
              placeholder="Doe"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="profile-email" className="text-sm text-muted block mb-1.5">Email</label>
            <input
              id="profile-email"
              type="email"
              value={profile?.email || ''}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="john@example.com"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="text-sm text-muted block mb-1.5">Phone</label>
            <input
              id="phone"
              type="tel"
              value={profile?.phone || ''}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* City */}
          <div>
            <label htmlFor="city" className="text-sm text-muted block mb-1.5">City</label>
            <input
              id="city"
              type="text"
              value={profile?.city || ''}
              onChange={(e) => handleInputChange('city', e.target.value)}
              placeholder="San Francisco"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* Country */}
          <div>
            <label htmlFor="country" className="text-sm text-muted block mb-1.5">Country</label>
            <input
              id="country"
              type="text"
              value={profile?.country || ''}
              onChange={(e) => handleInputChange('country', e.target.value)}
              placeholder="United States"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>

          {/* LinkedIn URL */}
          <div className="sm:col-span-2">
            <label htmlFor="linkedin-url" className="text-sm text-muted block mb-1.5">LinkedIn URL</label>
            <input
              id="linkedin-url"
              type="url"
              value={profile?.linkedin_url || ''}
              onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/in/johndoe"
              className="w-full bg-bg2 text-fg1 rounded px-3 py-2 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <i className="bi-arrow-repeat icon-sm animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <i className="bi-check-lg icon-sm" />
                Save
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
}
